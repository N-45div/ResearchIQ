'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconSend, IconBrain, IconLoader2, IconAlertCircle, IconRobot, IconSearch, IconX, IconInfoCircle, IconBraces, IconUsers, IconMicrophone, IconUserCheck } from '@tabler/icons-react';
import { useAuth } from '@/app/context/AuthContext';
import styles from './ChatContent.module.css';
import dynamic from 'next/dynamic';

type Message = {
    id: string;
    role: 'user' | 'assistant' | 'human';
    content: string;
    provider?: string;
    toolCalls?: any[];
    threadId?: string;
    pendingHumanApproval?: boolean;
};

type UsageInfo = {
    count: number;
    limit: number;
    remaining: number;
};

// Agent modes
type AgentMode = 'advanced-agent' | 'voicexpert';

// Dynamically import the VapiVoiceAgent to avoid SSR issues
const VapiVoiceAgent = dynamic(() => import('./VapiVoiceAgent'), { ssr: false });

export default function ChatContent() {
    const [advancedAgentMessages, setAdvancedAgentMessages] = useState<Message[]>([]);
    const [voiceExpertMessages, setVoiceExpertMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agentMode, setAgentMode] = useState<AgentMode>('advanced-agent');
    const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
    const [showUsagePopup, setShowUsagePopup] = useState(false);
    // const [advancedAgentThreadId, setAdvancedAgentThreadId] = useState<string | null>(null); // Replaced by supervisorThreadId for this mode
    const [voiceExpertThreadId, setVoiceExpertThreadId] = useState<string | null>(null); // Keep for voicexpert if it has its own threads
    // const [pendingHumanApproval, setPendingHumanApproval] = useState<boolean>(false); // Replaced by currentInterruptionData
    const [isAgentProcessing, setIsAgentProcessing] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [supervisorThreadId, setSupervisorThreadId] = useState<string | null>(null);
    const [currentInterruptionData, setCurrentInterruptionData] = useState<any | null>(null);
    const { user, isLoading: isAuthLoading } = useAuth(); // Added isAuthLoading

    // Persistence states
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [conversationsList, setConversationsList] = useState<Array<{ conversation_id: string, title_preview?: string, updated_at: string }>>([]);
    const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
    const [saveError, setSaveError] = useState<string | null>(null);


    // Get current messages based on active mode
    const messages = agentMode === 'advanced-agent'
        ? advancedAgentMessages
        : voiceExpertMessages;

    const setMessages = agentMode === 'advanced-agent'
        ? setAdvancedAgentMessages
        : setVoiceExpertMessages;

    // Get current thread ID based on active mode
    // For advanced-agent, supervisorThreadId is now the primary thread ID.
    // currentThreadId and setCurrentThreadId might be deprecated or used differently if langChainAgent is still used.
    // For this refactor, focusing on supervisor, so advancedAgentThreadId is less relevant.
    // const currentThreadId = agentMode === 'advanced-agent'
    //     ? supervisorThreadId // Use supervisorThreadId when in advanced-agent mode
    //     : voiceExpertThreadId;

    // const setCurrentThreadId = agentMode === 'advanced-agent'
    //     ? setSupervisorThreadId
    //     : setVoiceExpertThreadId;

    // Import uuid for client-side ID generation
    // NOTE: This would typically be an import at the top of the file.
    // For this environment, we'll assume v4 is available if used.
    // import { v4 as uuidv4 } from 'uuid';


    // Scroll to bottom whenever messages change
    useEffect(() => {
        if (agentMode === 'advanced-agent' && messages.length > 0) { // Only scroll if there are messages
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, agentMode]);

    // Show usage popup whenever it updates
    useEffect(() => {
        if (usageInfo) {
            setShowUsagePopup(true);
            const timer = setTimeout(() => {
                setShowUsagePopup(false);
            }, 5000); // Hide after 5 seconds
            return () => clearTimeout(timer);
        }
    }, [usageInfo]);

    // Fetch conversation list on user load
    useEffect(() => {
        if (user && !isAuthLoading) {
            const fetchConversations = async () => {
                setIsLoadingConversations(true);
                try {
                    const response = await fetch('/api/chat/conversations');
                    if (!response.ok) {
                        throw new Error('Failed to fetch conversations');
                    }
                    const data = await response.json();
                    setConversationsList(data);
                    // Optionally auto-load the most recent conversation if none is active
                    // For now, user can click to load.
                    // if (data.length > 0 && !currentConversationId) {
                    //    loadSpecificConversation(data[0].conversation_id);
                    // }
                } catch (err) {
                    console.error("Error fetching conversations list:", err);
                    setError("Could not load conversation list.");
                } finally {
                    setIsLoadingConversations(false);
                }
            };
            fetchConversations();
        } else if (!user && !isAuthLoading) {
            // Clear list if user logs out
            setConversationsList([]);
            setCurrentConversationId(null);
            setMessages([]); // Clear messages if user logs out
        }
    }, [user, isAuthLoading]);


    const loadSpecificConversation = async (conversationId: string) => {
        if (!user) return;
        console.log("Loading conversation:", conversationId);
        setIsLoadingMessages(true);
        setMessages([]); // Clear existing messages
        setCurrentConversationId(conversationId);
        setSupervisorThreadId(null); // Reset supervisor thread as it's part of a specific convo
        setCurrentInterruptionData(null);
        setError(null);
        setSaveError(null);

        try {
            const response = await fetch(`/api/chat/conversations?conversationId=${conversationId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load conversation');
            }
            const fetchedMessages = await response.json();
            // Transform fetched messages if needed to match local Message type
            // For now, assume they are compatible or transformation is handled by backend.
            // The backend returns messages with 'id' (PK), 'role', 'content', 'provider', 'tool_calls', 'thread_id' (agent's thread)
            // Our local Message type has id (client-side Date.now string), role, content, provider, toolCalls, threadId (agent's thread)
            // We need to map the DB `id` (PK) to something, or generate new client IDs.
            // For simplicity, let's use DB id if available, or generate.
            // The backend also returns `message_order` which is important.
            const adaptedMessages: Message[] = fetchedMessages.map((msg: any) => ({
                id: msg.id?.toString() || `db-${msg.message_order}-${Date.now()}`, // Use DB id or generate
                role: msg.role,
                content: msg.content,
                provider: msg.provider,
                toolCalls: msg.tool_calls, // Ensure correct mapping
                threadId: msg.thread_id,   // Agent's thread_id from DB
                // pendingHumanApproval is a UI state, not directly from DB for old messages
            }));
            setMessages(adaptedMessages);

            // Try to find the latest supervisor thread ID from the loaded messages if applicable
            const lastSupervisorMessage = [...adaptedMessages].reverse().find(msg => msg.provider === 'Advanced Supervisor' || msg.provider === 'Supervisor (HITL)');
            if (lastSupervisorMessage && lastSupervisorMessage.threadId) {
                setSupervisorThreadId(lastSupervisorMessage.threadId);
            }

        } catch (err: any) {
            console.error("Error loading specific conversation:", err);
            setError(err.message || "Could not load conversation.");
            setCurrentConversationId(null); // Reset if load fails
        } finally {
            setIsLoadingMessages(false);
        }
    };

    const saveMessagesToDb = async (messagesToSave: Array<Partial<Message> & { message_order: number }>, convId: string) => {
        if (!user) return null;
        console.log("Saving messages to DB for conversation:", convId, messagesToSave);
        setSaveError(null);
        try {
            const response = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: convId,
                    messages: messagesToSave.map(m => ({
                        role: m.role,
                        content: m.content,
                        provider: m.provider,
                        message_order: m.message_order, // Now expecting this to be correctly set
                        tool_calls: m.toolCalls,
                        thread_id: m.threadId,
                    }))
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save messages');
            }
            const data = await response.json();
            console.log("Save response:", data);
            if (data.conversationId && data.conversationId !== currentConversationId) {
                 // This might happen if a new conv ID was generated by backend (though client generates now)
                setCurrentConversationId(data.conversationId);
            }
            // Re-fetch conversation list to show new/updated conversation
            if (user && !isAuthLoading) { // from useEffect
                 const fetchConv = async () => {
                    try {
                        const r = await fetch('/api/chat/conversations');
                        if(r.ok) setConversationsList(await r.json());
                    } catch (e) { console.error(e); }
                 }
                 fetchConv();
            }
            return data.conversationId;
        } catch (err: any) {
            console.error("Error saving messages:", err);
            setSaveError("Failed to save some messages. Please try again or start a new chat.");
            // Optionally, mark messages in UI as not saved
            return null;
        }
    };


    const fetchMultiAgentResults = async (query: string) => {
        try {
            // Get previous messages for context
            const previousMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const response = await fetch('/api/multi-agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    messages: previousMessages
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const customError: any = new Error(errorData.error || 'Failed to get multi-agent results');
                customError.response = { status: response.status, data: errorData };
                throw customError;
            }

            const data = await response.json();
            // Usage info is now handled by middleware in case of 429, not in successful responses.
            return data;
        } catch (error) {
            console.error('Error fetching multi-agent results:', error);
            throw error;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue.trim()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        setIsAgentProcessing(true);
        setError(null);
        setSaveError(null); // Clear save error on new submission

        // Determine conversation ID for saving
        let convIdToUse = currentConversationId;
        let isNewConversation = false;
        if (agentMode === 'advanced-agent' && !convIdToUse && !currentInterruptionData) {
            // Only generate new conv ID for advanced-agent if it's a truly new chat
            // and not resuming an interruption for a potentially already saved conversation.
            // If currentInterruptionData is present, supervisorThreadId should already be set from a previous interaction.
            convIdToUse = uuidv4();
            setCurrentConversationId(convIdToUse); // Set it for subsequent saves in this interaction
            isNewConversation = true;
            console.log("Generated new conversation ID:", convIdToUse);
        }


        // Save user message
        // Note: messages state (aliased to advancedAgentMessages) has not been updated with userMessage yet at this point.
        if (agentMode === 'advanced-agent' && convIdToUse && user) {
            const userMessageForApi = {
                role: userMessage.role,
                content: userMessage.content,
                provider: 'user', // Or derive from userMessage if it has a provider field
                message_order: advancedAgentMessages.length, // Order before adding current userMessage
                // id: userMessage.id, // Not needed for DB, DB generates its own PK
                threadId: null, // User messages don't originate from an agent's thread_id
            };
            // Not awaiting this to make UI appear faster. Error will be shown via saveError state.
            saveMessagesToDb([userMessageForApi], convIdToUse);
        }

        // UI update happens before API call logic for advanced-agent
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');


        try {
            if (agentMode === 'advanced-agent') {
                let payload;
                const MAX_HISTORY_MESSAGES = 5;

                // History for supervisor should be from the state *before* the current userMessage was added
                const historyForSupervisor = advancedAgentMessages
                    .slice(-MAX_HISTORY_MESSAGES)
                    .map(msg => ({ role: msg.role, content: msg.content }));


                if (currentInterruptionData) {
                    // This is a resume request for an interrupted task
                    console.log("Resuming supervisor with payload:", userMessage.content, "Thread ID:", supervisorThreadId);
                    payload = {
                        thread_id: supervisorThreadId, // Must have supervisorThreadId from interruption
                        resume_payload: userMessage.content, // User's input is the resume_payload
                    };
                } else {
                    // This is an initial request or a new query after completion
                    console.log("Sending new query to supervisor. Query:", userMessage.content, "Thread ID:", supervisorThreadId);
                    payload = {
                        query: userMessage.content,
                        messages: historyForSupervisor,
                        thread_id: supervisorThreadId, // Send existing supervisorThreadId if any, else backend generates
                    };
                }

                const response = await fetch('/api/advanced-supervisor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    const customError: any = new Error(errorData.error || 'Failed to get response from supervisor');
                    customError.response = { status: response.status, data: errorData };
                    throw customError;
                }

                const data = await response.json();
                console.log("Supervisor response data:", data);

                if (data.thread_id) {
                    setSupervisorThreadId(data.thread_id);
                }

                if (data.type === "interrupted") {
                    setCurrentInterruptionData(data.interrupt_data);
                    const interruptMessageContent = `Supervisor: Action [${data.interrupt_data?.tool_name || 'Unknown Tool'}] proposed with query: "${data.interrupt_data?.proposed_query || 'No query proposed'}". Please provide the query to use, or type your modification/approval. Type 'reject' to deny.`;
                    const interruptDisplayMessage: Message = {
                        id: `assistant-interrupt-${Date.now()}`,
                        role: 'assistant',
                        content: interruptMessageContent,
                        provider: data.provider || 'Supervisor (HITL)',
                        // threadId from supervisor is for the supervisor's own state, not this message specifically
                    };
                    setMessages(prevMessages => [...prevMessages, interruptDisplayMessage]);
                    setIsLoading(false);

                    // Save this interruption message
                    if (convIdToUse && user) {
                        const interruptMessageForApi = {
                            ...interruptDisplayMessage,
                            message_order: advancedAgentMessages.length, // Order after adding user message & this one
                        };
                        saveMessagesToDb([interruptMessageForApi], convIdToUse);
                    }

                } else { // Completed or other final state
                    setCurrentInterruptionData(null);
                    const finalAssistantMessage: Message = {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: data.text || "Task completed.",
                        provider: data.provider || 'Advanced Supervisor',
                        toolCalls: data.toolCalls,
                        threadId: data.thread_id,
                    };
                    setMessages(prevMessages => [...prevMessages, finalAssistantMessage]);
                    setIsLoading(false);

                    // Save assistant message
                    if (convIdToUse && user) {
                        const assistantMessageForApi = {
                            ...finalAssistantMessage,
                            message_order: advancedAgentMessages.length, // Order after adding user message & this one
                        };
                        saveMessagesToDb([assistantMessageForApi], convIdToUse);
                    }
                }

            } else if (agentMode === 'voicexpert') {
                const multiAgentResults = await fetchMultiAgentResults(userMessage.content);

                setTimeout(() => {
                    setMessages(prev => [...prev, {
                        id: `voicexpert-${Date.now()}`,
                        role: 'assistant',
                        content: multiAgentResults.text,
                        provider: 'VoiceXpert Comparison System',
                        toolCalls: multiAgentResults.toolCalls
                    }]);
                    setIsLoading(false); // Ensure loading is false after multi-agent call
                }, 500);
            }
        } catch (error: any) {
            // Common error handling for all agent modes
            if (error.response?.status === 429 && error.response?.data?.isLimited) {
                const limitMessageContent = user
                    ? "You have reached your request limit for this period."
                    : "You've reached your free request limit. Please [sign in](/auth/signin) to continue.";
                const rateLimitMessage: Message = {
                    id: `error-${Date.now()}`,
                    role: 'assistant',
                    content: limitMessageContent,
                    provider: 'System'
                };
                setMessages(prev => [...prev, rateLimitMessage]);
                setError(null);
            } else {
                const generalErrorMessage = agentMode === 'advanced-agent' ? 'Error interacting with supervisor' : 'Error in research';
                console.error(generalErrorMessage + ':', error);
                const errorMessage = error.response?.data?.error || (error instanceof Error ? error.message : `An error occurred during ${agentMode} processing`);
                setError(errorMessage);
            }
            setIsLoading(false); // Ensure loading is false on error
        } finally {
            setIsAgentProcessing(false);
        }
    };

    // Handle transcript from voice agent
    const handleVoiceTranscript = async (transcript: string) => {
        if (!transcript.trim() || isLoading) return;

        // Create user message from transcript (but don't store it)
        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: transcript.trim()
        };

        setIsLoading(true);
        setError(null);

        try {
            // Use the multi-agent API for the VoiceXpert mode
            const multiAgentResults = await fetchMultiAgentResults(userMessage.content);
            setIsLoading(false);

            // We don't store messages in VoiceXpert mode anymore
            // The VapiVoiceAgent component handles the conversation display
        } catch (error: any) {
             if (error.response?.status === 429 && error.response?.data?.isLimited) {
                // For VoiceXpert, we might not add to messages, but set a general error
                // Or, if there's a way to show a system message in Vapi's UI, use that.
                // For now, setting the general error state that is displayed in the UI.
                const limitMessageContent = user
                    ? "You have reached your request limit for this period."
                    : "You've reached your free request limit. Please sign in to continue.";
                setError(limitMessageContent);
            } else {
                console.error('Error in VoiceXpert research:', error);
                const errorMessage = error.response?.data?.error || (error instanceof Error ? error.message : 'An error occurred during VoiceXpert research');
                setError(errorMessage);
            }
            setIsLoading(false);
        }
    };

    // Render tool calls if present
    const renderToolCalls = (toolCalls: any[]) => {
        if (!toolCalls || toolCalls.length === 0) return null;

        return (
            <div className={styles.toolCallsContainer}>
                <h4 className={styles.toolCallsTitle}>Research Steps:</h4>
                <div className={styles.toolCallsList}>
                    {toolCalls.map((call, index) => (
                        <div key={index} className={styles.toolCall}>
                            <div className={styles.toolName}>
                                <span className={styles.toolIcon}>🔍</span>
                                {call.name}
                            </div>
                            {call.args && (
                                <div className={styles.toolArgs}>
                                    {Object.entries(call.args).map(([key, value]) => (
                                        <div key={key} className={styles.toolArg}>
                                            <span className={styles.argName}>{key}:</span>
                                            <span className={styles.argValue}>{String(value).substring(0, 100)}{String(value).length > 100 ? '...' : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Update the mode toggle handler
    const handleModeToggle = (mode: AgentMode) => {
        if (mode === agentMode) return;

        setAgentMode(mode);
        setError(null);
        setCurrentInterruptionData(null);
        // Reset conversation specific states ONLY if user intends to start fresh
        // setSupervisorThreadId(null);
        // setCurrentConversationId(null);
        // setMessages([]);
        setIsLoading(false);
        setIsAgentProcessing(false);
    };

    const handleNewChat = () => {
        setMessages([]);
        setCurrentConversationId(null);
        setSupervisorThreadId(null);
        setCurrentInterruptionData(null);
        setError(null);
        setSaveError(null);
        setInputValue(''); // Clear input field
        // Optionally, re-fetch conversations or select none
        // If conversationsList is displayed, user can click one to load.
        // Or auto-select the first one if that's desired after clearing.
        console.log("New chat started");
    };

    return (
        <div className={styles.chatLayout}> {/* Main layout container */}
            {/* Sidebar for Conversations List - Only shown for authenticated users in advanced-agent mode */}
            {user && agentMode === 'advanced-agent' && (
                <div className={styles.sidebar}>
                    <button onClick={handleNewChat} className={styles.newChatButton}>New Chat</button>
                    {isLoadingConversations && <p className={styles.loadingText}>Loading conversations...</p>}
                    {conversationsList.length > 0 ? (
                        <ul className={styles.conversationList}>
                            {conversationsList.map(convo => (
                                <li
                                    key={convo.conversation_id}
                                    onClick={() => loadSpecificConversation(convo.conversation_id)}
                                    className={`${styles.conversationItem} ${currentConversationId === convo.conversation_id ? styles.activeConversation : ''}`}
                                >
                                    <p className={styles.convoTitle}>{convo.title_preview || "Untitled Chat"}</p>
                                    <p className={styles.convoTimestamp}>{new Date(convo.updated_at).toLocaleDateString()}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        !isLoadingConversations && <p className={styles.noConversationsText}>No past conversations.</p>
                    )}
                </div>
            )}

            <div className={styles.chatContainer}> {/* Existing chat container */}
                {/* Usage Popup */}
                <AnimatePresence>
                {showUsagePopup && usageInfo && (
                    <motion.div
                        className={styles.usagePopup}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className={styles.usagePopupContent}>
                            <IconInfoCircle size={18} className={styles.usagePopupIcon} />
                            <div className={styles.usagePopupText}>
                                <span className={styles.usagePopupTitle}>Usage Limit</span>
                                <span>
                                    {usageInfo.remaining} of {usageInfo.limit} requests remaining
                                    {!user && usageInfo.remaining < 2 && (
                                        <span className={styles.usagePopupWarning}> - Limited requests available</span>
                                    )}
                                </span>
                            </div>
                            <button
                                className={styles.usagePopupClose}
                                onClick={() => setShowUsagePopup(false)}
                            >
                                <IconX size={14} />
                            </button>
                        </div>
                        <div
                            className={styles.usagePopupProgress}
                            style={{
                                width: `${(usageInfo.count / usageInfo.limit) * 100}%`,
                                backgroundColor: usageInfo.remaining < 2 ? 'var(--error-color)' : 'var(--accent-primary)'
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mode toggle */}
            <div className={styles.modeToggleContainer}>
                <div className={styles.modeToggle}>
                    <button
                        className={`${styles.modeButton} ${agentMode === 'advanced-agent' ? styles.modeButtonActive : ''}`}
                        onClick={() => handleModeToggle('advanced-agent')}
                    >
                        <IconUsers size={18} />
                        <span>Advanced Agent</span>
                    </button>
                    <button
                        className={`${styles.modeButton} ${agentMode === 'voicexpert' ? styles.modeButtonActive : ''}`}
                        onClick={() => handleModeToggle('voicexpert')}
                    >
                        <IconMicrophone size={18} />
                        <span>VoiceXpert</span>
                    </button>
                </div>
            </div>

            {/* Chat messages container */}
            <div className={styles.messagesContainer}>
                <div className={styles.messagesWrapper}>
                    {isLoadingMessages && agentMode === 'advanced-agent' && (
                        <div className={styles.loadingMessagesIndicator}>
                            <IconLoader2 className={styles.loadingIcon} size={24} />
                            <p>Loading messages...</p>
                        </div>
                    )}
                    {/* Render empty state or messages based on agent mode */}
                    {agentMode === 'voicexpert' ? (
                        // VoiceXpert mode UI
                        <div className={styles.emptyState}>
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className={styles.iconWrapper}><IconMicrophone size={64} className={styles.brainIcon} /></motion.div>
                            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className={styles.emptyStateTitle}>VoiceXpert Comparison</motion.h2>
                            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className={styles.emptyStateText}>Use your voice to ask questions to our expert comparison system...</motion.p>
                            {!user && (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className={styles.usageLimitNote}><IconInfoCircle size={16} /><span>Free users get 3 research requests.</span></motion.div>)}
                            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.4 }} className={styles.centeredVoiceButton}><VapiVoiceAgent onTranscript={handleVoiceTranscript} centeredMode={true} /></motion.div>
                            {error && (<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={styles.errorRow}><div className={styles.errorBox}><IconAlertCircle size={18} className={styles.errorIcon} /><span>{error}</span></div></motion.div>)}
                        </div>
                    ) : (
                        // Advanced Agent mode UI
                        !isLoadingMessages && messages.length === 0 ? (
                            <div className={styles.emptyState}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className={styles.iconWrapper}
                                >
                                    <IconUsers size={64} className={styles.brainIcon} />
                                </motion.div>
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.1 }}
                                    className={styles.emptyStateTitle}
                                >
                                    Advanced Multi-Agent Research
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.2 }}
                                    className={styles.emptyStateText}
                                >
                                    Ask a question to our advanced multi-agent system with specialized research and reasoning capabilities.
                                    The system will automatically use Wikipedia search, Google Scholar, and logical reasoning agents based on your query type.
                                </motion.p>
                                {!user && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.3 }}
                                        className={styles.usageLimitNote}
                                    >
                                        <IconInfoCircle size={16} />
                                        <span>Free users get 3 research requests.</span>
                                    </motion.div>
                                )}
                            </div>
                        ) : (
                            <div className={styles.messagesList}>
                                {messages.map((message) => (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`${styles.messageRow} ${message.role === 'user'
                                            ? styles.userMessageRow
                                            : message.role === 'human'
                                                ? styles.humanMessageRow
                                                : styles.assistantMessageRow
                                            }`}
                                    >
                                        className={`${styles.messageBox} ${message.role === 'user' ? styles.userMessage : message.role === 'human' ? styles.humanMessage : styles.assistantMessage}`}>
                                            <div className={styles.messageContent}>{message.content}</div>
                                            {message.provider && (<div className={styles.messageProvider}>Source: {message.provider}</div>)}
                                            {message.toolCalls && renderToolCalls(message.toolCalls)}
                                        </div>
                                    </motion.div>
                                ))}
                                {isLoading && !isAgentProcessing && !isLoadingMessages && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={styles.loadingRow}>
                                        <div className={styles.loadingBox}><IconLoader2 className={styles.loadingIcon} size={18} /><span>Processing...</span></div>
                                    </motion.div>
                                )}
                                {isAgentProcessing && !isLoadingMessages && (
                                    <motion.div key="thinking-indicator" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`${styles.messageRow} ${styles.assistantMessageRow}`}>
                                        <div className={`${styles.messageBox} ${styles.assistantMessage} bg-gray-700 animate-pulse`}><div className={styles.messageContent}><p className="text-sm">Thinking...</p></div></div>
                                    </motion.div>
                                )}
                                {error && !isLoadingMessages && ( // Only show general error if not loading messages
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={styles.errorRow}
                                    >
                                        <div className={styles.errorBox}>
                                            <IconAlertCircle size={18} className={styles.errorIcon} />
                                            <span>{error}</span>
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Input form - only show for Advanced Agent mode */}
            {agentMode !== 'voicexpert' && (
                <div className={styles.inputContainer}>
                    <div className={styles.inputWrapper}>
                        <form onSubmit={handleSubmit} className={styles.inputForm}>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Ask the advanced multi-agent system..."
                                disabled={isLoading || !!currentInterruptionData} // Disable input if loading or waiting for HITL response
                                className={styles.input}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !inputValue.trim() || (agentMode === 'advanced-agent' && !!currentInterruptionData && !inputValue.trim())}
                                className={styles.sendButton}
                            >
                                <IconSend size={20} />
                            </button>
                        </form>
                        <div className={styles.inputStatus}>
                            {agentMode === 'advanced-agent' && currentInterruptionData ? (
                                <span className={styles.pendingApprovalText}>
                                    Human input required for: {currentInterruptionData.tool_name || 'task'}.
                                    Proposed: "{currentInterruptionData.proposed_query?.substring(0, 50) || 'N/A'}{currentInterruptionData.proposed_query?.length > 50 ? "..." : ""}"
                                </span>
                            ) : saveError ? (
                                <span className={styles.errorText}>{saveError}</span>
                            ) : !user ? (
                                <span>You have limited free requests available.</span>
                            ) : (
                                currentConversationId ? <span>Conversation active.</span> : <span>Start a new chat or load one.</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 
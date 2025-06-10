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
    const { user } = useAuth();

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


    // Scroll to bottom whenever messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

        try {
            if (agentMode === 'advanced-agent') {
                let payload;
                const MAX_HISTORY_MESSAGES = 5; // Max number of recent messages to send

                const historyForSupervisor = messages
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
                    };
                    setMessages(prevMessages => [...prevMessages, interruptDisplayMessage]);
                    setIsLoading(false); // Stop general loading, wait for human input
                } else { // Completed or other final state
                    setCurrentInterruptionData(null); // Clear any previous interruption
                    const finalAssistantMessage: Message = {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: data.text || "Task completed.",
                        provider: data.provider || 'Advanced Supervisor',
                        toolCalls: data.toolCalls, // If supervisor provides this
                        // threadId: data.thread_id, // This is supervisor's thread_id, already set
                    };
                    setMessages(prevMessages => [...prevMessages, finalAssistantMessage]);
                    setIsLoading(false);
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
        // Clear HITL state when switching modes
        setCurrentInterruptionData(null);
        // setSupervisorThreadId(null); // Optionally reset supervisor thread on mode switch
        setIsLoading(false);
        setIsAgentProcessing(false);
    };

    return (
        <div className={styles.chatContainer}>
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
                    {agentMode === 'voicexpert' ? (
                        // VoiceXpert mode - only show the voice interface
                        <div className={styles.emptyState}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className={styles.iconWrapper}
                            >
                                <IconMicrophone size={64} className={styles.brainIcon} />
                            </motion.div>
                            <motion.h2
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className={styles.emptyStateTitle}
                            >
                                VoiceXpert Comparison
                            </motion.h2>
                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className={styles.emptyStateText}
                            >
                                Use your voice to ask questions to our expert comparison system that uses multiple specialized agents to research your topic and explicitly highlight contradictions between different sources.
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
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                                className={styles.centeredVoiceButton}
                            >
                                <VapiVoiceAgent onTranscript={handleVoiceTranscript} centeredMode={true} />
                            </motion.div>
                            {error && (
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
                        </div>
                    ) : (
                        // Advanced Agent mode
                        messages.length === 0 ? (
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
                                        <div className={`${styles.messageBox} ${message.role === 'user'
                                            ? styles.userMessage
                                            : message.role === 'human'
                                                ? styles.humanMessage
                                                : styles.assistantMessage
                                            }`}>
                                            <div className={styles.messageContent}>{message.content}</div>
                                            {message.provider && (
                                                <div className={styles.messageProvider}>
                                                    Source: {message.provider}
                                                </div>
                                            )}
                                            {message.toolCalls && renderToolCalls(message.toolCalls)}
                                            {/* renderHumanApprovalButtons removed as HITL prompt is now a message */}
                                        </div>
                                    </motion.div
                                    >
                                ))}
                                {/* General loading spinner, distinct from "Thinking..." */}
                                {isLoading && !isAgentProcessing && ( // Show general spinner if not showing "Thinking..."
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={styles.loadingRow}
                                    >
                                        <div className={styles.loadingBox}>
                                            <IconLoader2 className={styles.loadingIcon} size={18} />
                                            <span>
                                                Processing... {/* More generic than "Advanced agent is analyzing..." */}
                                            </span>
                                        </div>
                                    </motion.div>
                                )}
                                {/* "Thinking..." message */}
                                {isAgentProcessing && (
                                    <motion.div
                                        key="thinking-indicator"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`${styles.messageRow} ${styles.assistantMessageRow}`}
                                    >
                                        <div className={`${styles.messageBox} ${styles.assistantMessage} bg-gray-700 animate-pulse`}>
                                            <div className={styles.messageContent}>
                                                <p className="text-sm">Thinking...</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                                {error && (
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
                            ) : !user ? (
                                <span>You have limited free requests available.</span>
                            ) : (
                                <span>Research context is maintained per session.</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 
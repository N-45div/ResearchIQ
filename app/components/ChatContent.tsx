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
    const [advancedAgentThreadId, setAdvancedAgentThreadId] = useState<string | null>(null);
    const [voiceExpertThreadId, setVoiceExpertThreadId] = useState<string | null>(null);
    const [pendingHumanApproval, setPendingHumanApproval] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();

    // Get current messages based on active mode
    const messages = agentMode === 'advanced-agent'
        ? advancedAgentMessages
        : voiceExpertMessages;

    const setMessages = agentMode === 'advanced-agent'
        ? setAdvancedAgentMessages
        : setVoiceExpertMessages;

    // Get current thread ID based on active mode
    const currentThreadId = agentMode === 'advanced-agent'
        ? advancedAgentThreadId
        : voiceExpertThreadId;

    const setCurrentThreadId = agentMode === 'advanced-agent'
        ? setAdvancedAgentThreadId
        : setVoiceExpertThreadId;

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

    const fetchLangChainAgentResults = async (query: string) => {
        try {
            // Get previous messages for context
            const previousMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const response = await fetch('/api/langchain-agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    messages: previousMessages,
                    threadId: currentThreadId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get advanced agent results');
            }

            const data = await response.json();
            if (data.usage) {
                setUsageInfo(data.usage);
            }
            if (data.threadId) {
                setCurrentThreadId(data.threadId);
            }
            return data;
        } catch (error) {
            console.error('Error fetching LangChain agent results:', error);
            throw error;
        }
    };

    const fetchReasoningAgentResults = async (query: string) => {
        try {
            // Get previous messages for context
            const previousMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const response = await fetch('/api/reasoning-agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query,
                    messages: previousMessages,
                    threadId: currentThreadId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to get reasoning agent results');
            }

            const data = await response.json();
            if (data.usage) {
                setUsageInfo(data.usage);
            }
            if (data.threadId) {
                setCurrentThreadId(data.threadId);
            }
            return data;
        } catch (error) {
            console.error('Error fetching reasoning agent results:', error);
            throw error;
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
                throw new Error(errorData.error || 'Failed to get multi-agent results');
            }

            const data = await response.json();
            if (data.usage) {
                setUsageInfo(data.usage);
            }
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
        setError(null);

        try {
            if (agentMode === 'advanced-agent') {
                // Determine if we should use reasoning agent based on query complexity
                // Keywords that might indicate need for logical reasoning
                const reasoningKeywords = [
                    'reasoning', 'logic', 'analyze', 'fallacy', 'argument', 'evaluate',
                    'critical thinking', 'contradiction', 'syllogism', 'premise', 'conclusion',
                    'inference', 'deduction', 'induction', 'valid', 'invalid', 'sound', 'unsound',
                    'why', 'how', 'explain', 'compare', 'contrast', 'evaluate', 'assess'
                ];

                // Check if query contains reasoning keywords
                const needsReasoning = reasoningKeywords.some(keyword =>
                    userMessage.content.toLowerCase().includes(keyword.toLowerCase())
                );

                // Use either the reasoning agent or standard LangChain agent
                const results = needsReasoning
                    ? await fetchReasoningAgentResults(userMessage.content)
                    : await fetchLangChainAgentResults(userMessage.content);

                // Check if the response requires human approval
                const needsHumanApproval = results.text.includes('Please review this action before proceeding:');

                setTimeout(() => {
                    setMessages(prev => [...prev, {
                        id: `agent-${Date.now()}`,
                        role: 'assistant',
                        content: results.text,
                        provider: needsReasoning ? 'Advanced Agent (Reasoning)' : 'Advanced Agent (Research)',
                        toolCalls: results.toolCalls,
                        threadId: results.threadId,
                        pendingHumanApproval: needsHumanApproval
                    }]);
                    setPendingHumanApproval(needsHumanApproval);
                    setIsLoading(false);
                }, 500);
            } else if (agentMode === 'voicexpert') {
                // Use the multi-agent API for the VoiceXpert mode
                const multiAgentResults = await fetchMultiAgentResults(userMessage.content);

                setTimeout(() => {
                    setMessages(prev => [...prev, {
                        id: `voicexpert-${Date.now()}`,
                        role: 'assistant',
                        content: multiAgentResults.text,
                        provider: 'VoiceXpert Comparison System',
                        toolCalls: multiAgentResults.toolCalls
                    }]);
                    setIsLoading(false);
                }, 500);
            }
        } catch (error) {
            console.error('Error in research:', error);
            setError(error instanceof Error ? error.message : 'An error occurred during research');
            setIsLoading(false);
        }
    };

    // Handle human-in-the-loop interaction
    const handleHumanInteraction = async (action: string) => {
        if (!currentThreadId) return;

        setIsLoading(true);
        setPendingHumanApproval(false);

        try {
            const response = await fetch('/api/langchain-agent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    threadId: currentThreadId,
                    command: { type: action }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process human interaction');
            }

            const data = await response.json();

            // Add human action message
            setMessages(prev => [...prev, {
                id: `human-${Date.now()}`,
                role: 'human',
                content: `Human ${action === 'accept' ? 'approved' : 'rejected'} the action.`,
                provider: 'Human-in-the-loop',
            }]);

            // Add the response to messages
            setTimeout(() => {
                setMessages(prev => [...prev, {
                    id: `interaction-${Date.now()}`,
                    role: 'assistant',
                    content: data.text,
                    provider: 'LangChain Research Agent',
                    threadId: data.threadId
                }]);
                setIsLoading(false);

                // Update thread ID if a new one was returned
                if (data.threadId) {
                    setCurrentThreadId(data.threadId);
                }
            }, 500);

        } catch (error) {
            console.error('Error in human interaction:', error);
            setError(error instanceof Error ? error.message : 'An error occurred during human interaction');
            setIsLoading(false);
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
        } catch (error) {
            console.error('Error in VoiceXpert research:', error);
            setError(error instanceof Error ? error.message : 'An error occurred during VoiceXpert research');
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

    // Render human-in-the-loop approval buttons if needed
    const renderHumanApprovalButtons = (message: Message) => {
        if (!message.pendingHumanApproval) {
            return null;
        }

        return (
            <div className={styles.humanApprovalContainer}>
                <button
                    onClick={() => handleHumanInteraction('accept')}
                    className={styles.approveButton}
                >
                    <IconUserCheck size={16} />
                    Approve
                </button>
                <button
                    onClick={() => handleHumanInteraction('reject')}
                    className={styles.rejectButton}
                >
                    <IconX size={16} />
                    Reject
                </button>
            </div>
        );
    };

    // Update the mode toggle handler
    const handleModeToggle = (mode: AgentMode) => {
        // Don't do anything if we're already in this mode
        if (mode === agentMode) return;

        setAgentMode(mode);
        setError(null);
        setPendingHumanApproval(false);
        setIsLoading(false);
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
                                            {renderHumanApprovalButtons(message)}
                                        </div>
                                    </motion.div>
                                ))}
                                {isLoading && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={styles.loadingRow}
                                    >
                                        <div className={styles.loadingBox}>
                                            <IconLoader2 className={styles.loadingIcon} size={18} />
                                            <span>
                                                Advanced agent is analyzing your query...
                                            </span>
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
                                disabled={isLoading || pendingHumanApproval}
                                className={styles.input}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !inputValue.trim() || pendingHumanApproval}
                                className={styles.sendButton}
                            >
                                <IconSend size={20} />
                            </button>
                        </form>
                        <div className={styles.inputStatus}>
                            {pendingHumanApproval ? (
                                <span className={styles.pendingApprovalText}>Human approval required before continuing</span>
                            ) : !user ? (
                                <span>You have 3 research requests available</span>
                            ) : (
                                <span>Your research is being saved automatically</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 
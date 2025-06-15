"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconSend, IconBrain, IconLoader2, IconAlertCircle, IconUsers, IconMicrophone, IconCopy } from "@tabler/icons-react";
import { useAuth } from "../context/Authcontext";
import styles from "./ChatContent.module.css";
import dynamic from "next/dynamic";

const VapiVoiceAgent = dynamic(() => import("./VapiVoiceAgent"), { ssr: false });

type Message = {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
  provider?: string;
};

type AgentMode = "research-agent" | "voicexpert";

export default function ChatContent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<AgentMode>("research-agent");
  const { user } = useAuth();
  const [isAgentProcessing, setIsAgentProcessing] = useState<boolean>(false);
  const [thinkingStage, setThinkingStage] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Thinking stages
  const thinkingMessages = [
    "Thinking...",
    "Accumulating data from multiple LLMs...",
    "Analyzing responses...",
    "Processing insights...",
    "Synthesizing knowledge...",
    "Finalizing analysis...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAgentProcessing) {
      interval = setInterval(() => {
        setThinkingStage((prev) => (prev + 1) % thinkingMessages.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isAgentProcessing]);

  useEffect(() => {
    if (agentMode === "research-agent" && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, agentMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userInputContent = inputValue.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInputContent,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setIsAgentProcessing(true);
    setError(null);

    try {
      if (agentMode === "research-agent") {
        console.log(`Sending request to /api/research with query: ${userInputContent} at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: userInputContent }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Received response from /api/research:`, data);

        const researchMessage: Message = {
          id: `research-${Date.now()}`,
          role: "assistant",
          content: data.result,
          provider: "Multi-LLM Research Agent",
        };
        setMessages(prev => [...prev, researchMessage]);
      } else if (agentMode === "voicexpert") {
        const voiceMessage: Message = {
          id: `voicexpert-${Date.now()}`,
          role: "assistant",
          content: "This is a mock voice expert response.",
          provider: "VoiceXpert Comparison System",
        };
        setMessages(prev => [...prev, voiceMessage]);
      }
    } catch (error: any) {
      console.error(`Error in handleSubmit at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}:`, error);
      setError(`Failed to process request: ${error.message || "Unknown error"}. Check console for details.`);
    } finally {
      setIsLoading(false);
      setIsAgentProcessing(false);
      setThinkingStage(0);
    }
  };

  const handleVoiceTranscript = async (transcript: string) => {
    if (!transcript.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: transcript.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const voiceMessage: Message = {
        id: `voicexpert-${Date.now()}`,
        role: "assistant",
        content: "This is a mock voice expert response.",
        provider: "VoiceXpert Comparison System",
      };
      setMessages(prev => [...prev, voiceMessage]);
    } catch (error: any) {
      console.error(`Error in handleVoiceTranscript at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}:`, error);
      setError(`Failed to process voice input: ${error.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("Text copied to clipboard!");
    }).catch(err => {
      console.error(`Failed to copy text at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}:`, err);
      setError("Failed to copy to clipboard. Please try again.");
    });
  };

  const handleModeToggle = (mode: AgentMode) => {
    if (mode === agentMode) return;
    setAgentMode(mode);
    setError(null);
    setIsLoading(false);
    setIsAgentProcessing(false);
  };

  const handleNewChat = () => {
    setMessages([]);
    setError(null);
    setInputValue("");
    console.log(`New chat started at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
  };

  return (
    <div className={styles.chatLayout}>
      {user && agentMode === "research-agent" && (
        <div className={styles.sidebar}>
          <button onClick={handleNewChat} className={styles.newChatButton}>
            New Chat
          </button>
        </div>
      )}

      <div className={styles.chatContainer}>
        <div className={styles.modeToggleContainer}>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeButton} ${agentMode === "research-agent" ? styles.modeButtonActive : ""}`}
              onClick={() => handleModeToggle("research-agent")}
            >
              <IconUsers size={18} />
              <span>Research Agent</span>
            </button>
            <button
              className={`${styles.modeButton} ${agentMode === "voicexpert" ? styles.modeButtonActive : ""}`}
              onClick={() => handleModeToggle("voicexpert")}
            >
              <IconMicrophone size={18} />
              <span>VoiceXpert</span>
            </button>
          </div>
        </div>

        <div className={styles.messagesContainer}>
          <div className={styles.messagesWrapper}>
            {agentMode === "voicexpert" ? (
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
                  Use your voice to ask questions to our expert comparison system...
                </motion.p>
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
            ) : messages.length === 0 ? (
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
                  Research Agent
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className={styles.emptyStateText}
                >
                  Ask a question to assist in writing your next research article across any domain.
                </motion.p>
              </div>
            ) : (
              <div className={styles.messagesList}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`${styles.messageRow} ${message.role === "user"
                      ? styles.userMessageRow
                      : styles.assistantMessageRow
                      }`}
                  >
                    <div
                      className={`${styles.messageBox} ${message.role === "user"
                        ? styles.userMessage
                        : styles.assistantMessage
                        }`}
                    >
                      <div className={styles.messageContent}>
                        {message.role === "assistant" && message.provider === "Multi-LLM Research Agent" ? (
                          <>
                            <pre className={styles.plainText}>{message.content}</pre>
                            <button
                              className={styles.copyButton}
                              onClick={() => handleCopyToClipboard(message.content)}
                            >
                              <IconCopy size={18} /> Copy to Clipboard
                            </button>
                          </>
                        ) : (
                          message.content
                        )}
                      </div>
                      {message.provider && <div className={styles.messageProvider}>Source: {message.provider}</div>}
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
                      <span>Processing...</span>
                    </div>
                  </motion.div>
                )}
                {isAgentProcessing && (
                  <motion.div
                    key="thinking-indicator"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.5 }}
                    className={`${styles.messageRow} ${styles.assistantMessageRow}`}
                  >
                    <div className={`${styles.messageBox} ${styles.assistantMessage} ${styles.thinkingBox}`}>
                      <div className={styles.thinkingContent}>
                        <IconBrain size={20} className={styles.thinkingIcon} />
                        <motion.span
                          key={thinkingStage}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.5 }}
                          className={styles.thinkingText}
                        >
                          {thinkingMessages[thinkingStage]}
                        </motion.span>
                        <motion.div
                          className={styles.thinkingPulse}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
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
            )}
          </div>
        </div>

        {agentMode !== "voicexpert" && (
          <div className={styles.inputContainer}>
            <div className={styles.inputWrapper}>
              <form onSubmit={handleSubmit} className={styles.inputForm}>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask a research question..."
                  disabled={isLoading}
                  className={styles.input}
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className={styles.sendButton}
                >
                  <IconSend size={20} />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const handleModeToggle = (mode: AgentMode) => {
  if (mode === agentMode) return;
  setAgentMode(mode);
  setError(null);
  setIsLoading(false);
  setIsAgentProcessing(false);
};

const handleNewChat = () => {
  setMessages([]);
  setError(null);
  setInputValue("");
  console.log(`New chat started at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
};
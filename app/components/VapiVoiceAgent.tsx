import { useEffect, useRef, useState, useCallback } from 'react';
import Vapi from '@vapi-ai/web';
import { useAuth } from '@/app/context/AuthContext'; // Import useAuth

const publicApiKey = process.env.NEXT_PUBLIC_VAPI_API_KEY || '';
const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || '';

// Maximum number of reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 3;
// Cooldown period between initialization attempts (ms)
const INIT_COOLDOWN = 1000;

interface VapiVoiceAgentProps {
    onTranscript: (transcript: string) => void;
    centeredMode?: boolean;
}

export default function VapiVoiceAgent({ onTranscript, centeredMode = false }: VapiVoiceAgentProps) {
    const vapiRef = useRef<any>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [volume, setVolume] = useState(0);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [pulseAnimation, setPulseAnimation] = useState(false);
    const [callSummary, setCallSummary] = useState<string | null>(null);
    const [showSummary, setShowSummary] = useState(false);
    const { user } = useAuth(); // Get user from AuthContext
    const callTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer ref

    // Track conversation for summary
    const conversationRef = useRef<{ user: string[], assistant: string[] }>({
        user: [],
        assistant: []
    });

    // Initialize Vapi instance with proper cleanup and initialization check
    const initializeVapi = useCallback(() => {
        if (isInitializing) return;
        setIsInitializing(true);

        try {
            // Clean up any existing instance
            if (vapiRef.current) {
                try {
                    vapiRef.current.stop();
                    if (vapiRef.current.removeAllListeners) {
                        vapiRef.current.removeAllListeners();
                    }
                } catch (e) {
                    console.log('Cleanup error:', e);
                }
            }

            // Create a new instance with proper error handling
            console.log('Initializing new Vapi instance');
            vapiRef.current = new Vapi(publicApiKey);
            setIsInitialized(true);
            setupEventListeners();
        } catch (e) {
            console.error('Vapi initialization error:', e);
            setError(`Failed to initialize voice assistant: ${(e as any)?.message || JSON.stringify(e)}`);
            setIsInitialized(false);

            // Try again after cooldown
            setTimeout(() => {
                setIsInitializing(false);
            }, INIT_COOLDOWN);
        }

        setIsInitializing(false);
    }, []);

    // Generate a summary from the conversation
    const generateSummary = useCallback(() => {
        const userQuestions = conversationRef.current.user;
        const assistantResponses = conversationRef.current.assistant;

        if (userQuestions.length === 0) {
            return "No conversation occurred during this session.";
        }

        let summary = "## Research Session Summary\n\n";

        // Add main topics/questions
        summary += "### Main Topics Discussed:\n";
        userQuestions.slice(0, 3).forEach((question, index) => {
            if (question.trim()) {
                summary += `${index + 1}. ${question.trim()}\n`;
            }
        });

        // Add key findings if we have assistant responses
        if (assistantResponses.length > 0) {
            summary += "\n### Key Findings:\n";
            // Extract what seem to be the most important sentences from responses
            const keyFindings = assistantResponses
                .join(' ')
                .split('.')
                .filter(sentence =>
                    sentence.length > 30 &&
                    (sentence.includes("research") ||
                        sentence.includes("study") ||
                        sentence.includes("found") ||
                        sentence.includes("important") ||
                        sentence.includes("significant"))
                )
                .slice(0, 3);

            keyFindings.forEach((finding, index) => {
                if (finding.trim()) {
                    summary += `- ${finding.trim()}.\n`;
                }
            });
        }

        summary += "\n### Session Complete";
        return summary;
    }, []);

    // Setup event listeners for the Vapi instance
    const setupEventListeners = useCallback(() => {
        if (!vapiRef.current) return;

        const vapi = vapiRef.current;

        // Remove any existing listeners first to prevent duplicates
        if (vapi.removeAllListeners) {
            vapi.removeAllListeners();
        }

        vapi.on('call-start', () => {
            console.log('Call started successfully');
            setIsConnected(true);
            setError(null);
            setIsReconnecting(false);
            setReconnectAttempts(0);
            setPulseAnimation(true);
            setShowSummary(false);
            setCallSummary(null);

            // Reset conversation tracking
            conversationRef.current = {
                user: [],
                assistant: []
            };

            // Clear any existing timer
            if (callTimerRef.current) {
                clearTimeout(callTimerRef.current);
                callTimerRef.current = null;
            }

            // Set new timer based on user auth state
            const durationLimitSeconds = user ? 300 : 120; // 5 mins for logged-in, 2 mins for anonymous
            const durationLimitMilliseconds = durationLimitSeconds * 1000;
            console.log(`Vapi call started. Setting duration limit: ${durationLimitSeconds} seconds`);

            callTimerRef.current = setTimeout(() => {
                const vapiInstance = vapiRef.current;
                if (vapiInstance && isConnected) { // Check isConnected state
                    console.log(`Vapi call duration limit (${durationLimitSeconds}s) reached. Ending call.`);
                    vapiInstance.stop();
                    setError(`Call automatically ended after ${durationLimitSeconds / 60} minutes due to time limit.`);
                }
            }, durationLimitMilliseconds);
        });

        vapi.on('call-end', (reason: any) => {
            console.log('Call ended, reason:', reason);
            // Clear timer when call ends
            if (callTimerRef.current) {
                clearTimeout(callTimerRef.current);
                callTimerRef.current = null;
                console.log("Call ended, timer cleared.");
            }
            setIsConnected(false);
            setIsSpeaking(false);
            setIsListening(false);
            setPulseAnimation(false);

            // Generate summary when call ends normally
            if (!reason || (typeof reason === 'string' && reason.includes('ended'))) {
                const summary = generateSummary();
                setCallSummary(summary);
                setShowSummary(true);
            }

            // Handle unexpected disconnections
            if (reason && typeof reason === 'string') {
                if (reason.includes('ejection') || reason.includes('ended')) {
                    console.log('Call ended normally or due to ejection');
                    // This is normal behavior for Vapi when a call ends
                    // Don't show error, just show summary
                    const summary = generateSummary();
                    setCallSummary(summary);
                    setShowSummary(true);
                } else if (reason.includes('error')) {
                    setError(`Connection error: ${reason}`);
                    handleReconnect();
                }
            }
        });

        vapi.on('speech-start', () => {
            setIsSpeaking(true);
            setIsListening(false);
            setPulseAnimation(true);
        });

        vapi.on('speech-end', () => {
            setIsSpeaking(false);
            setPulseAnimation(false);
        });

        vapi.on('volume-level', (vol: number) => {
            setVolume(vol);
            // Pulse animation based on volume
            setPulseAnimation(vol > 0.1);
        });

        vapi.on('message', (message: any) => {
            if (message.type === 'transcript') {
                setIsListening(true);
                setCurrentTranscript(message.transcript);
                setPulseAnimation(true);

                // Send transcript to parent component
                if (onTranscript && message.transcript) {
                    onTranscript(message.transcript);
                }

                // Track user messages for summary
                conversationRef.current.user.push(message.transcript);
            } else if (message.type === 'assistant') {
                setIsSpeaking(true);
                setIsListening(false);
                setPulseAnimation(true);

                // Track assistant responses for summary
                conversationRef.current.assistant.push(message.content);
            }
        });

        vapi.on('error', (err: any) => {
            const errorMsg = (err as any)?.message || JSON.stringify(err);
            console.error('Vapi error:', errorMsg);

            // Handle ejection errors differently - these are normal call endings
            if (errorMsg.includes('ejection') || errorMsg.includes('Meeting has ended')) {
                console.log('Call ended normally via ejection');
                const summary = generateSummary();
                setCallSummary(summary);
                setShowSummary(true);
                return;
            }

            setError(errorMsg);

            // Handle specific errors
            if (errorMsg.includes('disconnect')) {
                handleReconnect();
            } else if (errorMsg.includes('initialize') || errorMsg.includes('init')) {
                // Reinitialize on initialization errors
                setTimeout(() => {
                    initializeVapi();
                }, INIT_COOLDOWN);
            }
        });
    }, [onTranscript, generateSummary]);

    // Initialize on component mount
    useEffect(() => {
        initializeVapi();

        return () => {
            // Clean up on unmount
            if (vapiRef.current) {
                try {
                    vapiRef.current.stop();
                    if (vapiRef.current.removeAllListeners) {
                        vapiRef.current.removeAllListeners();
                    }
                } catch (e) {
                    console.log('Cleanup error on unmount:', e);
                }
            }
            // Clear timer on unmount
            if (callTimerRef.current) {
                clearTimeout(callTimerRef.current);
                callTimerRef.current = null;
                console.log("Component unmounted, timer cleared.");
            }
        };
    }, [initializeVapi]); // user not needed in dependency array as initializeVapi doesn't depend on it,
                           // and call-start logic reads fresh user state

    const handleReconnect = () => {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            setError(`Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Please try again later.`);
            return;
        }

        setIsReconnecting(true);
        setError(`Connection lost. Reconnecting... (Attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        // Wait a moment before reconnecting
        setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);

            // Reinitialize Vapi before trying to reconnect
            initializeVapi();

            try {
                if (vapiRef.current && isInitialized) {
                    console.log('Starting call with assistantId:', assistantId);
                    vapiRef.current.start(assistantId);
                } else {
                    setError('Voice assistant not initialized. Please try again.');
                    setIsReconnecting(false);
                }
            } catch (e) {
                setError(`Reconnection failed: ${(e as any)?.message || JSON.stringify(e)}`);
                setIsReconnecting(false);
            }
        }, 2000);
    };

    const handleStart = () => {
        if (isReconnecting) return;

        // Hide summary when starting a new call
        setShowSummary(false);
        setCallSummary(null);

        // Reset conversation tracking
        conversationRef.current = {
            user: [],
            assistant: []
        };

        if (!isConnected && vapiRef.current && isInitialized) {
            setError(null);
            try {
                console.log('Starting call with assistantId:', assistantId);
                vapiRef.current.start(assistantId);
            } catch (e) {
                console.error('Start error:', e);
                setError((e as any)?.message || JSON.stringify(e));

                // If start fails, try to reinitialize
                setTimeout(() => {
                    initializeVapi();
                }, INIT_COOLDOWN);
            }
        } else if (!isInitialized) {
            // If not initialized, try to initialize first
            setError('Initializing voice assistant...');
            initializeVapi();
            setTimeout(() => {
                if (isInitialized && vapiRef.current) {
                    try {
                        vapiRef.current.start(assistantId);
                        setError(null);
                    } catch (e) {
                        setError(`Failed to start: ${(e as any)?.message || JSON.stringify(e)}`);
                    }
                } else {
                    setError('Could not initialize voice assistant. Please try again.');
                }
            }, INIT_COOLDOWN);
        }
    };

    const handleStop = () => {
        // Clear timer on manual stop
        if (callTimerRef.current) {
            clearTimeout(callTimerRef.current);
            callTimerRef.current = null;
            console.log("Manual stop, timer cleared.");
        }
        if (isConnected && vapiRef.current) {
            try {
                vapiRef.current.stop();
                setPulseAnimation(false);
            } catch (e) {
                console.error('Stop error:', e);
                setError(`Failed to stop: ${(e as any)?.message || JSON.stringify(e)}`);
            }
        }
    };

    // Calculate pulse animation styles
    const pulseStyles = {
        animation: pulseAnimation ? 'pulse 1.5s infinite ease-in-out' : 'none',
        boxShadow: pulseAnimation
            ? (isSpeaking
                ? '0 0 15px rgba(255, 107, 107, 0.7)'
                : '0 0 15px rgba(0, 242, 254, 0.7)')
            : (centeredMode
                ? '0 8px 30px rgba(0, 242, 254, 0.6)'
                : '0 4px 15px rgba(0, 242, 254, 0.4)'),
    };

    // Custom button styles
    const buttonStyle = {
        position: centeredMode ? 'relative' as 'relative' : 'fixed' as 'fixed',
        bottom: centeredMode ? 'auto' : '20px',
        right: centeredMode ? 'auto' : '20px',
        width: centeredMode ? '100px' : '60px',
        height: centeredMode ? '100px' : '60px',
        borderRadius: '50%',
        background: isConnected
            ? (isSpeaking ? '#ff6b6b' : (isListening ? '#4facfe' : '#00f2fe'))
            : (isReconnecting ? '#ffcc00' : 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)'),
        color: '#000',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isReconnecting || isInitializing ? 'not-allowed' : 'pointer',
        zIndex: 1000,
        transition: 'all 0.3s ease',
        margin: centeredMode ? '0 auto' : 'initial',
        ...pulseStyles,
    };

    // Summary card styles
    const summaryCardStyle = {
        position: 'fixed' as 'fixed',
        bottom: centeredMode ? '50%' : '90px',
        right: centeredMode ? '50%' : '20px',
        transform: centeredMode ? 'translate(50%, 50%)' : 'none',
        width: centeredMode ? '400px' : '350px',
        background: '#181818',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
        zIndex: 999,
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 242, 254, 0.2)',
        maxHeight: '400px',
        overflowY: 'auto' as 'auto',
        display: showSummary ? 'block' : 'none',
    };

    const summaryHeaderStyle = {
        padding: '15px 20px',
        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, rgba(79, 172, 254, 0.15) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    };

    const summaryContentStyle = {
        padding: '15px 20px',
        color: '#fff',
        fontSize: '14px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap' as 'pre-wrap',
    };

    // Label text for the button
    const buttonLabel = centeredMode ? (
        <div style={{
            position: 'absolute',
            bottom: '-30px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap'
        }}>
            {isInitializing ? 'Initializing...' :
                isReconnecting ? 'Reconnecting...' :
                    isConnected ? (isSpeaking ? 'Speaking...' : 'Listening...') :
                        'Start Voice Chat'}
        </div>
    ) : null;

    // Microphone icon with wave animation
    const MicIcon = () => (
        <div style={{ position: 'relative', width: centeredMode ? 40 : 24, height: centeredMode ? 40 : 24 }}>
            <svg width={centeredMode ? "40" : "24"} height={centeredMode ? "40" : "24"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" fill="currentColor" />
                <path d="M17 11C17 14.53 14.39 17.44 11 17.93V21H13C13.55 21 14 21.45 14 22C14 22.55 13.55 23 13 23H11H9C8.45 23 8 22.55 8 22C8 21.45 8.45 21 9 21H11V17.93C7.61 17.44 5 14.53 5 11H7C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11H19C19 11.34 18.97 11.67 18.92 12" fill="currentColor" />
            </svg>
            {isListening && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: '50%',
                    border: '2px solid currentColor',
                    opacity: 0.7,
                    animation: 'ripple 1.5s infinite ease-out'
                }}></div>
            )}
        </div>
    );

    // Stop icon
    const StopIcon = () => (
        <svg width={centeredMode ? "40" : "24"} height={centeredMode ? "40" : "24"} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" />
        </svg>
    );

    // Close icon
    const CloseIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor" />
        </svg>
    );

    return (
        <>
            {/* Add global styles for animations */}
            <style jsx global>{`
                @keyframes pulse {
                    0% {
                        transform: scale(0.95);
                        box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.7);
                    }
                    
                    70% {
                        transform: scale(1);
                        box-shadow: 0 0 0 10px rgba(0, 242, 254, 0);
                    }
                    
                    100% {
                        transform: scale(0.95);
                        box-shadow: 0 0 0 0 rgba(0, 242, 254, 0);
                    }
                }
                
                @keyframes ripple {
                    0% {
                        transform: scale(1);
                        opacity: 0.7;
                    }
                    100% {
                        transform: scale(1.5);
                        opacity: 0;
                    }
                }
            `}</style>

            {/* Floating action button */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                    onClick={isConnected ? handleStop : handleStart}
                    style={buttonStyle}
                    title={isConnected ? 'Stop VoiceXpert' : 'Start VoiceXpert'}
                    disabled={isInitializing || isReconnecting}
                >
                    {isConnected ? <StopIcon /> : <MicIcon />}
                </button>
                {buttonLabel}
            </div>

            {/* Error notification */}
            {error && (
                <div style={{
                    position: 'fixed',
                    bottom: centeredMode ? '150px' : '90px',
                    right: centeredMode ? '50%' : '20px',
                    transform: centeredMode ? 'translateX(50%)' : 'none',
                    background: 'rgba(255, 107, 107, 0.1)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: '8px',
                    padding: '10px 15px',
                    maxWidth: '350px',
                    color: '#ff6b6b',
                    fontSize: '14px',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    zIndex: 998,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" fill="#ff6b6b" />
                    </svg>
                    {error}
                    {(error.includes('failed') || error.includes('error')) && (
                        <button
                            onClick={initializeVapi}
                            style={{
                                background: 'rgba(255, 107, 107, 0.2)',
                                border: 'none',
                                color: '#ff6b6b',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                marginLeft: 'auto',
                                fontSize: '12px',
                                cursor: 'pointer',
                            }}
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            {/* Summary card */}
            {showSummary && callSummary && (
                <div style={summaryCardStyle}>
                    <div style={summaryHeaderStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke="#00f2fe" strokeWidth="2" strokeLinecap="round" />
                                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" stroke="#00f2fe" strokeWidth="2" strokeLinecap="round" />
                                <path d="M9 9h1M9 13h6M9 17h6" stroke="#00f2fe" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            <span style={{ color: '#fff', fontWeight: 600 }}>Research Session Summary</span>
                        </div>
                        <button
                            onClick={() => setShowSummary(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                padding: '5px',
                            }}
                        >
                            <CloseIcon />
                        </button>
                    </div>
                    <div style={summaryContentStyle}>
                        {/* Convert markdown-like syntax to formatted HTML */}
                        {callSummary.split('\n').map((line, i) => {
                            if (line.startsWith('## ')) {
                                return <h2 key={i} style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#00f2fe' }}>{line.substring(3)}</h2>;
                            } else if (line.startsWith('### ')) {
                                return <h3 key={i} style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px' }}>{line.substring(4)}</h3>;
                            } else if (line.startsWith('- ')) {
                                return <div key={i} style={{ marginBottom: '6px', paddingLeft: '12px', position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '0', color: '#00f2fe' }}>•</span>
                                    {line.substring(2)}
                                </div>;
                            } else if (/^\d+\./.test(line)) {
                                return <div key={i} style={{ marginBottom: '6px', paddingLeft: '20px' }}>{line}</div>;
                            } else if (line.trim() === '') {
                                return <div key={i} style={{ height: '8px' }}></div>;
                            } else {
                                return <div key={i} style={{ marginBottom: '6px' }}>{line}</div>;
                            }
                        })}

                        {/* New call button */}
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={handleStart}
                                style={{
                                    background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                                    border: 'none',
                                    color: '#000',
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 15px rgba(0, 242, 254, 0.3)',
                                }}
                            >
                                <MicIcon />
                                Start New Session
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
} 
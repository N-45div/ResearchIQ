'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/app/utils/supabase/client";
import { motion } from "framer-motion";
import { PointerHighlight } from "@/app/components/PointerHighlight";
import { IconBrandGoogle, IconBrandGithub, IconArrowLeft, IconMail, IconLock, IconAlertTriangle, IconLoader } from "@tabler/icons-react";

export default function SignIn() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createSupabaseClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (!supabase) {
            setError("Authentication service unavailable. Please try again later.");
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message || "Invalid login credentials. Please check and try again.");
                setLoading(false);
                return;
            }

            router.push("/chat");
        } catch (err) {
            console.error("Authentication error:", err);
            setError("An unexpected error occurred during sign-in. Please try again.");
            setLoading(false);
        }
    };

    const handleOAuthSignIn = async (provider: 'google' | 'github') => {
        setError("");
        setLoading(true);
        if (!supabase) {
            setError("Authentication service unavailable. Please try again later.");
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/chat`,
                }
            });

            if (error) {
                setError(error.message || `Failed to sign in with ${provider}. Please try again.`);
            }
        } catch (err) {
            console.error(`${provider} sign-in error:`, err);
            setError(`An unexpected error occurred with ${provider} sign-in. Please try again.`);
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen py-12 px-4 bg-black flex justify-center items-center overflow-hidden">
            <div className="absolute inset-0 -z-10 opacity-60">
                <motion.div
                    className="absolute top-[-40%] left-[-30%] w-[100vw] h-[100vw] md:w-[80vw] md:h-[80vw] bg-gradient-to-br from-[var(--accent-primary)]/10 to-transparent rounded-full blur-3xl animate-pulse-slow"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 4, ease: "easeOut" }}
                />
                <motion.div
                    className="absolute bottom-[-50%] right-[-40%] w-[120vw] h-[120vw] md:w-[90vw] md:h-[90vw] bg-gradient-to-tl from-[var(--accent-secondary)]/15 to-transparent rounded-full blur-3xl animate-pulse-slower"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 4, delay: 0.8, ease: "easeOut" }}
                />
            </div>

            <PointerHighlight strength={0.08}>
                <motion.div
                    className="w-full max-w-md bg-black/40 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-white/10 shadow-2xl"
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="text-center mb-8"
                    >
                        <h1 className="text-4xl font-bold gradient-text tracking-tight mb-2">Welcome Back</h1>
                        <p className="text-gray-400 text-lg">Sign in to continue your research.</p>
                    </motion.div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginBottom: '1.5rem' }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="bg-red-500/10 border border-red-500/30 text-red-400 p-3.5 rounded-lg text-sm flex items-center gap-2 shadow-md"
                        >
                            <IconAlertTriangle size={18} />
                            <span>{error}</span>
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6 mb-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                            className="relative flex flex-col space-y-1"
                        >
                            <label htmlFor="email" className="text-gray-400 text-sm font-medium sr-only">Email</label>
                            <div className="relative flex items-center">
                                <IconMail size={20} className="absolute left-4 text-gray-500 pointer-events-none" />
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    className="w-full bg-white/5 border border-white/10 text-white p-4 pl-12 rounded-lg outline-none focus:border-[var(--accent-primary)] transition-colors duration-200 text-base shadow-sm"
                                />
                            </div>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                            className="relative flex flex-col space-y-1"
                        >
                            <label htmlFor="password" className="text-gray-400 text-sm font-medium sr-only">Password</label>
                            <div className="relative flex items-center">
                                <IconLock size={20} className="absolute left-4 text-gray-500 pointer-events-none" />
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                    className="w-full bg-white/5 border border-white/10 text-white p-4 pl-12 rounded-lg outline-none focus:border-[var(--accent-primary)] transition-colors duration-200 text-base shadow-sm"
                                />
                            </div>
                        </motion.div>
                        <motion.button
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-black py-3.5 rounded-lg font-semibold text-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {loading ? <IconLoader size={22} className="animate-spin" /> : 'Sign In'}
                        </motion.button>
                    </form>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        className="mb-8 text-center"
                    >
                        <p className="text-gray-500 text-sm mb-4">Or continue with</p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={() => handleOAuthSignIn('google')}
                                disabled={loading}
                                className="flex-1 bg-white/5 border border-white/10 text-white py-3 px-4 rounded-lg font-medium hover:bg-white/10 transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                            >
                                <IconBrandGoogle size={22} /> Google
                            </button>
                            <button
                                onClick={() => handleOAuthSignIn('github')}
                                disabled={loading}
                                className="flex-1 bg-white/5 border border-white/10 text-white py-3 px-4 rounded-lg font-medium hover:bg-white/10 transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                            >
                                <IconBrandGithub size={22} /> GitHub
                            </button>
                        </div>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7, duration: 0.5 }}
                        className="text-center text-sm text-gray-400"
                    >
                        <Link href="/" className="hover:text-[var(--accent-secondary)] hover:underline transition-colors duration-200 flex items-center justify-center gap-1.5">
                            <IconArrowLeft size={16} /> Return to Home
                        </Link>
                    </motion.p>
                </motion.div>
            </PointerHighlight>
        </main>
    );
} 
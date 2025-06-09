'use client';

import Script from 'next/script';
import { createSupabaseClient } from '@/app/utils/supabase/client';
import { CredentialResponse } from '@/app/types/google-one-tap';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const OneTapComponent = () => {
    const supabase = createSupabaseClient();
    const router = useRouter();

    // generate nonce to use for google id token sign-in
    const generateNonce = async (): Promise<string[]> => {
        const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
        const encoder = new TextEncoder();
        const encodedNonce = encoder.encode(nonce);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        return [nonce, hashedNonce];
    };

    useEffect(() => {
        const initializeGoogleOneTap = () => {
            console.log('Initializing Google One Tap');
            window.addEventListener('load', async () => {
                if (!supabase) {
                    console.error('Supabase client not initialized');
                    return;
                }

                const [nonce, hashedNonce] = await generateNonce();
                console.log('Nonce generated');

                // check if there's already an existing session before initializing the one-tap UI
                const { data, error } = await supabase.auth.getSession();
                if (error) {
                    console.error('Error getting session', error);
                }
                if (data?.session) {
                    router.push('/chat');
                    return;
                }

                if (window.google?.accounts?.id) {
                    window.google.accounts.id.initialize({
                        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
                        callback: async (response: CredentialResponse) => {
                            try {
                                if (!supabase) return;

                                // send id token returned in response.credential to supabase
                                const { data, error } = await supabase.auth.signInWithIdToken({
                                    provider: 'google',
                                    token: response.credential,
                                    nonce,
                                });
                                if (error) throw error;
                                console.log('Successfully logged in with Google One Tap');
                                // redirect to chat page
                                router.push('/chat');
                            } catch (error) {
                                console.error('Error logging in with Google One Tap', error);
                            }
                        },
                        nonce: hashedNonce,
                        // with chrome's removal of third-party cookies, we need to use FedCM instead
                        use_fedcm_for_prompt: true,
                    });
                    window.google.accounts.id.prompt(); // Display the One Tap UI
                } else {
                    console.error('Google One Tap script not loaded properly');
                }
            });
        };

        initializeGoogleOneTap();
        return () => window.removeEventListener('load', initializeGoogleOneTap);
    }, [router]);

    return (
        <>
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="lazyOnload"
                onLoad={() => console.log('Google One Tap script loaded')}
            />
            <div id="oneTap" className="fixed top-0 right-0 z-[100]" />
        </>
    );
};

export default OneTapComponent; 
'use client';

import { ReactNode, useEffect, useState } from "react";
import { AuthProvider } from "./context/AuthContext";
import dynamic from 'next/dynamic';

// Dynamically import OneTapComponent to avoid SSR issues
const OneTapComponent = dynamic(() => import('./components/OneTap'), {
    ssr: false,
});

export default function Providers({ children }: { children: ReactNode }) {
    // This helps prevent hydration errors by only rendering on the client
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Only render the providers once the component mounts on the client
    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <AuthProvider>
            {children}
            <OneTapComponent />
        </AuthProvider>
    );
} 
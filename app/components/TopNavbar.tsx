"use client";
import Link from "next/link";
import { useState } from "react";
import { IconMenu2, IconX } from "@tabler/icons-react";
import styles from './TopNavbar.module.css';

export default function TopNavbar({ className = "" }: { className?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <nav className={`${styles.navbar} ${className}`}>
            <Link href="/" className={styles.logo}>ResearchIQ</Link>
            <button
                className={styles.menuButton}
                onClick={() => setOpen(true)}
                aria-label="Open menu"
            >
                <IconMenu2 size={28} />
            </button>
            {/* Slide-out menu */}
            {open && (
                <div className={styles.mobileMenu}>
                    <div className={styles.mobileMenuHeader}>
                        <Link href="/" className={styles.logo} onClick={() => setOpen(false)}>
                            ResearchIQ
                        </Link>
                        <button
                            className={styles.menuButton}
                            onClick={() => setOpen(false)}
                            aria-label="Close menu"
                        >
                            <IconX size={28} />
                        </button>
                    </div>
                    <div className={styles.mobileMenuContent}>
                        <Link href="/" className={styles.mobileMenuLink} onClick={() => setOpen(false)}>Home</Link>
                        <Link href="/chat" className={styles.mobileMenuLink} onClick={() => setOpen(false)}>Research</Link>
                        <Link href="/pricing" className={styles.mobileMenuLink} onClick={() => setOpen(false)}>Pricing</Link>
                    </div>
                </div>
            )}
        </nav>
    );
} 
'use client';

import Link from 'next/link';
import styles from './Header.module.css';

export default function Header() {
    return (
        <header className={styles.header}>
            <div className={styles.container}>
                <Link href="/" className={styles.logo}>
                    ResearchIQ
                </Link>
                <nav className={styles.nav}>
                    <Link href="/" className={styles.navLink}>Home</Link>
                    <Link href="/chat" className={styles.navLink}>Research</Link>
                    <Link href="/pricing" className={styles.navLink}>Pricing</Link>
                </nav>
            </div>
        </header>
    );
} 
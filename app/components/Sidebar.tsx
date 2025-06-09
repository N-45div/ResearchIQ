"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLayoutDashboard, IconSearch, IconCoins } from "@tabler/icons-react";
import styles from './Sidebar.module.css';

const navLinks = [
    { label: "Home", href: "/", icon: <IconLayoutDashboard className={styles.icon} /> },
    { label: "Research", href: "/chat", icon: <IconSearch className={styles.icon} /> },
    { label: "Pricing", href: "/pricing", icon: <IconCoins className={styles.icon} /> },
];

export default function Sidebar({ className = "" }: { className?: string }) {
    const pathname = usePathname();
    return (
        <aside className={`${styles.sidebar} ${className}`}>
            <div className={styles.logoContainer}>
                <Link href="/" className={styles.logo}>ResearchIQ</Link>
            </div>
            <nav className={styles.nav}>
                {navLinks.map(link => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`${styles.navLink} ${pathname === link.href ? styles.navLinkActive : ''}`}
                    >
                        {link.icon}
                        <span>{link.label}</span>
                    </Link>
                ))}
            </nav>
        </aside>
    );
} 
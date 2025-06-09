'use client';

import { PointerHighlight } from '@/app/components/PointerHighlight';
import { motion } from 'framer-motion';
import { HeroSection } from '@/app/components/HeroSection';
import Link from 'next/link';
import { IconArrowRight } from '@tabler/icons-react';
import styles from './Pricing.module.css';

export default function Pricing() {
    return (
        <main className={styles.container}>
            <div className={styles.backgroundEffects}>
                <motion.div
                    className={styles.backgroundBlob1}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 3, ease: "easeOut" }}
                />
                <motion.div
                    className={styles.backgroundBlob2}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 3, delay: 0.5, ease: "easeOut" }}
                />
            </div>

            <div className={styles.contentWrapper}>
                <HeroSection
                    title={<span>Pricing Coming Soon</span>}
                    subtitle="We're currently working on our pricing plans. In the meantime, you can explore our research features for free."
                />

                <PointerHighlight strength={0.05}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.6 }}
                        className={styles.noticeCard}
                    >
                        <h3 className={styles.noticeTitle}>Free Access</h3>
                        <p className={styles.noticeText}>
                            Currently, all users benefit from <strong className={styles.noticeHighlight}>3 free research requests</strong> (anonymous) and <strong className={styles.noticeHighlight}>10 free requests</strong> when signed in.
                            Stay tuned for our premium plans coming soon!
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.6 }}
                        className={styles.ctaSection}
                    >
                        <Link href="/chat" className={styles.ctaButton}>
                            Try Deep Research Now
                            <IconArrowRight size={24} className={styles.ctaArrow} />
                        </Link>
                    </motion.div>
                </PointerHighlight>
            </div>
        </main>
    );
} 
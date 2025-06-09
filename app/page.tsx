"use client";
import Link from "next/link";
import { IconBrain, IconSearch, IconChartPie, IconArrowRight } from "@tabler/icons-react";
import { motion } from "framer-motion";
import styles from './Home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      {/* Animated blurred background shapes */}
      <div className={styles.backgroundEffects}>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.5, scale: 1.2 }}
          transition={{ duration: 20, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          className={styles.backgroundBlob1}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.4, scale: 1.1 }}
          transition={{ duration: 25, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", delay: 5 }}
          className={styles.backgroundBlob2}
        />
      </div>

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={styles.heroSection}
      >
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className={styles.heroTitle}
        >
          Uncover Deeper Insights.<br />Compare Multiple AIs.
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
          className={styles.heroSubtitle}
        >
          Harness the collective intelligence of leading AI models. Identify nuances, reduce bias, and gain comprehensive understanding for your research.
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          className={styles.buttonContainer}
        >
          <Link href="/chat" className={styles.primaryButton}>
            Start Researching
            <IconArrowRight size={20} className={styles.arrowIcon} />
          </Link>
          <Link href="/pricing" className={styles.secondaryButton}>
            View Pricing
          </Link>
        </motion.div>
      </motion.section>

      {/* Features Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
        className={styles.featuresSection}
      >
        <div className={styles.featuresGrid}>
          {[
            {
              icon: <IconBrain size={36} className={styles.featureIcon} />,
              title: "Mitigate AI Bias",
              description: "Compare diverse AI perspectives to identify and reduce inherent biases, ensuring a more balanced research outcome."
            },
            {
              icon: <IconSearch size={36} className={styles.featureIcon} />,
              title: "Comprehensive Coverage",
              description: "Leverage varied knowledge bases and data cutoffs from multiple AIs for thorough and well-rounded research insights."
            },
            {
              icon: <IconChartPie size={36} className={styles.featureIcon} />,
              title: "Scholarly Validation",
              description: "Augment AI-generated content with direct links to academic papers, adding depth and credibility to your findings."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              className={styles.featureCard}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 + i * 0.2, ease: "easeOut" }}
            >
              {feature.icon}
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

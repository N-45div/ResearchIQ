"use client";

import React from "react";
import { PointerHighlight } from "./PointerHighlight";
import Link from "next/link";
import { motion } from "framer-motion";
import styles from './HeroSection.module.css';

export const HeroSection = ({
  title,
  subtitle,
  gradient = true,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  gradient?: boolean;
  actions?: React.ReactNode;
  className?: string;
}) => {
  return (
    <PointerHighlight strength={0.15}>
      <section className={`${styles.section} ${className || ''}`}>
        <div className={styles.container}>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={gradient ? `${styles.title} ${styles.titleGradient}` : styles.title}
          >
            {title}
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={styles.subtitle}
          >
            {subtitle}
          </motion.div>
          {actions && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={styles.actionsContainer}
            >
              {actions}
            </motion.div>
          )}
        </div>
      </section>
    </PointerHighlight>
  );
};

export const HeroButton = ({
  children,
  href,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "gradient";
  className?: string;
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case "primary":
        return styles.buttonPrimary;
      case "secondary":
        return styles.buttonSecondary;
      case "gradient":
        return styles.buttonGradient;
      default:
        return styles.buttonPrimary;
    }
  };

  return (
    <Link href={href} className={`${styles.button} ${getVariantClass()} ${className || ''}`}>
      {children}
    </Link>
  );
}; 
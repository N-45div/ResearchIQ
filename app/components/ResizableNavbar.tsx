"use client";
import { cn } from "@/app/utils/cn";
import { IconMenu2, IconX } from "@tabler/icons-react";
import {
    motion,
    AnimatePresence,
    useScroll,
    useMotionValueEvent,
} from "framer-motion";
import Link from "next/link";
import React, { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

export const ResizableNavbar = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <div className={cn("fixed top-0 left-0 right-0 z-50", className)}>
            {children}
        </div>
    );
};

export const NavBody = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    const { scrollY } = useScroll();
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(true);
    const [atTop, setAtTop] = useState(true);

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previousY = scrollY.getPrevious() || 0;
        if (latest > previousY) {
            setVisible(false);
        } else {
            setVisible(true);
        }

        // Check if at the top of the page
        if (latest <= 10) {
            setAtTop(true);
        } else {
            setAtTop(false);
        }
    });

    return (
        <motion.div
            ref={ref}
            variants={{
                visible: { y: 0, opacity: 1 },
                hidden: { y: -10, opacity: 0.8 },
            }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            animate={visible ? "visible" : "hidden"}
            className={cn(
                "w-full bg-black bg-opacity-60 backdrop-blur-lg backdrop-saturate-150 border-b z-50",
                atTop ? "py-6 border-transparent" : "py-3 border-[rgba(255,255,255,0.1)]",
                "transition-all duration-200",
                className
            )}
        >
            {children}
        </motion.div>
    );
};

export const NavItems = ({
    items,
    className,
    onItemClick,
}: {
    items: {
        name: string;
        link: string;
    }[];
    className?: string;
    onItemClick?: () => void;
}) => {
    return (
        <div className={cn("flex items-center gap-6", className)}>
            {items.map((item, idx) => (
                <Link
                    key={`${item.name}-${idx}`}
                    href={item.link}
                    onClick={onItemClick}
                    className="text-white hover:text-[var(--accent-primary)] transition-colors duration-200"
                >
                    {item.name}
                </Link>
            ))}
        </div>
    );
};

export const MobileNav = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className={cn("block md:hidden", className)}>
            <MobileNavToggle isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
            <MobileNavMenu isOpen={isOpen} onClose={() => setIsOpen(false)}>
                {children}
            </MobileNavMenu>
        </div>
    );
};

export const MobileNavHeader = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <div
            className={cn(
                "flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.1)]",
                className
            )}
        >
            {children}
        </div>
    );
};

export const MobileNavMenu = ({
    children,
    className,
    isOpen,
    onClose,
}: {
    children: React.ReactNode;
    className?: string;
    isOpen: boolean;
    onClose: () => void;
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className={cn(
                        "fixed inset-0 z-50 bg-black bg-opacity-80 backdrop-blur-lg",
                        className
                    )}
                >
                    <div className="container mx-auto py-8 px-4">
                        <div className="flex justify-end">
                            <button
                                onClick={onClose}
                                className="text-white hover:text-[var(--accent-primary)]"
                            >
                                <IconX size={24} />
                            </button>
                        </div>
                        <div className="mt-8">{children}</div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const MobileNavToggle = ({
    isOpen,
    onClick,
}: {
    isOpen: boolean;
    onClick: () => void;
}) => {
    return (
        <button
            onClick={onClick}
            className="text-white hover:text-[var(--accent-primary)] transition-colors duration-200"
        >
            {isOpen ? <IconX size={24} /> : <IconMenu2 size={24} />}
        </button>
    );
};

export const NavbarButton = ({
    href,
    as = "a",
    children,
    className,
    variant = "primary",
}: {
    href?: string;
    as?: React.ElementType;
    children: React.ReactNode;
    className?: string;
    variant?: "primary" | "secondary" | "gradient";
}) => {
    const Component = as;
    const { user } = useAuth();

    if (href === "/auth/signin" && user) {
        return null;
    }

    const baseClasses =
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 px-4 py-2";

    const variantClasses = {
        primary:
            "bg-[var(--gradient)] text-white shadow hover:opacity-90",
        secondary:
            "bg-black border border-[rgba(255,255,255,0.1)] text-white hover:bg-[rgba(255,255,255,0.05)]",
        gradient:
            "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white shadow hover:shadow-lg",
    };

    const props = href ? { href } : {};

    return (
        <Component
            className={cn(
                baseClasses,
                variantClasses[variant],
                className
            )}
            {...props}
        >
            {children}
        </Component>
    );
}; 
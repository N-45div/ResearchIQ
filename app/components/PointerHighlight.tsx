"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/app/utils/cn";

export const PointerHighlight = ({
    children,
    className,
    size = 400,
    color = "var(--gradient)",
    strength = 0.2,
}: {
    children?: React.ReactNode;
    className?: string;
    size?: number;
    color?: string;
    strength?: number;
}) => {
    const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const updatePosition = (e: MouseEvent) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setPosition({ x, y });
        setOpacity(1);
    };

    const handleMouseLeave = () => {
        setOpacity(0);
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener("mousemove", updatePosition);
        container.addEventListener("mouseleave", handleMouseLeave);
        container.addEventListener("mouseenter", () => setOpacity(1));

        return () => {
            container.removeEventListener("mousemove", updatePosition);
            container.removeEventListener("mouseleave", handleMouseLeave);
            container.removeEventListener("mouseenter", () => setOpacity(1));
        };
    }, []);

    const backgroundImage = typeof color === "string" && !color.includes("gradient")
        ? `radial-gradient(circle, ${color}, transparent 60%)`
        : color;

    return (
        <div className={cn("relative overflow-hidden", className)} ref={containerRef}>
            <motion.div
                className="absolute inset-0 z-0 pointer-events-none"
                style={{
                    background: backgroundImage,
                    opacity: opacity * strength,
                    left: position.x - size / 2,
                    top: position.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    filter: "blur(60px)",
                }}
                animate={{
                    x: position.x - size / 2,
                    y: position.y - size / 2,
                    opacity: opacity * strength,
                }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
            />
            <div className="relative z-10">{children}</div>
        </div>
    );
}; 
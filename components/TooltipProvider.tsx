"use client";
import { useEffect, useState, useRef } from "react";
type TooltipState = {
    text: string;
    x: number;
    y: number;
} | null;
export default function TooltipProvider() {
    const [tip, setTip] = useState<TooltipState>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        function getAncestor(el: Element | null): HTMLElement | null {
            while (el) {
                if (el instanceof HTMLElement && el.hasAttribute("data-tooltip"))
                    return el;
                el = el.parentElement;
            }
            return null;
        }
        function onOver(e: MouseEvent) {
            const anchor = getAncestor(e.target as Element);
            if (!anchor) {
                clear();
                return;
            }
            const text = anchor.getAttribute("data-tooltip") ?? "";
            if (!text) {
                clear();
                return;
            }
            if (timerRef.current)
                clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                const rect = anchor.getBoundingClientRect();
                setTip({ text, x: rect.left + rect.width / 2, y: rect.top });
            }, 120);
        }
        function onOut(e: MouseEvent) {
            const anchor = getAncestor(e.target as Element);
            if (!anchor)
                return;
            const related = e.relatedTarget as Element | null;
            if (related && anchor.contains(related))
                return;
            clear();
        }
        function clear() {
            if (timerRef.current)
                clearTimeout(timerRef.current);
            setTip(null);
        }
        document.addEventListener("mouseover", onOver);
        document.addEventListener("mouseout", onOut);
        document.addEventListener("mousedown", clear);
        return () => {
            document.removeEventListener("mouseover", onOver);
            document.removeEventListener("mouseout", onOut);
            document.removeEventListener("mousedown", clear);
            if (timerRef.current)
                clearTimeout(timerRef.current);
        };
    }, []);
    if (!tip)
        return null;
    return (<div role="tooltip" style={{
            position: "fixed",
            left: tip.x,
            top: tip.y - 10,
            transform: "translate(-50%, -100%)",
            zIndex: 99999,
            pointerEvents: "none",
        }}>
      <div className="bg-[var(--tinte-leise)] text-white text-[13px] font-medium px-2.5 py-1.5 rounded-lg  max-w-[220px] text-center leading-snug whitespace-normal">
        {tip.text}
      </div>
      <div style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #0f172a",
        }}/>
    </div>);
}

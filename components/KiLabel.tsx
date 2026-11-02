"use client";
import Link from "next/link";
import { AI_DEMO_DISCLOSURE, AI_DISCLOSURE, AI_LABEL_SHORT, AI_TRANSPARENCY_URL } from "@/lib/ai-transparency";
type Props = {
    variant?: "ai" | "demo";
    tone?: "light" | "dark";
    className?: string;
};
export function KiLabel({ variant = "ai", tone = "light", className = "" }: Props) {
    const isDemo = variant === "demo";
    const text = isDemo ? "Demo-Beispiel · keine KI" : AI_LABEL_SHORT;
    const title = isDemo ? AI_DEMO_DISCLOSURE : AI_DISCLOSURE;
    const colors = isDemo
        ? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border-[var(--linie)]"
        : tone === "dark"
            ? "bg-white/10 text-white/80 border-white/20"
            : "bg-[var(--ki-flaeche)] text-[var(--ki)] border-[var(--linie)]";
    return (<span data-ai-generated={isDemo ? "false" : "true"} title={title} aria-label={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold leading-none whitespace-nowrap ${colors} ${className}`}>
      
      {text}
    </span>);
}
export function KiDisclosureNote({ variant = "ai", tone = "light", className = "" }: Props) {
    const isDemo = variant === "demo";
    return (<p data-ai-generated={isDemo ? "false" : "true"} className={`text-[13px] leading-relaxed ${tone === "dark" ? "text-white/60" : "text-[var(--tinte-leise)]"} ${className}`}>
      {isDemo ? AI_DEMO_DISCLOSURE : AI_DISCLOSURE}{" "}
      <Link href={AI_TRANSPARENCY_URL} className="underline underline-offset-2 hover:opacity-80">
        KI-Transparenz
      </Link>
    </p>);
}
export default KiLabel;

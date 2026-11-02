import type { ReactNode } from "react";
export default function FarbChip({ farbe, children, leise = false, className = "", }: {
    farbe?: string | null;
    children: ReactNode;
    leise?: boolean;
    className?: string;
}) {
    return (<span title={typeof children === "string" ? children : undefined} className={`inline-flex max-w-44 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium px-2.5 py-0.5 rounded-full border border-[var(--linie)] bg-[var(--papier)] flex-shrink-0 ${leise ? "text-[var(--tinte-matt)] border-dashed" : "text-[var(--tinte)]"} ${className}`}>
      <span aria-hidden="true" className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: farbe ?? "var(--tinte-leise)" }}/>
      
      <span className="min-w-0 truncate">{children}</span>
    </span>);
}

"use client";
import { useEffect, useState } from "react";
import type { Selbst } from "@/lib/rechte";
export function useSelbstGesperrt(funktion: Selbst): string | null {
    const [hinweis, setHinweis] = useState<string | null>(null);
    useEffect(() => {
        let aktiv = true;
        fetch("/api/mitarbeiter/selbstbedienung")
            .then(r => r.json())
            .then(d => { if (aktiv)
            setHinweis(d?.hinweise?.[funktion] ?? null); })
            .catch(() => { });
        return () => { aktiv = false; };
    }, [funktion]);
    return hinweis;
}
export default function SelbstbedienungHinweis({ text }: {
    text: string;
}) {
    return (<div role="status" className="flex items-center gap-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] px-4 py-3 text-[14px] text-[var(--tinte)]">
      <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 20 }}>call</span>
      {text}
    </div>);
}

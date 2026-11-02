"use client";
import { useState, useRef, useEffect } from "react";
import { FileText, Image as ImageIcon, Printer } from "lucide-react";
import { exportPlan, type PlanExportDoc, type PlanExportFormat } from "@/lib/planExport";
export type ExportTarget = {
    id: string;
    label: string;
    baseName: string;
    build: () => PlanExportDoc | PlanExportDoc[];
};
export default function PlanExportMenu({ targets, buttonLabel = "Drucken / Export", align = "right", }: {
    targets: ExportTarget[];
    buttonLabel?: string;
    align?: "left" | "right";
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function onDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        }
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);
    async function run(target: ExportTarget, format: PlanExportFormat) {
        setBusy(`${target.id}:${format}`);
        try {
            const built = target.build();
            const docs = Array.isArray(built) ? built : [built];
            for (let i = 0; i < docs.length; i++) {
                const name = docs.length > 1 ? `${target.baseName}-${i + 1}` : target.baseName;
                await exportPlan(docs[i], name, format);
            }
        }
        catch (e) {
            alert("Export fehlgeschlagen: " + (e instanceof Error ? e.message : "Unbekannter Fehler"));
        }
        finally {
            setBusy(null);
            setOpen(false);
        }
    }
    const usable = targets.filter(t => t);
    return (<div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} disabled={!!busy || usable.length === 0} className="flex items-center gap-1.5 text-sm font-medium text-[var(--akzent)] hover:text-[var(--akzent-tief)] px-3 py-2 rounded-lg border border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-60">
        <Printer size={14}/> {busy ? "Erstelle…" : buttonLabel}
      </button>

      {open && (<div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1 bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-hidden z-50 min-w-[280px] max-h-[60vh] overflow-y-auto`}>
          <div className="px-3 py-2 border-b border-[var(--linie)]">
            <p className="text-[13px] text-[var(--tinte-matt)] font-semibold uppercase tracking-wider">Zum Drucken speichern</p>
          </div>
          {usable.map(target => (<div key={target.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--papier-tief)] transition-colors">
              <span className="flex-1 text-sm text-[var(--tinte-matt)] truncate">{target.label}</span>
              <button onClick={() => run(target, "pdf")} disabled={!!busy} aria-label="Als PDF" data-tooltip="Als PDF" className="flex items-center gap-1 text-[13px] font-medium text-[var(--akzent)] px-2 py-1 rounded-md border border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] disabled:opacity-50">
                <FileText size={13}/> PDF
              </button>
              <button onClick={() => run(target, "jpeg")} disabled={!!busy} aria-label="Als JPEG-Bild" data-tooltip="Als JPEG-Bild" className="flex items-center gap-1 text-[13px] font-medium text-[var(--tinte-matt)] px-2 py-1 rounded-md border border-[var(--linie)] hover:bg-[var(--papier-tief)] disabled:opacity-50">
                <ImageIcon size={13}/> JPEG
              </button>
            </div>))}
        </div>)}
    </div>);
}

"use client";
import { useEffect, useState, useCallback } from "react";
import { Repeat, Check, X, Clock } from "lucide-react";
import { useLang } from "@/lib/LanguageContext";
type SwapReq = {
    id: string;
    status: string;
    reason: string;
    requester_staff_name: string;
    requester_shift_date: string;
    requester_shift_type: string;
    target_staff_name: string;
    target_shift_date: string;
    target_shift_type: string;
};
export default function ShiftSwapApprovals() {
    const { t, locale } = useLang();
    const [pending, setPending] = useState<SwapReq[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const shiftLabel = (typ: string) => ({ frueh: t("shift.frueh"), spaet: t("shift.spaet"), nacht: t("shift.nacht") } as Record<string, string>)[typ] ?? typ;
    const fmtD = (d: string) => {
        try {
            return new Date(d + "T12:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
        }
        catch {
            return d;
        }
    };
    const load = useCallback(() => {
        fetch("/api/leitung/shift-swap-requests")
            .then(r => r.json())
            .then((d: {
            requests?: SwapReq[];
        }) => setPending((d.requests ?? []).filter(r => r.status === "pending_leitung")))
            .catch(() => { });
    }, []);
    useEffect(() => { load(); }, [load]);
    async function decide(id: string, status: "approved" | "declined") {
        setBusyId(id);
        setError("");
        try {
            const res = await fetch("/api/leitung/shift-swap-requests", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok)
                setError(d.error ?? t("swp.failed"));
        }
        catch {
            setError(t("ui.noConnection"));
        }
        finally {
            setBusyId(null);
            load();
        }
    }
    if (pending.length === 0)
        return null;
    return (<div className="rounded-2xl border border-[var(--linie)] bg-[var(--papier-tief)]/50 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--papier-tief)] flex items-center justify-center flex-shrink-0">
          <Repeat size={16} className="text-[var(--tinte-matt)]"/>
        </div>
        <h2 className="text-[14px] font-semibold text-[var(--tinte)]">{t("swp.title")}</h2>
        <span className="text-[13px] font-semibold text-[var(--tinte-matt)] bg-[var(--papier-tief)] px-2 py-0.5 rounded-full">{pending.length}</span>
        <span className="text-[13px] text-[var(--tinte-leise)] ml-auto inline-flex items-center gap-1"><Clock size={12}/> {t("swp.waiting")}</span>
      </div>
      {error && <p className="text-[13px] text-[var(--gefahr)] mb-2">{error}</p>}
      <div className="space-y-2">
        {pending.map(r => (<div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[var(--papier)] border border-[var(--linie)] rounded-xl px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-[var(--tinte)]">
                <span className="font-semibold">{r.requester_staff_name}</span>
                <span className="text-[var(--tinte-leise)]"> ({shiftLabel(r.requester_shift_type)}, {fmtD(r.requester_shift_date)})</span>
                <span className="text-[var(--tinte-leise)]"> ↔ </span>
                <span className="font-semibold">{r.target_staff_name}</span>
                <span className="text-[var(--tinte-leise)]"> ({shiftLabel(r.target_shift_type)}, {fmtD(r.target_shift_date)})</span>
              </p>
              {r.reason && <p className="text-[13px] text-[var(--tinte-leise)] mt-0.5 truncate">{t("swp.reason")}: {r.reason}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => decide(r.id, "declined")} disabled={!!busyId} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                <X size={13}/> {t("swp.decline")}
              </button>
              <button onClick={() => decide(r.id, "approved")} disabled={!!busyId} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition disabled:opacity-60">
                <Check size={13}/> {busyId === r.id ? "…" : t("swp.approve")}
              </button>
            </div>
          </div>))}
      </div>
      <p className="text-[13px] text-[var(--tinte-leise)] mt-2.5">{t("swp.footnote")}</p>
    </div>);
}

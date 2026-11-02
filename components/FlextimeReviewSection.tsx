"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
type ReqStatus = "pending" | "approved" | "declined";
type FlextimeRequest = {
    id: string;
    staff_id: string;
    from_date: string;
    to_date: string;
    days: number;
    hours: number;
    reason: string | null;
    status: ReqStatus;
    submitted_at: string;
    staffName: string;
    staffBalanceHours: number;
};
function fmtHours(h: number): string {
    return `${(Math.round(h * 100) / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
}
export default function FlextimeReviewSection() {
    const [requests, setRequests] = useState<FlextimeRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/leitung/flextime-requests");
                if (res.ok) {
                    const d = await res.json();
                    if (!d.tableMissing)
                        setRequests((d.requests ?? []) as FlextimeRequest[]);
                }
            }
            catch { }
            setLoading(false);
        })();
    }, []);
    async function decide(id: string, status: ReqStatus) {
        setBusy(id);
        setError("");
        try {
            const res = await fetch("/api/leitung/flextime-requests", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok) {
                const req = requests.find(r => r.id === id);
                const delta = status === "approved" ? -(Number(req?.hours) || 0) : 0;
                setRequests(prev => prev.map(r => r.id === id
                    ? { ...r, status }
                    : (delta !== 0 && r.staff_id === req?.staff_id
                        ? { ...r, staffBalanceHours: r.staffBalanceHours + delta }
                        : r)));
            }
            else {
                setError(d.error ?? "Konnte nicht gespeichert werden.");
            }
        }
        catch {
            setError("Keine Verbindung — bitte erneut versuchen.");
        }
        setBusy(null);
    }
    if (loading || requests.length === 0)
        return null;
    const sorted = [...requests].sort((a, b) => {
        const order: Record<ReqStatus, number> = { pending: 0, approved: 1, declined: 2 };
        return order[a.status] - order[b.status];
    });
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
      <h2 className="font-semibold text-[var(--tinte)] text-[16px] mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>more_time</span>
        Gleitzeittage
      </h2>
      <p className="text-[var(--tinte-matt)] text-[13px] mb-5">
        Freizeitausgleich aus dem Arbeitszeitkonto — kein Urlaub nach dem BUrlG. Beim Genehmigen werden die
        Stunden vom Konto abgebucht.
      </p>

      {error && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg mb-4">
          <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
          {error}
        </div>)}

      <div className="space-y-3">
        {sorted.map(r => {
            const hours = Number(r.hours) || 0;
            const insufficient = r.status === "pending" && hours > r.staffBalanceHours;
            return (<div key={r.id} className="border border-[var(--linie)] rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--tinte)] text-[13px]">{r.staffName}</p>
                <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                  {new Date(r.from_date).toLocaleDateString("de-DE")} – {new Date(r.to_date).toLocaleDateString("de-DE")}
                  <span className="text-[var(--tinte-matt)]"> · {r.days} Tag{r.days === 1 ? "" : "e"} · {fmtHours(hours)}</span>
                </p>
                {r.reason && <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{r.reason}</p>}
                <p className={`text-[13px] mt-1 ${insufficient ? "text-[var(--gefahr)] font-medium" : "text-[var(--tinte-matt)]"}`}>
                  Konto: {fmtHours(r.staffBalanceHours)}
                  {insufficient ? " — reicht für diesen Antrag nicht" : ""}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {r.status === "pending" ? (<>
                    <button onClick={() => decide(r.id, "approved")} disabled={busy === r.id || insufficient} title={insufficient ? "Guthaben reicht nicht" : "Genehmigen"} className="px-3 py-1.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--ok)] hover:bg-[var(--ok)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                      {busy === r.id ? <PulseLoader size={12}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>}
                      Genehmigen
                    </button>
                    <button onClick={() => decide(r.id, "declined")} disabled={busy === r.id} className="px-3 py-1.5 rounded-lg text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-50">
                      Ablehnen
                    </button>
                  </>) : (<span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold ${r.status === "approved" ? "bg-[var(--ok-flaeche)] text-[var(--ok)]" : "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]"}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>
                      {r.status === "approved" ? "check_circle" : "cancel"}
                    </span>
                    {r.status === "approved" ? "Genehmigt" : "Abgelehnt"}
                  </span>)}
              </div>
            </div>);
        })}
      </div>
    </div>);
}

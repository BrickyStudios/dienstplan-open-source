"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import { todayISO } from "@/lib/date";
type ReqStatus = "pending" | "approved" | "declined";
type FlextimeRequest = {
    id: string;
    from_date: string;
    to_date: string;
    days: number;
    hours: number;
    reason: string | null;
    status: ReqStatus;
    review_note?: string | null;
    submitted_at: string;
};
const STATUS: Record<ReqStatus, {
    label: string;
    icon: string;
    className: string;
}> = {
    pending: { label: "Offen", icon: "schedule", className: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" },
    approved: { label: "Genehmigt", icon: "check_circle", className: "bg-[var(--ok-flaeche)] text-[var(--ok)]" },
    declined: { label: "Abgelehnt", icon: "cancel", className: "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" },
};
function fmtHours(h: number): string {
    return `${(Math.round(h * 100) / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
}
export default function FlextimeSection() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<FlextimeRequest[]>([]);
    const [balance, setBalance] = useState(0);
    const [hoursPerDay, setHoursPerDay] = useState(8);
    const [maxWeek, setMaxWeek] = useState<number | null>(null);
    const [maxMonth, setMaxMonth] = useState<number | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ from: "", to: "", reason: "" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const today = todayISO();
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/mitarbeiter/flextime-requests");
                if (!res.ok) {
                    setLoading(false);
                    return;
                }
                const d = await res.json();
                setEnabled(d.enabled === true && d.tableMissing !== true);
                setRequests((d.requests ?? []) as FlextimeRequest[]);
                setBalance(Number(d.balanceHours) || 0);
                setHoursPerDay(Number(d.hoursPerDay) || 8);
                setMaxWeek(d.maxDaysPerWeek ?? null);
                setMaxMonth(d.maxDaysPerMonth ?? null);
            }
            catch { }
            setLoading(false);
        })();
    }, []);
    const selectedDays = form.from && form.to && form.to >= form.from
        ? Math.round((Date.parse(form.to + "T00:00:00Z") - Date.parse(form.from + "T00:00:00Z")) / 86400000) + 1
        : 0;
    const neededHours = Math.round(selectedDays * hoursPerDay * 100) / 100;
    const overBalance = neededHours > balance;
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        if (form.from < today) {
            setError("Gleitzeittage können nicht rückwirkend beantragt werden.");
            return;
        }
        if (form.to < form.from) {
            setError("Das Enddatum darf nicht vor dem Startdatum liegen.");
            return;
        }
        if (overBalance) {
            setError(`Dein Guthaben reicht nicht: ${fmtHours(balance)} vorhanden, ${fmtHours(neededHours)} nötig.`);
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch("/api/mitarbeiter/flextime-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from_date: form.from, to_date: form.to, reason: form.reason || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.request) {
                setRequests(prev => [json.request as FlextimeRequest, ...prev]);
                setForm({ from: "", to: "", reason: "" });
                setShowForm(false);
            }
            else {
                setError(json.error ?? "Antrag konnte nicht gespeichert werden.");
            }
        }
        catch {
            setError("Keine Verbindung — bitte erneut versuchen.");
        }
        setSubmitting(false);
    }
    async function withdraw(id: string) {
        const res = await fetch("/api/mitarbeiter/flextime-requests", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        if (res.ok)
            setRequests(prev => prev.filter(r => r.id !== id));
    }
    if (loading || !enabled)
        return null;
    const limitHint = [
        maxWeek != null ? `max. ${maxWeek} pro Woche` : null,
        maxMonth != null ? `max. ${maxMonth} pro Monat` : null,
    ].filter(Boolean).join(" · ");
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-[var(--tinte)] text-[16px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>more_time</span>
            Gleitzeittage
          </h2>
          <p className="text-[var(--tinte-matt)] text-[13px] mt-1">
            Freizeitausgleich aus deinem Arbeitszeitkonto — kein Urlaub, dein Urlaubsanspruch bleibt unberührt.
            {limitHint ? ` (${limitHint})` : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[26px] font-semibold text-[var(--tinte)] leading-none">{fmtHours(balance)}</p>
          <p className="text-[var(--tinte-matt)] text-[13px] mt-1">Guthaben ≈ {Math.floor(balance / hoursPerDay)} Tag(e)</p>
        </div>
      </div>

      {!showForm && (<button onClick={() => { setShowForm(true); setError(""); }} disabled={balance < hoursPerDay} className="flex items-center gap-2 px-4 py-2 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Gleitzeittag beantragen
        </button>)}
      {!showForm && balance < hoursPerDay && (<p className="text-[13px] text-[var(--tinte-matt)]">
          Für einen ganzen Tag brauchst du {fmtHours(hoursPerDay)} Guthaben. Guthaben entsteht aus Überstunden beim Monatsabschluss.
        </p>)}

      {showForm && (<form onSubmit={submit} className="space-y-4 border-t border-[var(--linie)] pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="flextimesection-von" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Von</label>
              <input id="flextimesection-von" type="date" required value={form.from} min={today} onChange={e => setForm(f => ({ ...f, from: e.target.value, to: f.to && f.to < e.target.value ? "" : f.to }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
            </div>
            <div>
              <label htmlFor="flextimesection-bis" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Bis</label>
              <input id="flextimesection-bis" type="date" required value={form.to} min={form.from || today} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
            </div>
          </div>

          {selectedDays > 0 && (<div className={`rounded-lg px-4 py-2.5 flex items-center gap-2 border ${overBalance ? "bg-[var(--gefahr-flaeche)] border-[var(--linie)]" : "bg-[var(--akzent-flaeche)] border-[var(--linie)]"}`}>
              <span className={`material-symbols-outlined ${overBalance ? "text-[var(--gefahr)]" : "text-[var(--akzent)]"}`} style={{ fontSize: 16 }}>
                {overBalance ? "warning" : "schedule"}
              </span>
              <span className={`text-[13px] font-medium ${overBalance ? "text-[var(--gefahr)]" : "text-[var(--akzent)]"}`}>
                {selectedDays} Tag{selectedDays === 1 ? "" : "e"} · {fmtHours(neededHours)} vom Konto
                {overBalance ? ` — nur ${fmtHours(balance)} vorhanden` : ` · Rest ${fmtHours(balance - neededHours)}`}
              </span>
            </div>)}

          <div>
            <label htmlFor="flextimesection-grund-optional" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Grund (optional)</label>
            <input id="flextimesection-grund-optional" type="text" value={form.reason} maxLength={200} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
          </div>

          {error && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
              {error}
            </div>)}

          <div className="flex gap-3">
            <button type="submit" disabled={submitting || overBalance || selectedDays === 0} className="flex-1 py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-[13px]">
              {submitting && <PulseLoader size={16}/>}
              {submitting ? "Wird gesendet…" : "Beantragen"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(""); }} className="px-5 py-2.5 border border-[var(--linie)] text-[var(--tinte-matt)] font-medium rounded-lg hover:bg-[var(--papier-tief)] transition-colors text-[13px]">
              Abbrechen
            </button>
          </div>
        </form>)}

      {requests.length > 0 && (<div className="space-y-2 border-t border-[var(--linie)] pt-4">
          {requests.map(r => {
                const cfg = STATUS[r.status] ?? STATUS.pending;
                return (<div key={r.id} className="flex items-start justify-between gap-3 border border-[var(--linie)] rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium text-[var(--tinte)] text-[13px]">
                    {new Date(r.from_date).toLocaleDateString("de-DE")} – {new Date(r.to_date).toLocaleDateString("de-DE")}
                    <span className="text-[var(--tinte-matt)] font-normal"> · {r.days} Tag{r.days === 1 ? "" : "e"} · {fmtHours(Number(r.hours) || 0)}</span>
                  </p>
                  {r.reason && <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{r.reason}</p>}
                  {r.review_note && (<p className={`text-[13px] mt-1 font-medium ${r.status === "approved" ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>
                      → {r.review_note}
                    </p>)}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold ${cfg.className}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                  {r.status === "pending" && (<button onClick={() => withdraw(r.id)} title="Zurückziehen" className="text-[var(--tinte-matt)] hover:text-[var(--gefahr)] transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>)}
                </div>
              </div>);
            })}
        </div>)}
    </div>);
}

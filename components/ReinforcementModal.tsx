"use client";
import { useState, useEffect } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import { track } from "@/lib/useAnalytics";
import { useLang } from "@/lib/LanguageContext";
import { todayISO } from "@/lib/date";
import Modal from "@/components/Modal";
type Station = {
    name: string;
};
const TODAY = todayISO();
const SHIFTS = [
    { v: "Frühschicht", k: "shift.frueh" }, { v: "Spätschicht", k: "shift.spaet" }, { v: "Nachtschicht", k: "shift.nacht" },
] as const;
export default function ReinforcementModal({ onClose }: {
    onClose: () => void;
}) {
    const { t } = useLang();
    const [stations, setStations] = useState<Station[]>([]);
    const [form, setForm] = useState({ station: "", date: TODAY, shift: "", note: "" });
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    useEffect(() => {
        (async () => {
            const res = await fetch("/api/leitung/stations").catch(() => null);
            if (res?.ok) {
                const d = await res.json();
                setStations((d.stations ?? []).map((s: {
                    name: string;
                }) => ({ name: s.name })));
            }
        })();
    }, []);
    async function send() {
        setSending(true);
        const res = await fetch("/api/leitung/reinforcement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ station: form.station || null, date: form.date, shift_type: form.shift || null, note: form.note || null }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
            track("dashboard_request_reinforcement");
            const parts: string[] = [];
            if (d.springerNotified)
                parts.push(`${d.springerNotified} Springer`);
            if (d.leitungNotified)
                parts.push(`${d.leitungNotified} Leitung${d.leitungNotified > 1 ? "en" : ""}`);
            setResult({ ok: true, text: parts.length ? `${parts.join(" + ")}` + " ✓" : t("rf.sentNobody") });
        }
        else {
            setResult({ ok: false, text: d.error ?? t("rf.failed") });
        }
        setSending(false);
    }
    return (<Modal open onClose={onClose} title={t("rf.title")} description={t("rf.subtitle")} widthClass="max-w-md">
      {result ? (<div className="space-y-5">
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.ok ? "bg-[var(--akzent-flaeche)] border-[var(--linie)]" : "bg-[var(--gefahr-flaeche)] border-[var(--linie)]"}`}>
            <span className={`material-symbols-outlined ${result.ok ? "text-[var(--akzent)]" : "text-[var(--gefahr)]"}`} style={{ fontSize: 20 }}>{result.ok ? "check_circle" : "error"}</span>
            <p className={`text-[13px] ${result.ok ? "text-[var(--akzent)]" : "text-[var(--gefahr)]"}`}>{result.text}</p>
          </div>
          <button onClick={onClose} className="w-full py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--tinte)] hover:bg-[var(--tinte)] transition-colors">{t("ui.close")}</button>
        </div>) : (<div className="space-y-3">
          <div>
            <label htmlFor="reinforcementmodal-station" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.station")}</label>
            <select id="reinforcementmodal-station" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
              <option value="">{t("rf.allStations")}</option>
              {stations.map(s => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reinforcementmodal-date" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.date")}</label>
              <input id="reinforcementmodal-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
            </div>
            <div>
              <label htmlFor="reinforcementmodal-shift" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.shift")}</label>
              <select id="reinforcementmodal-shift" value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
                <option value="">{t("rf.all")}</option>
                {SHIFTS.map(s => <option key={s.v} value={s.v}>{t(s.k)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="reinforcementmodal-hint" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("rf.hint")}</label>
            <input id="reinforcementmodal-hint" type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder={t("rf.hintPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">{t("ui.cancel")}</button>
            <button onClick={send} disabled={sending} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
              {sending ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>send</span>}
              {t("rf.request")}
            </button>
          </div>
        </div>)}
    </Modal>);
}

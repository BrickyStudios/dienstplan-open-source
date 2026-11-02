"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import { checkLegalLimits, type LegalFinding } from "@/lib/legal-limits";
type Settings = {
    flextime_enabled?: boolean | null;
    flextime_max_days_per_week?: number | null;
    flextime_max_days_per_month?: number | null;
    flextime_codetermination_ack?: boolean | null;
    default_overtime_compensation?: string | null;
    overtime_hours_per_day?: number | null;
    default_min_rest_hours?: number | null;
    default_max_hours_per_shift?: number | null;
    default_break_min?: number | null;
    default_break_after_minutes?: number | null;
};
function toLimit(v: string): number | null {
    if (v.trim() === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
export default function FlextimeSettingsCard({ vacationDaysDefault }: {
    vacationDaysDefault?: number | null;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [ack, setAck] = useState(false);
    const [maxWeek, setMaxWeek] = useState("");
    const [maxMonth, setMaxMonth] = useState("");
    const [comp, setComp] = useState<"payout" | "vacation" | "flextime">("payout");
    const [hoursPerDay, setHoursPerDay] = useState("8");
    const [other, setOther] = useState<Settings>({});
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/leitung/facility-settings");
                if (res.ok) {
                    const d = await res.json();
                    const s: Settings = d.settings ?? d ?? {};
                    setEnabled(s.flextime_enabled === true);
                    setAck(s.flextime_codetermination_ack === true);
                    setMaxWeek(s.flextime_max_days_per_week == null ? "" : String(s.flextime_max_days_per_week));
                    setMaxMonth(s.flextime_max_days_per_month == null ? "" : String(s.flextime_max_days_per_month));
                    const c = s.default_overtime_compensation;
                    setComp(c === "vacation" || c === "flextime" ? c : "payout");
                    setHoursPerDay(s.overtime_hours_per_day == null ? "8" : String(s.overtime_hours_per_day));
                    setOther(s);
                }
            }
            catch { }
            setLoading(false);
        })();
    }, []);
    const findings: LegalFinding[] = checkLegalLimits({
        defaultMinRestHours: other.default_min_rest_hours,
        defaultMaxHoursPerShift: other.default_max_hours_per_shift,
        defaultVacationDays: vacationDaysDefault,
        defaultBreakMin: other.default_break_min,
        defaultBreakAfterMinutes: other.default_break_after_minutes,
        flextimeEnabled: enabled,
        flextimeCodeterminationAck: ack,
    });
    async function save() {
        setSaving(true);
        setError("");
        setSaved(false);
        try {
            const res = await fetch("/api/leitung/facility-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    flextime_enabled: enabled,
                    flextime_codetermination_ack: ack,
                    flextime_max_days_per_week: toLimit(maxWeek),
                    flextime_max_days_per_month: toLimit(maxMonth),
                    default_overtime_compensation: comp,
                    overtime_hours_per_day: hoursPerDay === "" ? null : Number(hoursPerDay),
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 4000);
            }
            else
                setError(d.error ?? "Konnte nicht gespeichert werden.");
        }
        catch {
            setError("Keine Verbindung — bitte erneut versuchen.");
        }
        setSaving(false);
    }
    if (loading)
        return null;
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-[var(--tinte)] text-[16px] flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>more_time</span>
          Gleitzeit &amp; Überstunden
        </h2>
        <p className="text-[var(--tinte-matt)] text-[13px] mt-1">
          Wie viele Gleitzeittage zulässig sind, entscheidet ihr selbst — die App gibt hier nichts vor.
          Leer lassen heisst unbegrenzt.
        </p>
      </div>

      
      <div>
        <label htmlFor="flextimesettingscard-ueberstunden-werden" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Überstunden werden…</label>
        <select id="flextimesettingscard-ueberstunden-werden" value={comp} onChange={e => setComp(e.target.value as typeof comp)} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
          <option value="payout">ausgezahlt</option>
          <option value="vacation">in Urlaubstage umgewandelt</option>
          <option value="flextime">dem Gleitzeitkonto gutgeschrieben</option>
        </select>
        <p className="text-[var(--tinte-matt)] text-[13px] mt-1.5">
          Bei &bdquo;umgewandelt&ldquo; und &bdquo;Gleitzeitkonto&ldquo; werden die Überstunden beim Monatsabschluss NICHT ausgezahlt,
          sondern gutgeschrieben — bezahlt wird dann der freie Tag, an dem sie genommen werden.
        </p>
      </div>

      <div>
        <label htmlFor="flextimesettingscard-stunden-pro-arbeitstag" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Stunden pro Arbeitstag</label>
        <input id="flextimesettingscard-stunden-pro-arbeitstag" type="number" min={1} max={24} step={0.5} value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
        <p className="text-[var(--tinte-matt)] text-[13px] mt-1.5">
          Umrechnung Stunden ↔ Tage — gilt für Gleitzeittage und für das Urlaubsentgelt in der Lohnabrechnung.
        </p>
      </div>

      
      <label className="flex items-start gap-3 cursor-pointer border-t border-[var(--linie)] pt-5">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--akzent)]"/>
        <span>
          <span className="block text-[13px] font-medium text-[var(--tinte)]">Gleitzeittage erlauben</span>
          <span className="block text-[13px] text-[var(--tinte-matt)] mt-0.5">
            Mitarbeiter können ganze Tage aus ihrem Gleitzeitguthaben beantragen. Das ist Freizeitausgleich,
            kein Urlaub — der Urlaubsanspruch bleibt unberührt. Jeder Antrag muss von der Leitung genehmigt werden.
          </span>
        </span>
      </label>

      {enabled && (<div className="grid grid-cols-2 gap-4 pl-7">
          <div>
            <label htmlFor="flextimesettingscard-max-tage-pro-woche" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Max. Tage pro Woche</label>
            <input id="flextimesettingscard-max-tage-pro-woche" type="number" min={0} max={7} value={maxWeek} placeholder="unbegrenzt" onChange={e => setMaxWeek(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
          </div>
          <div>
            <label htmlFor="flextimesettingscard-max-tage-pro-monat" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Max. Tage pro Monat</label>
            <input id="flextimesettingscard-max-tage-pro-monat" type="number" min={0} max={31} value={maxMonth} placeholder="unbegrenzt" onChange={e => setMaxMonth(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
          </div>
        </div>)}

      {enabled && (<label className="flex items-start gap-3 cursor-pointer pl-7">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--akzent)]"/>
          <span className="text-[13px] text-[var(--tinte-matt)]">
            Die Mitbestimmung ist geklärt: Es gibt keinen Betriebs-/Personalrat, oder die Gleitzeitregelung ist
            in einer Betriebs- bzw. Dienstvereinbarung geregelt (§ 87 Abs. 1 Nr. 2 BetrVG).
          </span>
        </label>)}

      
      {findings.length > 0 && (<div className="space-y-2 border-t border-[var(--linie)] pt-5">
          <p className="text-[13px] font-medium text-[var(--tinte-matt)]">Hinweise zur Rechtslage</p>
          {findings.map((f, i) => (<div key={`${f.norm}-${i}`} className={`rounded-lg border px-4 py-3 ${f.schwere === "blocker" ? "bg-[var(--gefahr-flaeche)] border-[var(--linie)]" : "bg-[var(--warnung-flaeche)] border-[var(--linie)]"}`}>
              <div className="flex items-start gap-2">
                <span className={`material-symbols-outlined flex-shrink-0 ${f.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}`} style={{ fontSize: 16 }}>
                  {f.schwere === "blocker" ? "gavel" : "info"}
                </span>
                <div>
                  <p className={`text-[13px] font-semibold ${f.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}`}>
                    {f.norm}
                  </p>
                  <p className={`text-[13px] mt-0.5 ${f.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}`}>
                    {f.text}
                  </p>
                </div>
              </div>
            </div>))}
          <p className="text-[13px] text-[var(--tinte-matt)]">
            Die Einstellung wird trotzdem gespeichert — die Entscheidung liegt bei euch. Diese Hinweise ersetzen
            keine Rechtsberatung.
          </p>
        </div>)}

      {error && (<div className="flex items-start gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg whitespace-pre-line">
          <span className="material-symbols-outlined text-[var(--gefahr)] flex-shrink-0" style={{ fontSize: 14 }}>warning</span>
          {error}
        </div>)}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-5 py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 text-[13px]">
          {saving && <PulseLoader size={16}/>}
          {saving ? "Speichert…" : "Speichern"}
        </button>
        {saved && (<span className="text-[var(--ok)] text-[13px] font-medium flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            Gespeichert
          </span>)}
      </div>
    </div>);
}

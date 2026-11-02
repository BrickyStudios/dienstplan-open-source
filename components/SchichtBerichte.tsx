"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
type Bericht = {
    timeEntryId: string;
    staffId: string;
    name: string;
    shiftDate: string;
    station: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string;
    actualEnd: string | null;
    lateMinutes: number | null;
    earlyLeaveMinutes: number | null;
    isLate: boolean;
    leftEarly: boolean;
    plannedMinutes: number | null;
    actualMinutes: number | null;
    pauseMinutes: number;
    requiredPauseMinutes: number;
    pauseCompliant: boolean;
    restHoursBefore: number | null;
    restCompliant: boolean | null;
};
type Uebersicht = {
    staffId: string;
    name: string;
    shifts: number;
    bewerteteShifts: number;
    lateCount: number;
    lateMinutesSum: number;
    worstLateMinutes: number;
    avgLateMinutes: number;
    earlyLeaveCount: number;
    pauseViolations: number;
    restViolations: number;
};
type Antwort = {
    role: "leitung" | "mitarbeiter";
    fensterTage: number;
    toleranzMinuten: number;
    ruhezeitSollStunden: number;
    berichte: Bericht[];
    uebersicht: Uebersicht[];
    gespeichert: boolean;
};
function uhr(iso: string | null): string {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function tag(datum: string): string {
    return new Date(datum + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function dauer(min: number | null): string {
    if (min == null)
        return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}
export default function SchichtBerichte({ modus }: {
    modus: "leitung" | "mitarbeiter";
}) {
    const [daten, setDaten] = useState<Antwort | null>(null);
    const [laden, setLaden] = useState(true);
    const [fehler, setFehler] = useState("");
    const [offen, setOffen] = useState<string | null>(null);
    useEffect(() => {
        fetch("/api/zeiterfassung/berichte")
            .then(async (r) => {
            const d = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error(d?.error ?? "Auswertung nicht verfügbar");
            setDaten(d);
        })
            .catch(e => setFehler(e instanceof Error ? e.message : "Auswertung nicht verfügbar"))
            .finally(() => setLaden(false));
    }, []);
    if (laden) {
        return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6 flex items-center justify-center gap-2 text-[var(--tinte-matt)]">
        <PulseLoader size={16}/>
        <span className="text-[13px]">Auswertung wird geladen…</span>
      </div>);
    }
    if (fehler || !daten) {
        return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
        <p className="text-[var(--tinte-matt)] text-[13px]">{fehler || "Auswertung nicht verfügbar."}</p>
      </div>);
    }
    const { berichte, uebersicht, toleranzMinuten, fensterTage, ruhezeitSollStunden, gespeichert } = daten;
    const detailFuer = modus === "leitung" && offen ? berichte.filter(b => b.staffId === offen) : berichte;
    const erklaerung = (<div className="px-6 py-3 bg-[var(--papier-tief)] border-t border-[var(--linie)] text-[13px] text-[var(--tinte-matt)] leading-relaxed">
      Verglichen wird die Zeiterfassung mit der geplanten Schicht, Zeitraum {fensterTage} Tage.
      Unter {toleranzMinuten} Minuten gilt nicht als Verspätung — der Stempel hängt an Geräteuhr und
      Weg zum Terminal, feiner misst er nicht. Pausenvorgabe nach § 4 ArbZG (über 6 h: 30 min, über 9 h: 45 min),
      Ruhezeit nach § 5 ArbZG ({ruhezeitSollStunden} h).
      {modus === "leitung"
            ? " Die Auswertung ist nach § 87 Abs. 1 Nr. 6 BetrVG mitbestimmungspflichtig; jede beschäftigte Person sieht ihre eigene Auswertung in derselben Ansicht."
            : " Diese Auswertung sieht auch deine Leitung — für dich ist sie hier offen einsehbar, weil verdeckte Verhaltenskontrolle unzulässig wäre (§ 87 Abs. 1 Nr. 6 BetrVG)."}
    </div>);
    return (<div className="space-y-4">
      {!gespeichert && (<div className="bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[var(--warnung)] flex-shrink-0 mt-0.5" style={{ fontSize: 16 }}>warning</span>
          <div>
            <p className="text-[var(--warnung)] font-semibold text-[13px]">Auswertung wird noch nicht dauerhaft gespeichert</p>
            <p className="text-[var(--warnung)] text-[13px] mt-0.5">
              Die Tabelle <code className="font-mono">shift_reports</code> fehlt in der Datenbank. Migration{" "}
              <code className="font-mono">supabase/migrations/20260909_shift_reports.sql</code> im Supabase SQL-Editor ausführen.
              Bis dahin wird bei jedem Aufruf frisch gerechnet.
            </p>
          </div>
        </div>)}

      
      {modus === "leitung" && (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--linie)]">
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Pünktlichkeit</h2>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
              Letzte {fensterTage} Tage · Zeile öffnen zeigt die einzelnen Schichten
            </p>
          </div>

          {uebersicht.length === 0 ? (<p className="px-6 py-6 text-[13px] text-[var(--tinte-matt)]">
              Noch keine abgeschlossenen Schichten im Zeitraum.
            </p>) : (<div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--papier-tief)] text-[var(--tinte-matt)]">
                  <tr>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Dienste</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Zu spät</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Ø / max.</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Früher gegangen</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Pause</th>
                    <th className="px-6 py-3 text-[13px] font-semibold uppercase tracking-wider">Ruhezeit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--linie)]">
                  {uebersicht.map(u => (<tr key={u.staffId} onClick={() => setOffen(offen === u.staffId ? null : u.staffId)} className={`cursor-pointer transition-colors ${offen === u.staffId ? "bg-[var(--akzent-flaeche)]" : "hover:bg-[var(--papier-tief)]"}`}>
                      <td className="px-6 py-3 font-medium text-[var(--tinte)]">
                        <span className="inline-flex items-center gap-2">
                          {u.name}
                          <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 14 }}>
                            {offen === u.staffId ? "expand_less" : "expand_more"}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-3 text-[var(--tinte-matt)] tabular-nums">
                        {u.shifts}
                        {u.bewerteteShifts < u.shifts && (<span className="text-[13px]"> ({u.bewerteteShifts} mit Plan)</span>)}
                      </td>
                      <td className="px-6 py-3 tabular-nums">
                        {u.lateCount > 0 ? (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)]">
                            {u.lateCount}× zu spät
                          </span>) : (<span className="text-[var(--ok)] text-[13px]">pünktlich</span>)}
                      </td>
                      <td className="px-6 py-3 text-[var(--tinte-matt)] tabular-nums">
                        {u.lateCount > 0 ? `${u.avgLateMinutes} / ${u.worstLateMinutes} min` : "—"}
                      </td>
                      <td className="px-6 py-3 text-[var(--tinte-matt)] tabular-nums">{u.earlyLeaveCount > 0 ? `${u.earlyLeaveCount}×` : "—"}</td>
                      <td className="px-6 py-3 tabular-nums">
                        {u.pauseViolations > 0 ? (<span className="text-[var(--gefahr)] font-medium">{u.pauseViolations}× zu kurz</span>) : <span className="text-[var(--tinte-matt)]">—</span>}
                      </td>
                      <td className="px-6 py-3 tabular-nums">
                        {u.restViolations > 0 ? (<span className="text-[var(--gefahr)] font-medium">{u.restViolations}× &lt; {ruhezeitSollStunden} h</span>) : <span className="text-[var(--tinte-matt)]">—</span>}
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
          {erklaerung}
        </div>)}

      
      <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--linie)]">
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">
            {modus === "leitung"
            ? (offen ? `Schichten von ${uebersicht.find(u => u.staffId === offen)?.name ?? ""}` : "Alle Schichten")
            : "Meine Schichten"}
          </h2>
          <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
            Soll aus dem Dienstplan, Ist aus der Zeiterfassung · letzte {fensterTage} Tage
          </p>
        </div>

        {detailFuer.length === 0 ? (<p className="px-6 py-6 text-[13px] text-[var(--tinte-matt)]">
            Noch keine abgeschlossenen Schichten im Zeitraum.
          </p>) : (<>
            <table className="w-full text-left text-[13px] hidden md:table">
              <thead className="bg-[var(--papier-tief)] text-[var(--tinte-matt)]">
                <tr>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Tag</th>
                  {modus === "leitung" && !offen && (<th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Name</th>)}
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Soll</th>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Ist</th>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Beginn</th>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Dauer</th>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Pause</th>
                  <th className="px-5 py-3 text-[13px] font-semibold uppercase tracking-wider">Ruhezeit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--linie)]">
                {detailFuer.slice(0, 200).map(b => (<tr key={b.timeEntryId} className="hover:bg-[var(--papier-tief)]">
                    <td className="px-5 py-3 text-[var(--tinte)] whitespace-nowrap">
                      {tag(b.shiftDate)}
                      {b.station && <span className="block text-[13px] text-[var(--tinte-matt)]">{b.station}</span>}
                    </td>
                    {modus === "leitung" && !offen && (<td className="px-5 py-3 text-[var(--tinte)] font-medium">{b.name}</td>)}
                    <td className="px-5 py-3 text-[var(--tinte-matt)] tabular-nums whitespace-nowrap">
                      {b.plannedStart ? `${uhr(b.plannedStart)} – ${uhr(b.plannedEnd)}` : "kein Plan"}
                    </td>
                    <td className="px-5 py-3 text-[var(--tinte)] tabular-nums whitespace-nowrap">
                      {uhr(b.actualStart)} – {uhr(b.actualEnd)}
                    </td>
                    <td className="px-5 py-3 tabular-nums whitespace-nowrap">
                      {b.lateMinutes == null ? (<span className="text-[var(--tinte-matt)]">—</span>) : b.isLate ? (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)]">
                          +{b.lateMinutes} min zu spät
                        </span>) : (<span className="text-[var(--ok)] text-[13px]">pünktlich</span>)}
                      {b.leftEarly && b.earlyLeaveMinutes != null && (<span className="block text-[13px] text-[var(--tinte-matt)] mt-0.5">
                          {b.earlyLeaveMinutes} min früher gegangen
                        </span>)}
                    </td>
                    <td className="px-5 py-3 text-[var(--tinte-matt)] tabular-nums whitespace-nowrap">
                      {dauer(b.actualMinutes)}
                      {b.plannedMinutes != null && (<span className="block text-[13px]">Soll {dauer(b.plannedMinutes)}</span>)}
                    </td>
                    <td className="px-5 py-3 tabular-nums whitespace-nowrap">
                      <span className={b.pauseCompliant ? "text-[var(--tinte-matt)]" : "text-[var(--gefahr)] font-medium"}>
                        {b.pauseMinutes} / {b.requiredPauseMinutes} min
                      </span>
                      {!b.pauseCompliant && (<span className="block text-[13px] text-[var(--gefahr)]">§ 4 ArbZG nicht erfüllt</span>)}
                    </td>
                    <td className="px-5 py-3 tabular-nums whitespace-nowrap">
                      {b.restHoursBefore == null ? (<span className="text-[var(--tinte-matt)]">—</span>) : (<span className={b.restCompliant === false ? "text-[var(--gefahr)] font-medium" : "text-[var(--tinte-matt)]"}>
                          {b.restHoursBefore.toLocaleString("de-DE", { maximumFractionDigits: 1 })} h
                          {b.restCompliant === false && <span className="block text-[13px]">unter {ruhezeitSollStunden} h</span>}
                        </span>)}
                    </td>
                  </tr>))}
              </tbody>
            </table>

            
            <div className="md:hidden divide-y divide-[var(--linie)]">
              {detailFuer.slice(0, 60).map(b => (<div key={b.timeEntryId} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[var(--tinte)]">{tag(b.shiftDate)}</span>
                    <span className="text-[13px] tabular-nums text-[var(--tinte-matt)]">
                      {uhr(b.actualStart)} – {uhr(b.actualEnd)}
                    </span>
                  </div>
                  {modus === "leitung" && !offen && (<p className="text-[13px] text-[var(--tinte)] mt-0.5">{b.name}</p>)}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {b.isLate && b.lateMinutes != null && (<span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)]">
                        +{b.lateMinutes} min zu spät
                      </span>)}
                    {!b.pauseCompliant && (<span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)]">
                        Pause {b.pauseMinutes}/{b.requiredPauseMinutes} min
                      </span>)}
                    {b.restCompliant === false && (<span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)]">
                        Ruhezeit {b.restHoursBefore?.toLocaleString("de-DE", { maximumFractionDigits: 1 })} h
                      </span>)}
                    {b.lateMinutes != null && !b.isLate && !b.leftEarly && b.pauseCompliant && b.restCompliant !== false && (<span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]">
                        ohne Beanstandung
                      </span>)}
                  </div>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1.5 tabular-nums">
                    Ist {dauer(b.actualMinutes)}
                    {b.plannedMinutes != null ? ` · Soll ${dauer(b.plannedMinutes)}` : " · kein Plan hinterlegt"}
                    {` · Pause ${b.pauseMinutes}/${b.requiredPauseMinutes} min`}
                  </p>
                </div>))}
            </div>
          </>)}
        {modus === "mitarbeiter" && erklaerung}
      </div>
    </div>);
}

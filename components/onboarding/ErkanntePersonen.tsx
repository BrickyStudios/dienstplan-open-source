"use client";
import { berufeFuer } from "@/lib/berufe";
import type { MitarbeiterVorschlag } from "@/lib/scheduling/praxis-raster";
const BERUFE = berufeFuer("praxis").flatMap(g => g.berufe);
export default function ErkanntePersonen({ personen, onChange }: {
    personen: MitarbeiterVorschlag[];
    onChange: (p: MitarbeiterVorschlag[]) => void;
}) {
    const setze = (i: number, teil: Partial<MitarbeiterVorschlag>) => onChange(personen.map((p, idx) => idx === i ? { ...p, ...teil } : p));
    const gewaehlt = personen.filter(p => p.vorausgewaehlt && p.name.trim()).length;
    const feld = "px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]";
    return (<div className="mt-5 rounded-xl border border-[var(--linie)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <p className="text-[13px] font-semibold text-[var(--tinte)]">Aus Ihrem Dienstplan</p>
        <p className="text-[13px] text-[var(--tinte-matt)]">{gewaehlt} von {personen.length} werden angelegt</p>
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] mb-3">
        Bitte die Namen prüfen, die Texterkennung verliest sich gelegentlich. Die Personen werden beim Abschluss
        ohne Zugang angelegt; Einladungen verschicken Sie danach unter „Mitarbeiter“.
      </p>
      <ul className="space-y-2">
        {personen.map((p, i) => (<li key={i} className="flex flex-wrap items-center gap-2">
            <input type="checkbox" checked={p.vorausgewaehlt} aria-label={`${p.name} anlegen`} onChange={e => setze(i, { vorausgewaehlt: e.target.checked })} className="w-4 h-4 accent-[var(--akzent)]"/>
            <input value={p.name} aria-label="Name" maxLength={60} onChange={e => setze(i, { name: e.target.value })} className={`${feld} flex-1 min-w-[10rem]`}/>
            <select value={p.beruf} aria-label="Beruf" onChange={e => setze(i, { beruf: e.target.value })} className={`${feld} max-w-full`}>
              {BERUFE.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="inline-flex items-center gap-1">
              <input type="number" min={1} max={60} value={p.wochenstunden ?? ""} placeholder="40" aria-label="Wochenstunden" onChange={e => setze(i, { wochenstunden: e.target.value ? Math.max(1, Math.min(60, Number(e.target.value))) : null })} className={`${feld} w-16`}/>
              <span className="text-[13px] text-[var(--tinte-matt)]">Std./Woche</span>
            </span>
          </li>))}
      </ul>
    </div>);
}

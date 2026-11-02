"use client";
import { WOCHENTAGE, type ClosedSlots, type Schichtart, type Turnus } from "@/lib/scheduling/praxis-raster";
export type RasterSchicht = {
    name: string;
    start: string;
    end: string;
    art: string;
};
export default function Wochenraster({ schichten, geschlossen, turnus, bedarf, mindestens, aerzte, onToggle, onBedarf, onMindestens, onAerzte, }: {
    schichten: RasterSchicht[];
    geschlossen: ClosedSlots;
    turnus?: Turnus | null;
    bedarf: (art: string) => number;
    mindestens: (art: string) => number | null;
    aerzte?: (art: string) => number;
    onToggle?: (dow: number, art: string) => void;
    onBedarf?: (art: string, n: number) => void;
    onMindestens?: (art: string, n: number | null) => void;
    onAerzte?: (art: string, n: number) => void;
}) {
    const istZu = (dow: number, art: string) => (geschlossen[String(dow)] ?? []).includes(art);
    const bearbeitbar = Boolean(onToggle);
    return (<div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-separate border-spacing-0.5 sm:border-spacing-1 text-[13px]">
          <thead>
            <tr>
              <th className="text-left font-medium text-[var(--tinte-leise)] pr-1"/>
              {WOCHENTAGE.map(w => (<th key={w.dow} scope="col" className="font-medium text-[var(--tinte-leise)] w-7 sm:w-9">
                  <abbr title={w.name} className="no-underline">{w.name.slice(0, 2)}</abbr>
                </th>))}
            </tr>
          </thead>
          <tbody>
            {schichten.map(s => (<tr key={s.art}>
                <th scope="row" className="text-left font-normal pr-1 align-middle">
                  <span className="block text-[var(--tinte)] font-medium leading-tight truncate max-w-[4rem] sm:max-w-[7.5rem]">{s.name}</span>
                  <span className="block text-[var(--tinte-leise)] leading-tight tabular-nums">{s.start}–{s.end}</span>
                </th>
                {WOCHENTAGE.map(w => {
                const zu = istZu(w.dow, s.art);
                const alle = zu ? null : turnus?.[String(w.dow)]?.[s.art as Schichtart]?.alle ?? null;
                const zelle = `h-8 w-7 sm:h-9 sm:w-9 rounded-md border text-center align-middle ${zu ? "border-[var(--linie)] bg-[var(--papier-tief)] text-[var(--tinte-leise)]"
                    : alle ? "border-dashed border-[var(--akzent)] bg-[var(--papier)] text-[var(--akzent)] font-semibold text-[13px]"
                        : "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)] font-semibold"}`;
                const inhalt = zu ? "–" : alle ? `${alle}W` : "✓";
                const label = `${s.name} am ${w.name}: ${zu ? "geschlossen" : alle ? `jede ${alle}. Woche` : "offen"}`;
                return (<td key={w.dow} className="p-0">
                      {bearbeitbar ? (<button type="button" onClick={() => onToggle!(w.dow, s.art)} aria-pressed={!zu} aria-label={label} title={label} className={`${zelle} hover:border-[var(--tinte-leise)] transition-colors`}>
                          {inhalt}
                        </button>) : (<div className={`${zelle} flex items-center justify-center`} aria-label={label} title={label}>{inhalt}</div>)}
                    </td>);
            })}
              </tr>))}
          </tbody>
        </table>
      </div>
      {bearbeitbar && <p className="text-[13px] text-[var(--tinte-leise)] mt-1">Antippen schaltet weiter: jede Woche ✓ → jede zweite Woche „2W“ → geschlossen –.</p>}
      {(() => {
            const eintraege = WOCHENTAGE.flatMap(w => schichten
                .filter(s => !istZu(w.dow, s.art))
                .map(s => ({ w, s, alle: turnus?.[String(w.dow)]?.[s.art as Schichtart]?.alle }))
                .filter(e => e.alle));
            if (!eintraege.length)
                return null;
            return (<ul className="mt-2 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
            {eintraege.map(({ w, s, alle }) => (<li key={`${w.dow}-${s.art}`}>
                <span className="inline-block min-w-[2.25rem] mr-1.5 px-1 rounded border border-dashed border-[var(--akzent)] text-center font-semibold text-[var(--akzent)]">{alle}W</span>
                {s.name} am {w.name}: nur alle {alle} Wochen
              </li>))}
          </ul>);
        })()}

      <div className="mt-4 space-y-2">
        {schichten.map(s => {
            const soll = bedarf(s.art);
            const min = mindestens(s.art);
            const aerzteN = aerzte?.(s.art);
            const teamWort = aerzte ? "Praxisteam" : "Soll";
            return (<div key={s.art} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--linie)] px-3 py-2">
              <span className="text-[13px] font-medium text-[var(--tinte)] min-w-[6rem]">{s.name}</span>
              {aerzte && (onAerzte ? (<label className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)]">
                  Ärzte
                  <input type="number" min={0} max={30} value={aerzteN ?? 0} onChange={e => onAerzte(s.art, Math.max(0, parseInt(e.target.value) || 0))} className="w-14 px-1.5 py-1 rounded-lg border border-[var(--linie)] text-center bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]"/>
                </label>) : (<span className="text-[13px] text-[var(--tinte-matt)]">Ärzte <strong className="text-[var(--tinte)]">{aerzteN ?? 0}</strong></span>))}
              {onBedarf ? (<label className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)]">
                  {teamWort}
                  <input type="number" min={0} max={30} value={soll} onChange={e => onBedarf(s.art, Math.max(0, parseInt(e.target.value) || 0))} className="w-14 px-1.5 py-1 rounded-lg border border-[var(--linie)] text-center bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]"/>
                </label>) : (<span className="text-[13px] text-[var(--tinte-matt)]">{teamWort} <strong className="text-[var(--tinte)]">{soll}</strong></span>)}
              {onMindestens ? (<label className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)]">
                  {aerzte ? "Ersatz im Team erst unter" : "Ersatz erst unter"}
                  <input type="number" min={0} max={soll} value={min ?? soll} onChange={e => {
                        const n = parseInt(e.target.value);
                        onMindestens(s.art, Number.isFinite(n) ? Math.max(0, Math.min(soll, n)) : null);
                    }} className="w-14 px-1.5 py-1 rounded-lg border border-[var(--linie)] text-center bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]"/>
                </label>) : (<span className="text-[13px] text-[var(--tinte-matt)]">{aerzte ? "Ersatz im Team erst unter" : "Ersatz erst unter"} <strong className="text-[var(--tinte)]">{min ?? soll}</strong></span>)}
            </div>);
        })}
      </div>
    </div>);
}

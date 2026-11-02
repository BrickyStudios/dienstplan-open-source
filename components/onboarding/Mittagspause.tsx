"use client";
import type { Mittagspause as Zeit } from "@/lib/scheduling/praxis-raster";
const VORGABE: Zeit = { start: "12:00", end: "13:00" };
export default function Mittagspause({ wert, onChange }: {
    wert: Zeit | null;
    onChange: (z: Zeit | null) => void;
}) {
    const feld = "px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]";
    const ungueltig = wert && wert.start >= wert.end;
    return (<div className="mt-5">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={!!wert} onChange={e => onChange(e.target.checked ? (wert ?? VORGABE) : null)} className="mt-0.5 accent-[var(--akzent)]"/>
        <span>
          <span className="block text-[13px] font-semibold text-[var(--tinte)]">Praxis mittags geschlossen</span>
          <span className="block text-[13px] text-[var(--tinte-matt)]">
            Alle machen gleichzeitig Pause. Der Vormittag endet mit Beginn der Pause, der Nachmittag beginnt mit ihrem Ende.
          </span>
        </span>
      </label>
      {wert && (<div className="mt-2.5 ml-6 flex flex-wrap items-center gap-2">
          <input type="time" aria-label="Mittagspause von" value={wert.start} className={feld} onChange={e => onChange({ ...wert, start: e.target.value })}/>
          <span className="text-[var(--tinte-leise)] text-[13px]">–</span>
          <input type="time" aria-label="Mittagspause bis" value={wert.end} className={feld} onChange={e => onChange({ ...wert, end: e.target.value })}/>
          {ungueltig && <span role="alert" className="text-[13px] text-[var(--gefahr)]">Das Ende muss nach dem Beginn liegen.</span>}
        </div>)}
    </div>);
}

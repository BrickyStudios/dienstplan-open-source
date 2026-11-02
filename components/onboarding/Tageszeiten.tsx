"use client";
import { Plus, Trash2 } from "lucide-react";
import { WOCHENTAGE, type Schichtart, type TagesZeiten } from "@/lib/scheduling/praxis-raster";
type Schicht = {
    art: string;
    name: string;
    start: string;
    end: string;
};
export default function Tageszeiten({ schichten, zeiten, onChange }: {
    schichten: Schicht[];
    zeiten: TagesZeiten;
    onChange: (z: TagesZeiten) => void;
}) {
    const zeilen = WOCHENTAGE.flatMap(wt => schichten
        .filter(s => zeiten[String(wt.dow)]?.[s.art as Schichtart])
        .map(s => ({ wt, s, z: zeiten[String(wt.dow)]![s.art as Schichtart]! })));
    function setze(dow: number, art: string, wert: {
        start: string;
        end: string;
    } | null) {
        const tag = { ...(zeiten[String(dow)] ?? {}) };
        if (wert)
            tag[art as Schichtart] = wert;
        else
            delete tag[art as Schichtart];
        const neu = { ...zeiten, [String(dow)]: tag };
        if (!Object.keys(tag).length)
            delete neu[String(dow)];
        onChange(neu);
    }
    function hinzufuegen() {
        for (const s of schichten) {
            const wt = WOCHENTAGE.find(w => !zeiten[String(w.dow)]?.[s.art as Schichtart]);
            if (wt) {
                setze(wt.dow, s.art, { start: s.start, end: s.end });
                return;
            }
        }
    }
    function verschiebe(alt: {
        dow: number;
        art: string;
    }, neuDow: number, neuArt: string, z: {
        start: string;
        end: string;
    }) {
        if (alt.dow === neuDow && alt.art === neuArt)
            return;
        const ohne = { ...zeiten, [String(alt.dow)]: { ...(zeiten[String(alt.dow)] ?? {}) } };
        delete ohne[String(alt.dow)]![alt.art as Schichtart];
        if (!Object.keys(ohne[String(alt.dow)]!).length)
            delete ohne[String(alt.dow)];
        onChange({ ...ohne, [String(neuDow)]: { ...(ohne[String(neuDow)] ?? {}), [neuArt]: z } });
    }
    const feld = "px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]";
    return (<div className="mt-5">
      <p className="text-[13px] font-semibold text-[var(--tinte)] mb-0.5">An einzelnen Tagen andere Zeiten</p>
      <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">
        Zum Beispiel montags ab 7 Uhr statt ab 8. An allen übrigen Tagen gilt die Zeit oben.
      </p>
      {zeilen.length > 0 && (<div className="space-y-2">
          {zeilen.map(({ wt, s, z }) => (<div key={`${wt.dow}-${s.art}`} className="flex flex-wrap items-center gap-2">
              <select aria-label="Wochentag" value={wt.dow} className={feld} onChange={e => verschiebe({ dow: wt.dow, art: s.art }, Number(e.target.value), s.art, z)}>
                {WOCHENTAGE.map(w => <option key={w.dow} value={w.dow}>{w.name}</option>)}
              </select>
              <select aria-label="Schicht" value={s.art} className={feld} onChange={e => verschiebe({ dow: wt.dow, art: s.art }, wt.dow, e.target.value, z)}>
                {schichten.map(x => <option key={x.art} value={x.art}>{x.name}</option>)}
              </select>
              <input type="time" aria-label="Beginn" value={z.start} className={feld} onChange={e => setze(wt.dow, s.art, { ...z, start: e.target.value })}/>
              <span className="text-[var(--tinte-leise)] text-[13px]">–</span>
              <input type="time" aria-label="Ende" value={z.end} className={feld} onChange={e => setze(wt.dow, s.art, { ...z, end: e.target.value })}/>
              <button type="button" aria-label={`${wt.name} ${s.name}: Abweichung entfernen`} onClick={() => setze(wt.dow, s.art, null)} className="p-1 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors">
                <Trash2 size={13}/>
              </button>
            </div>))}
        </div>)}
      <button type="button" onClick={hinzufuegen} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] transition-colors">
        <Plus size={13}/> Zeit für einen Tag ändern
      </button>
    </div>);
}

"use client";
import { Plus, Trash2 } from "lucide-react";
import { WOCHENTAGE, type Besetzung, type Schichtart, type TagesBesetzung as Tage } from "@/lib/scheduling/praxis-raster";
type Schicht = {
    art: string;
    name: string;
    bedarf: number;
    mindestens?: number | null;
    aerzte?: number | null;
};
export default function TagesBesetzung({ schichten, besetzung, geschlossen, onChange }: {
    schichten: Schicht[];
    besetzung: Tage;
    geschlossen?: Partial<Record<string, string[]>>;
    onChange?: (b: Tage) => void;
}) {
    const zu = (dow: number, art: string) => (geschlossen?.[String(dow)] ?? []).includes(art);
    const zeilen = WOCHENTAGE.flatMap(wt => schichten
        .filter(s => besetzung[String(wt.dow)]?.[s.art as Schichtart] && !zu(wt.dow, s.art))
        .map(s => ({ wt, s, b: besetzung[String(wt.dow)]![s.art as Schichtart]! })));
    if (!onChange) {
        if (!zeilen.length)
            return null;
        return (<div className="mt-3">
        <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">An einzelnen Tagen andere Besetzung</p>
        <ul className="space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
          {zeilen.map(({ wt, s, b }) => (<li key={`${wt.dow}-${s.art}`}>
              <strong className="text-[var(--tinte)]">{wt.name} · {s.name}:</strong>{" "}
              {b.aerzte} {b.aerzte === 1 ? "Arzt" : "Ärzte"}, Praxisteam {b.bedarf}, Ersatz im Team erst unter {b.mindestens}
            </li>))}
        </ul>
      </div>);
    }
    const standard = (s: Schicht): Besetzung => ({ bedarf: s.bedarf, aerzte: s.aerzte ?? 0, mindestens: Math.min(s.bedarf, s.mindestens ?? s.bedarf) });
    function setze(dow: number, art: string, wert: Besetzung | null) {
        const tag = { ...(besetzung[String(dow)] ?? {}) };
        if (wert)
            tag[art as Schichtart] = { ...wert, mindestens: Math.min(wert.mindestens, wert.bedarf) };
        else
            delete tag[art as Schichtart];
        const neu = { ...besetzung, [String(dow)]: tag };
        if (!Object.keys(tag).length)
            delete neu[String(dow)];
        onChange!(neu);
    }
    function verschiebe(alt: {
        dow: number;
        art: string;
    }, neuDow: number, neuArt: string, b: Besetzung) {
        if (alt.dow === neuDow && alt.art === neuArt)
            return;
        const ohne: Tage = { ...besetzung, [String(alt.dow)]: { ...(besetzung[String(alt.dow)] ?? {}) } };
        delete ohne[String(alt.dow)]![alt.art as Schichtart];
        if (!Object.keys(ohne[String(alt.dow)]!).length)
            delete ohne[String(alt.dow)];
        onChange!({ ...ohne, [String(neuDow)]: { ...(ohne[String(neuDow)] ?? {}), [neuArt]: b } });
    }
    function hinzufuegen() {
        for (const s of schichten) {
            const wt = [...WOCHENTAGE].reverse().find(w => !zu(w.dow, s.art) && !besetzung[String(w.dow)]?.[s.art as Schichtart]);
            if (wt) {
                setze(wt.dow, s.art, standard(s));
                return;
            }
        }
    }
    const feld = "px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]";
    const zahl = (label: string, wert: number, max: number, set: (n: number) => void) => (<label className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)]">
      {label}
      <input type="number" min={0} max={max} value={wert} aria-label={label} onChange={e => set(Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))} className={`${feld} w-14 text-center`}/>
    </label>);
    return (<div className="mt-5">
      <p className="text-[13px] font-semibold text-[var(--tinte)] mb-0.5">An einzelnen Tagen andere Besetzung</p>
      <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">
        Zum Beispiel sonntags nur 3 statt 5. An allen übrigen Tagen gilt die Besetzung oben.
      </p>
      {zeilen.length > 0 && (<div className="space-y-2">
          {zeilen.map(({ wt, s, b }) => (<div key={`${wt.dow}-${s.art}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--linie)] px-2.5 py-2">
              <select aria-label="Wochentag" value={wt.dow} className={feld} onChange={e => verschiebe({ dow: wt.dow, art: s.art }, Number(e.target.value), s.art, b)}>
                {WOCHENTAGE.map(w => <option key={w.dow} value={w.dow}>{w.name}</option>)}
              </select>
              <select aria-label="Schicht" value={s.art} className={feld} onChange={e => verschiebe({ dow: wt.dow, art: s.art }, wt.dow, e.target.value, b)}>
                {schichten.map(x => <option key={x.art} value={x.art}>{x.name}</option>)}
              </select>
              {zahl("Ärzte", b.aerzte, 30, n => setze(wt.dow, s.art, { ...b, aerzte: n }))}
              {zahl("Praxisteam", b.bedarf, 30, n => setze(wt.dow, s.art, { ...b, bedarf: n }))}
              {zahl("Ersatz erst unter", b.mindestens, b.bedarf, n => setze(wt.dow, s.art, { ...b, mindestens: n }))}
              <button type="button" aria-label={`${wt.name} ${s.name}: Abweichung entfernen`} onClick={() => setze(wt.dow, s.art, null)} className="p-1 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors">
                <Trash2 size={13}/>
              </button>
            </div>))}
        </div>)}
      <button type="button" onClick={hinzufuegen} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] transition-colors">
        <Plus size={13}/> Besetzung für einen Tag ändern
      </button>
    </div>);
}

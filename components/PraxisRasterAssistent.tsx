"use client";
import { useEffect, useState } from "react";
import { KiLabel } from "@/components/KiLabel";
import Wochenraster from "@/components/onboarding/Wochenraster";
import TagesBesetzung from "@/components/onboarding/TagesBesetzung";
import Personalbedarf from "@/components/onboarding/Personalbedarf";
import Spracheingabe from "@/components/onboarding/Spracheingabe";
import { turnusBehalten, type PraxisRaster, type RasterVorschlag } from "@/lib/scheduling/praxis-raster";
import { keineDateien } from "@/lib/keine-dateien";
export default function PraxisRasterAssistent({ imDialog = false, onGespeichert }: {
    imDialog?: boolean;
    onGespeichert?: () => void;
} = {}) {
    const [aktuell, setAktuell] = useState<PraxisRaster | null>(null);
    const [geladen, setGeladen] = useState(false);
    const [text, setText] = useState("");
    const [vorschlag, setVorschlag] = useState<RasterVorschlag | null>(null);
    const [vonKi, setVonKi] = useState(false);
    const [gefragt, setGefragt] = useState<string[]>([]);
    const [laeuft, setLaeuft] = useState(false);
    const [speichert, setSpeichert] = useState(false);
    const [fehler, setFehler] = useState("");
    const [meldung, setMeldung] = useState("");
    useEffect(() => {
        fetch("/api/leitung/praxis-raster").then(r => r.json())
            .then((j: {
            praxis?: boolean;
            raster?: PraxisRaster;
        }) => { if (j?.praxis && j.raster)
            setAktuell(j.raster); })
            .catch(() => { })
            .finally(() => setGeladen(true));
    }, []);
    if (!geladen || !aktuell)
        return null;
    async function vorschlagen() {
        if (!aktuell || text.trim().length < 5)
            return;
        setLaeuft(true);
        setFehler("");
        setMeldung("");
        try {
            const res = await fetch("/api/onboarding/praxis-ki", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    beschreibung: `Gewünschte Änderung am bestehenden Raster: ${text.trim()}`,
                    bisher: { ...(vorschlag ?? aktuell), mitarbeitende: [], annahmen: [], hinweise: [], rueckfragen: [] },
                    gefragt: [...new Set([...gefragt, ...(vorschlag?.rueckfragen ?? [])])],
                }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.vorschlag) {
                setFehler(j.error || "Der Vorschlag hat nicht geklappt.");
                return;
            }
            const v = j.vorschlag as RasterVorschlag;
            if (vorschlag)
                setGefragt(prev => [...new Set([...prev, ...vorschlag.rueckfragen])]);
            setVorschlag({ ...v, turnus: turnusBehalten(v.turnus, aktuell.turnus) });
            setVonKi(true);
        }
        catch {
            setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
        }
        finally {
            setLaeuft(false);
        }
    }
    async function uebernehmen() {
        if (!vorschlag)
            return;
        setSpeichert(true);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/praxis-raster", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raster: vorschlag }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.raster) {
                setFehler(j.error || "Speichern hat nicht geklappt.");
                return;
            }
            setAktuell(j.raster as PraxisRaster);
            setVorschlag(null);
            setVonKi(false);
            setText("");
            setGefragt([]);
            setMeldung("Gespeichert. Neue Schichten legt der Generator ab jetzt nach diesem Raster an; bereits angelegte Schichten bleiben, wie sie sind.");
            onGespeichert?.();
        }
        catch {
            setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
        }
        finally {
            setSpeichert(false);
        }
    }
    const zeige = vorschlag ?? aktuell;
    const bedarf = (art: string) => zeige.schichten.find(s => s.art === art)?.bedarf ?? 0;
    const mindestens = (art: string) => zeige.schichten.find(s => s.art === art)?.mindestens ?? null;
    const aerzte = (art: string) => zeige.schichten.find(s => s.art === art)?.aerzte ?? 0;
    function entwurf(aendern: (r: RasterVorschlag) => RasterVorschlag) {
        if (!aktuell)
            return;
        const gespeichert = aktuell;
        setMeldung("");
        setVorschlag(prev => aendern(prev ?? { ...gespeichert, mitarbeitende: [], rueckfragen: [], annahmen: [], hinweise: [] }));
    }
    function zahl(art: string, feld: "bedarf" | "mindestens" | "aerzte", n: number | null) {
        entwurf(basis => ({
            ...basis,
            schichten: basis.schichten.map(s => {
                if (s.art !== art)
                    return s;
                const neu = { ...s, [feld]: n ?? s.bedarf };
                return { ...neu, mindestens: Math.min(neu.mindestens, neu.bedarf) };
            }),
        }));
    }
    const liste = (titel: string, eintraege?: string[]) => eintraege && eintraege.length > 0 && (<div className="mt-3">
      <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">{titel}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
        {eintraege.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>);
    return (<div id={imDialog ? undefined : "dienstplanraster"} className={imDialog ? "" : "bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6 scroll-mt-24"}>
      <div className="flex items-center justify-between gap-2 mb-1">
        {!imDialog && <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Dienstplanraster</h2>}
        {vorschlag && vonKi && <KiLabel />}
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] mb-4">
        {vorschlag
            ? "Vorschlag — noch nicht gespeichert. Prüfen Sie Tage, Zeiten und Besetzung."
            : "So legt der Generator Ihre Schichten an. Zahlen können Sie direkt ändern, alles andere unten beschreiben."}
      </p>

      <Wochenraster schichten={zeige.schichten} geschlossen={zeige.geschlossen} turnus={zeige.turnus} bedarf={bedarf} mindestens={mindestens} aerzte={aerzte} onBedarf={(art, n) => zahl(art, "bedarf", n)} onMindestens={(art, n) => zahl(art, "mindestens", n)} onAerzte={(art, n) => zahl(art, "aerzte", n)}/>
      {zeige.mittagspause && (<p className="mt-2 text-[13px] text-[var(--tinte-matt)]">Mittagspause {zeige.mittagspause.start}–{zeige.mittagspause.end}: Praxis geschlossen.</p>)}
      <TagesBesetzung schichten={zeige.schichten} besetzung={zeige.besetzungJeTag ?? {}} geschlossen={zeige.geschlossen} onChange={b => entwurf(basis => ({ ...basis, besetzungJeTag: b }))}/>
      <Personalbedarf raster={zeige}/>

      {vorschlag && (<>
          {liste("Vorschläge für Ihre Öffnungszeiten", vorschlag.empfehlungen)}
          {liste("Angenommen, weil es nicht dastand", vorschlag.annahmen)}
          {liste("Gut zu wissen", vorschlag.hinweise)}
          {liste("Noch kurz gefragt — antworten Sie einfach im Feld unten", vorschlag.rueckfragen)}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={uebernehmen} disabled={speichert} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-40 transition-colors">
              {speichert ? "Speichert …" : "Übernehmen"}
            </button>
            <button type="button" onClick={() => { setVorschlag(null); setVonKi(false); setGefragt([]); }} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] transition-colors">
              Verwerfen
            </button>
          </div>
        </>)}

      <label htmlFor="raster-aenderung" className="block mt-5 text-[13px] font-medium text-[var(--tinte)] mb-1.5">
        Was soll sich ändern?
      </label>
      <textarea id="raster-aenderung" {...keineDateien} value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={1500} placeholder="Zum Beispiel: Mittwochs kein Nachtdienst mehr. Freitags nur bis 14 Uhr. Jeden zweiten Samstag 9 bis 12 mit zwei Leuten." className="w-full px-3 py-2.5 rounded-lg border border-[var(--linie)] text-[14px] leading-relaxed bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)] resize-y"/>
      <Spracheingabe onText={t => setText(prev => `${prev.trimEnd()} ${t}`.trim().slice(0, 1500))}/>
      <p className="mt-1.5 text-[13px] text-[var(--tinte-leise)]">Bitte keine Namen oder Gesundheitsangaben. Namen werden vor dem Senden geschwärzt.</p>
      <button type="button" onClick={vorschlagen} disabled={laeuft || text.trim().length < 5} className={`mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-40 ${vorschlag ? "border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)]"
            : "text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]"}`}>
        {laeuft ? "Nurvo liest mit …" : vorschlag ? "Vorschlag anpassen" : "Änderung vorschlagen"}
      </button>

      {fehler && <div role="alert" className="mt-3 p-3 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{fehler}</div>}
      {meldung && <p role="status" className="mt-3 text-[13px] text-[var(--akzent)]">{meldung}</p>}
    </div>);
}

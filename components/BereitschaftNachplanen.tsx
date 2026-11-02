"use client";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { PulseLoader } from "@/components/PulseLoader";
const datum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
type Vorschau = {
    von: string;
    bis: string;
    tage: number;
    schonBelegt: number;
    vorschlag: {
        date: string;
        staff_name: string;
    }[];
    ohneKandidat: string[];
};
export default function BereitschaftNachplanen() {
    const confirm = useConfirm();
    const [laeuft, setLaeuft] = useState(false);
    const [meldung, setMeldung] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    async function nachplanen() {
        setLaeuft(true);
        setMeldung(null);
        try {
            const r = await fetch("/api/leitung/bereitschaft-nachplanen");
            const v = (await r.json().catch(() => ({}))) as Vorschau & {
                error?: string;
            };
            if (!r.ok)
                throw new Error(v.error ?? "Vorschau konnte nicht geladen werden.");
            if (v.tage === 0) {
                setMeldung({ ok: true, text: "Ab heute gibt es noch keinen erstellten Dienstplan — es ist nichts nachzuplanen." });
                return;
            }
            if (v.vorschlag.length === 0) {
                setMeldung({
                    ok: v.ohneKandidat.length === 0,
                    text: v.ohneKandidat.length
                        ? `Für ${v.ohneKandidat.length} Tag(e) ohne Bereitschaft ist niemand frei (alle im Dienst, abwesend oder nicht verfügbar).`
                        : `Vom ${datum(v.von)} bis ${datum(v.bis)} hat schon jeder Tag eine Bereitschaft.`,
                });
                return;
            }
            const personen = new Set(v.vorschlag.map(b => b.staff_name)).size;
            const ok = await confirm({
                title: "Bereitschaft nachplanen?",
                body: (<div className="space-y-2">
            <p>
              Vom {datum(v.von)} bis {datum(v.bis)} bekommen <strong>{v.vorschlag.length} Tage</strong> eine Bereitschaft,
              verteilt auf {personen} {personen === 1 ? "Person" : "Personen"}.
              {v.schonBelegt > 0 && ` ${v.schonBelegt} Tage haben schon eine und bleiben, wie sie sind.`}
            </p>
            {v.ohneKandidat.length > 0 && (<p className="text-[var(--warnung)]">An {v.ohneKandidat.length} Tag(en) ist niemand frei — dort bleibt es leer.</p>)}
            <p className="text-[var(--tinte-leise)]">Kein Dienst wird geändert. Die Eingeplanten werden benachrichtigt.</p>
          </div>),
                confirmLabel: "Jetzt einplanen",
            });
            if (!ok)
                return;
            const p = await fetch("/api/leitung/bereitschaft-nachplanen", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ von: v.von, bis: v.bis }),
            });
            const e = await p.json().catch(() => ({}));
            if (!p.ok)
                throw new Error(e.error ?? "Nicht eingeplant.");
            setMeldung({ ok: true, text: `${e.eingeplant} Bereitschaft(en) eingeplant, vom ${datum(e.von)} bis ${datum(e.bis)}. Sie stehen im Schichtplan und bei den Personen unter „Mein Plan".` });
        }
        catch (err) {
            setMeldung({ ok: false, text: (err as Error).message });
        }
        finally {
            setLaeuft(false);
        }
    }
    return (<div className="mt-5 pt-5 border-t border-[var(--linie)]">
      <p className="text-[13px] font-semibold text-[var(--tinte)]">Für schon erstellte Pläne</p>
      <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 mb-3">
        War der Schalter beim Erstellen aus? Dann hier nachplanen: Jeder Tag ab heute ohne Bereitschaft bekommt eine,
        nach denselben Regeln wie beim Erstellen. Dienste bleiben unverändert, vorhandene Bereitschaften auch.
      </p>
      <button type="button" onClick={nachplanen} disabled={laeuft} className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold rounded-lg border border-[var(--akzent)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-50">
        {laeuft ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>event_available</span>}
        Bereitschaft nachplanen
      </button>
      {meldung && (<p role={meldung.ok ? "status" : "alert"} className={`mt-3 text-[13px] ${meldung.ok ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>{meldung.text}</p>)}
    </div>);
}

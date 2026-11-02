"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { PulseLoader } from "@/components/PulseLoader";
const MINUTEN = [15, 30, 60, 90];
export default function VerspaetungMelden({ erlaubt, schicht }: {
    erlaubt: boolean;
    schicht: string | null;
}) {
    const [offen, setOffen] = useState(false);
    const [minuten, setMinuten] = useState<number | null>(15);
    const [notiz, setNotiz] = useState("");
    const [laeuft, setLaeuft] = useState(false);
    const [fehler, setFehler] = useState("");
    const [fertig, setFertig] = useState(false);
    function oeffnen() {
        setOffen(true);
        setFehler("");
        setFertig(false);
    }
    async function senden() {
        setLaeuft(true);
        setFehler("");
        try {
            const r = await fetch("/api/mitarbeiter/verspaetung", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ minuten, notiz }),
            });
            const j = await r.json();
            if (!r.ok)
                setFehler(j.error ?? "Senden fehlgeschlagen.");
            else
                setFertig(true);
        }
        catch {
            setFehler("Keine Verbindung — bitte ruf die Leitung an.");
        }
        finally {
            setLaeuft(false);
        }
    }
    return (<>
      <button onClick={oeffnen} className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px] font-semibold text-[var(--tinte)] hover:border-[var(--warnung)] hover:bg-[var(--papier-tief)] transition-colors">
        <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 20 }}>schedule</span>
        Ich komme zu spät
      </button>

      <Modal open={offen} onClose={() => { if (!laeuft)
        setOffen(false); }} title={fertig ? "Gemeldet" : "Ich komme zu spät"} description={!fertig && erlaubt && schicht ? `Deine Schicht: ${schicht}` : undefined} widthClass="max-w-sm" footer={!erlaubt || fertig ? (<button onClick={() => setOffen(false)} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]">
            Verstanden
          </button>) : (<>
            <button onClick={() => setOffen(false)} disabled={laeuft} className="px-4 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)]">
              Abbrechen
            </button>
            <button onClick={() => void senden()} disabled={laeuft} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-60 flex items-center gap-2">
              {laeuft && <PulseLoader size={14}/>}
              Melden
            </button>
          </>)}>
        {!erlaubt ? (<p className="text-[14px] text-[var(--tinte)] leading-relaxed">
            Deine Einrichtung nimmt Verspätungen nicht über die App an. Bitte ruf <strong>die Leitung</strong> oder
            <strong> deine Stationsleitung</strong> an.
          </p>) : fertig ? (<p className="text-[14px] text-[var(--tinte)] leading-relaxed">
            Die Leitung und deine Stationsleitung sind benachrichtigt. Komm gut an.
          </p>) : (<div className="space-y-4">
            <div>
              <p className="text-[13px] font-medium text-[var(--tinte-matt)] mb-2">Ungefähr wie viel später?</p>
              <div className="grid grid-cols-4 gap-2">
                {MINUTEN.map(m => (<button key={m} onClick={() => setMinuten(m)} aria-pressed={minuten === m} className={`py-2 rounded-lg border text-[13px] font-semibold ${minuten === m ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte)]"}`}>
                    {m} Min.
                  </button>))}
              </div>
              <button onClick={() => setMinuten(null)} aria-pressed={minuten === null} className={`mt-2 text-[13px] ${minuten === null ? "text-[var(--akzent)] font-semibold" : "text-[var(--tinte-matt)]"}`}>
                Weiß ich noch nicht
              </button>
            </div>
            <div>
              <label htmlFor="verspaetung-notiz" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Notiz (optional)</label>
              <input id="verspaetung-notiz" value={notiz} maxLength={300} onChange={e => setNotiz(e.target.value)} placeholder="z. B. Zug fällt aus" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13.5px] bg-[var(--papier-tief)] focus:bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            </div>
            {fehler && <div className="text-[13px] text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2.5">{fehler}</div>}
          </div>)}
      </Modal>
    </>);
}

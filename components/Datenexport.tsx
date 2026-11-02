"use client";
import { useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
type Ergebnis = {
    url: string;
    datei: string;
    groesse: number;
    tabellen: number;
    zeilen: number;
    dokumente: number;
    hinweise: string[];
};
export default function Datenexport() {
    const [laeuft, setLaeuft] = useState(false);
    const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
    const [fehler, setFehler] = useState("");
    async function starten() {
        setLaeuft(true);
        setFehler("");
        setErgebnis(null);
        try {
            const r = await fetch("/api/leitung/datenexport", { method: "POST" });
            const d = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error(d.error ?? "Der Export ist fehlgeschlagen.");
            setErgebnis(d);
            window.location.href = d.url;
        }
        catch (e) {
            setFehler((e as Error).message);
        }
        setLaeuft(false);
    }
    const mb = (b: number) => (b / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 });
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>download</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Alle Daten exportieren</h2>
      </div>
      <p className="text-[var(--tinte-matt)] text-[13px] leading-relaxed mb-4">
        Ein ZIP mit allem, was Nurvo über Ihre Einrichtung speichert: Personal, Dienstpläne, Zeiten,
        Urlaub, Lohn, Nachweise und die Personalakten samt Dokumenten — jede Tabelle als JSON und als
        CSV für Excel. Jederzeit, ohne Anfrage bei uns. Falls Sie Nurvo einmal verlassen, nehmen Sie
        damit alles mit.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={starten} disabled={laeuft} className="px-4 py-2 text-[13px] font-semibold text-white rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-60 flex items-center gap-2">
          {laeuft && <PulseLoader size={14}/>} {laeuft ? "Wird zusammengestellt …" : "Export erstellen"}
        </button>
        <span className="text-[13px] text-[var(--tinte-leise)]">Enthält Steuer-ID und SV-Nummer im Klartext — vertraulich ablegen.</span>
      </div>
      {fehler && <p className="text-[13px] text-[var(--gefahr)] mt-3">{fehler}</p>}
      {ergebnis && (<div className="mt-3 text-[13px] text-[var(--tinte-matt)] space-y-1">
          <p>
            <span className="text-[var(--ok)] font-medium">Fertig:</span> {ergebnis.tabellen} Tabellen, {ergebnis.zeilen.toLocaleString("de-DE")} Zeilen,{" "}
            {ergebnis.dokumente} Dokumente, {mb(ergebnis.groesse)} MB.{" "}
            <a href={ergebnis.url} className="text-[var(--akzent)] hover:underline">Erneut herunterladen</a> (Link gilt eine Stunde).
          </p>
          {ergebnis.hinweise.length > 0 && (<ul className="text-[var(--warnung)]">{ergebnis.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>)}
        </div>)}
    </div>);
}

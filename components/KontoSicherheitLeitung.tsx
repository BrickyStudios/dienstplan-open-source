"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import type { KontoBefund } from "@/app/api/leitung/konto-sicherheit/route";
type Antwort = {
    konten?: KontoBefund[];
    personen?: number;
    tage?: number;
    migrationFehlt?: boolean;
    error?: string;
};
function datum(iso: string): string {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export default function KontoSicherheitLeitung() {
    const [daten, setDaten] = useState<Antwort | null>(null);
    useEffect(() => {
        let abgebrochen = false;
        fetch("/api/leitung/konto-sicherheit")
            .then(r => r.json() as Promise<Antwort>)
            .catch((): Antwort => ({ error: "Nicht erreichbar" }))
            .then(d => { if (!abgebrochen)
            setDaten(d); });
        return () => { abgebrochen = true; };
    }, []);
    const konten = daten?.konten ?? [];
    const tage = daten?.tage ?? 30;
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>shield_person</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Sicherheit der Konten</h2>
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed mb-4">
        Fehlgeschlagene Anmeldeversuche auf die Konten Ihrer Einrichtung und Anmeldungen von
        einem Gerät oder aus einem Land, das bei der Person neu war — die letzten {tage} Tage.
        Wann sich jemand gewöhnlich anmeldet, steht hier bewusst nicht. Jede Person sieht ihren
        vollständigen Verlauf selbst unter „Mein Konto“.
      </p>

      {!daten ? (<PulseLoader size={14}/>) : daten.migrationFehlt ? (<p className="text-[13px] text-[var(--tinte-leise)]">Die Übersicht wird gerade eingerichtet.</p>) : daten.error ? (<p className="text-[13px] text-[var(--gefahr)]">Die Übersicht ließ sich nicht laden.</p>) : konten.length === 0 ? (<div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
          <span className="material-symbols-outlined text-[var(--ok)] flex-shrink-0" style={{ fontSize: 16 }}>check_circle</span>
          <p className="text-[13px] text-[var(--tinte-matt)]">
            Keine Auffälligkeiten bei {daten.personen ?? 0} Konten in den letzten {tage} Tagen.
          </p>
        </div>) : (<div className="space-y-2">
          {konten.map((k, n) => (<div key={`${k.name}-${n}`} className="px-4 py-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
              <div className="text-[13px] font-medium text-[var(--tinte)] flex items-center gap-2 flex-wrap">
                {k.name}
                {k.gesperrt && (<span className="text-[13px] font-semibold text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-2 py-0.5 rounded">
                    Angreifer gesperrt
                  </span>)}
              </div>
              {k.fehlversuche > 0 && (<div className="text-[13px] text-[var(--tinte-matt)] tabular-nums">
                  {k.fehlversuche} {k.fehlversuche === 1 ? "Fehlversuch" : "Fehlversuche"}
                  {k.laender.length > 0 && ` aus ${k.laender.join(", ")}`}
                  {k.letzterFehlversuch && `, zuletzt ${datum(k.letzterFehlversuch)}`}
                </div>)}
              {k.neueAnmeldungen.map((a, i) => (<div key={`${a.zeit}-${i}`} className="text-[13px] text-[var(--warnung)] tabular-nums">
                  Anmeldung von neuem Gerät oder Land: {a.geraet}, {a.ort ?? "Ort unbekannt"}, {datum(a.zeit)}
                </div>))}
            </div>))}
        </div>)}
    </div>);
}

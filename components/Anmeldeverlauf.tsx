"use client";
import { useEffect, useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import type { Anmeldezeile, Fehlversuchzeile } from "@/app/api/user/anmeldeverlauf/route";
type Antwort = {
    anmeldungen?: Anmeldezeile[];
    fehlversuche?: Fehlversuchzeile[];
    tage?: number;
    migrationFehlt?: boolean;
};
function zeit(iso: string): string {
    return new Date(iso).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
export default function Anmeldeverlauf() {
    const [daten, setDaten] = useState<Antwort | null>(null);
    useEffect(() => {
        let abgebrochen = false;
        fetch("/api/user/anmeldeverlauf")
            .then(r => r.json() as Promise<Antwort>)
            .catch((): Antwort => ({}))
            .then(d => { if (!abgebrochen)
            setDaten(d); });
        return () => { abgebrochen = true; };
    }, []);
    const anmeldungen = daten?.anmeldungen ?? [];
    const fehlversuche = daten?.fehlversuche ?? [];
    const tage = daten?.tage ?? 30;
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>history</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Anmeldeverlauf</h2>
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed mb-4">
        Jede neue Anmeldung mit Gerät und ungefährem Ort, dazu jeder Versuch, sich mit Ihrer
        Adresse anzumelden, der am Passwort oder am zweiten Faktor gescheitert ist. Meldet sich
        jemand von einem neuen Gerät oder aus einem neuen Land an, bekommen Sie eine Mail.
      </p>

      {!daten ? (<PulseLoader size={14}/>) : daten.migrationFehlt ? (<p className="text-[13px] text-[var(--tinte-leise)]">Der Verlauf wird gerade eingerichtet.</p>) : (<div className="space-y-4">
          {fehlversuche.length > 0 ? (<div>
              <div className="flex items-center gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg mb-2">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                <span>
                  {fehlversuche.length === 1 ? "Ein fehlgeschlagener Versuch" : `${fehlversuche.length} fehlgeschlagene Versuche`}{" "}
                  in den letzten {tage} Tagen. Waren Sie das nicht, ändern Sie Ihr Passwort.
                </span>
              </div>
              <ul className="space-y-1">
                {fehlversuche.slice(0, 10).map((f, i) => (<li key={`${f.zeit}-${i}`} className="text-[13px] text-[var(--tinte-matt)] tabular-nums px-4">
                    {zeit(f.zeit)} · {f.stufe} falsch · {f.ort ?? "Ort unbekannt"} · {f.ip}
                    {f.gesperrt && <span className="text-[var(--gefahr)]"> · Adresse gesperrt</span>}
                  </li>))}
              </ul>
            </div>) : (<div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
              <span className="material-symbols-outlined text-[var(--ok)] flex-shrink-0" style={{ fontSize: 16 }}>check_circle</span>
              <p className="text-[13px] text-[var(--tinte-matt)]">
                Keine fehlgeschlagenen Anmeldeversuche in den letzten {tage} Tagen.
              </p>
            </div>)}

          {anmeldungen.length === 0 ? (<p className="text-[13px] text-[var(--tinte-leise)]">Noch keine Anmeldungen erfasst.</p>) : (<div className="space-y-2">
              {anmeldungen.map((a, i) => (<div key={`${a.zeit}-${i}`} className="px-4 py-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
                  <div className="text-[13px] font-medium text-[var(--tinte)] flex items-center gap-2 flex-wrap">
                    {a.geraet}
                    {a.neu && (<span className="text-[13px] font-semibold text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] px-2 py-0.5 rounded">
                        neues Gerät oder Land
                      </span>)}
                  </div>
                  <div className="text-[13px] text-[var(--tinte-matt)] tabular-nums">
                    {zeit(a.zeit)} · {a.ort ?? "Ort unbekannt"}{a.ip ? ` · ${a.ip}` : ""}
                  </div>
                </div>))}
            </div>)}
        </div>)}
    </div>);
}

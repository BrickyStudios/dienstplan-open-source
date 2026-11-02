"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PulseLoader } from "@/components/PulseLoader";
import { geraetKurz } from "@/lib/sicherheit/geraet";
type Sitzung = {
    id: string;
    erstellt: string;
    zuletzt: string;
    aal: string;
    geraet: string | null;
    ip: string | null;
    aktuell?: boolean;
};
function zeit(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
export default function Sitzungen() {
    const supabase = createClient();
    const [sitzungen, setSitzungen] = useState<Sitzung[]>([]);
    const [laedt, setLaedt] = useState(true);
    const [migrationFehlt, setMigrationFehlt] = useState(false);
    const [hinweis, setHinweis] = useState("");
    const [laeuft, setLaeuft] = useState(false);
    const [meldung, setMeldung] = useState("");
    type Antwort = {
        sessions: Sitzung[];
        migrationNeeded: boolean;
        hinweis: string;
    };
    const holen = useCallback(async (): Promise<Antwort> => {
        try {
            const res = await fetch("/api/user/sitzungen");
            const daten = (await res.json()) as {
                sessions?: Sitzung[];
                migrationNeeded?: boolean;
                hinweis?: string;
            };
            return {
                sessions: daten.sessions ?? [],
                migrationNeeded: !!daten.migrationNeeded,
                hinweis: daten.hinweis ?? "",
            };
        }
        catch {
            return { sessions: [], migrationNeeded: false, hinweis: "" };
        }
    }, []);
    const uebernehmen = useCallback((a: Antwort) => {
        setSitzungen(a.sessions);
        setMigrationFehlt(a.migrationNeeded);
        setHinweis(a.hinweis);
        setLaedt(false);
    }, []);
    useEffect(() => {
        let abgebrochen = false;
        holen().then((a) => {
            if (!abgebrochen)
                uebernehmen(a);
        });
        return () => {
            abgebrochen = true;
        };
    }, [holen, uebernehmen]);
    async function andereAbmelden() {
        setLaeuft(true);
        setMeldung("");
        const { error } = await supabase.auth.signOut({ scope: "others" });
        setLaeuft(false);
        if (error) {
            setMeldung(`Das hat nicht geklappt: ${error.message}`);
            return;
        }
        setMeldung("Alle anderen Geräte sind abgemeldet.");
        uebernehmen(await holen());
    }
    const andere = sitzungen.filter((s) => !s.aktuell).length;
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>
          devices
        </span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Angemeldete Geräte</h2>
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed mb-4">
        Wer sich an einem Stationsrechner angemeldet und das Abmelden vergessen hat,
        bleibt dort angemeldet, bis die Sitzung abläuft. Hier steht, wo das der Fall ist.
      </p>

      {laedt ? (<PulseLoader size={14}/>) : migrationFehlt ? (<div className="flex items-start gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>info</span>
          <span>{hinweis}</span>
        </div>) : sitzungen.length === 0 ? (<p className="text-[13px] text-[var(--tinte-leise)]">
          Keine Angaben verfügbar.
        </p>) : (<div className="space-y-2">
          {sitzungen.map((s) => (<div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--tinte)] flex items-center gap-2">
                  {geraetKurz(s.geraet)}
                  {s.aktuell && (<span className="text-[13px] font-semibold text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] px-2 py-0.5 rounded">
                      dieses Gerät
                    </span>)}
                  {s.aal === "aal2" && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] px-2 py-0.5 rounded">
                      2 Faktoren
                    </span>)}
                </div>
                <div className="text-[13px] text-[var(--tinte-matt)] tabular-nums">
                  zuletzt {zeit(s.zuletzt)}
                  {s.ip ? ` · ${s.ip}` : ""}
                </div>
              </div>
            </div>))}
        </div>)}

      {andere > 0 && (<button onClick={() => void andereAbmelden()} disabled={laeuft} className="mt-4 flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold rounded-lg border border-[var(--gefahr)] text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] disabled:opacity-50">
          {laeuft ? <PulseLoader size={14}/> : (<span className="material-symbols-outlined" style={{ fontSize: 14 }}>logout</span>)}
          Auf allen anderen Geräten abmelden ({andere})
        </button>)}

      {meldung && (<div className="flex items-center gap-2 mt-3 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
          {meldung}
        </div>)}
    </div>);
}

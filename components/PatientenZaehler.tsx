"use client";
import { useCallback, useEffect, useState } from "react";
import { BedDouble, Minus, Plus } from "lucide-react";
type Stand = {
    patienten: number;
    hoechststand: number;
    zugaenge: number;
    abgaenge: number;
    geaendert_von_name: string | null;
    geaendert_am: string;
};
type Schicht = {
    datum: string;
    schicht: "tag" | "nacht";
};
type Antwort = {
    aktiv: boolean;
    migrationFehlt?: boolean;
    aktuell?: Schicht;
    vorher?: Schicht;
    stationen?: {
        station: string;
        darfAktuell: boolean;
        darfVorher: boolean;
        aktuell: Stand | null;
        vorher: Stand | null;
    }[];
};
function schichtText(s: Schicht): string {
    const [, m, d] = s.datum.split("-");
    return `${s.schicht === "tag" ? "Tagschicht" : "Nachtschicht"} ${d}.${m}.`;
}
function schichtWahl(d: Antwort | null, welche: "aktuell" | "vorher"): "aktuell" | "vorher" {
    const st = d?.stationen ?? [];
    if (!st.some((s) => s.darfAktuell))
        return "vorher";
    if (!st.some((s) => s.darfVorher))
        return "aktuell";
    return welche;
}
export default function PatientenZaehler() {
    const [daten, setDaten] = useState<Antwort | null>(null);
    const [welche, setWelche] = useState<"aktuell" | "vorher">("aktuell");
    const [anzahl, setAnzahl] = useState<Record<string, string>>({});
    const [laeuft, setLaeuft] = useState<string | null>(null);
    const [meldung, setMeldung] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const holen = useCallback(async (): Promise<Antwort | null> => {
        try {
            const r = await fetch("/api/mein-station/belegung", { cache: "no-store" });
            return r.ok ? ((await r.json()) as Antwort) : null;
        }
        catch {
            return null;
        }
    }, []);
    const laden = useCallback(async () => {
        const d = await holen();
        if (d)
            setDaten(d);
    }, [holen]);
    useEffect(() => {
        let aktiv = true;
        holen().then((d) => { if (aktiv && d)
            setDaten(d); });
        return () => { aktiv = false; };
    }, [holen]);
    async function senden(station: string, body: {
        delta: number;
    } | {
        anzahl: number;
    }) {
        setLaeuft(station);
        setMeldung(null);
        try {
            const r = await fetch("/api/mein-station/belegung", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station, schicht: schichtWahl(daten, welche), ...body }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) {
                setMeldung({ ok: false, text: j.error ?? "Speichern fehlgeschlagen." });
            }
            else {
                setAnzahl((a) => ({ ...a, [station]: "" }));
                await laden();
            }
        }
        catch {
            setMeldung({ ok: false, text: "Keine Verbindung — bitte noch einmal." });
        }
        setLaeuft(null);
    }
    if (!daten?.aktiv || !daten.stationen || daten.stationen.length === 0 || !daten.aktuell || !daten.vorher)
        return null;
    const mitAktuell = daten.stationen.some((s) => s.darfAktuell);
    const mitVorher = daten.stationen.some((s) => s.darfVorher);
    const gewaehlt = schichtWahl(daten, welche);
    const schicht = gewaehlt === "aktuell" ? daten.aktuell : daten.vorher;
    const sichtbar = daten.stationen.filter((s) => (gewaehlt === "aktuell" ? s.darfAktuell : s.darfVorher));
    return (<section className="card" aria-labelledby="patienten-zaehler-titel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BedDouble size={18} className="text-[var(--akzent)]"/>
          <h2 id="patienten-zaehler-titel" className="font-semibold text-[var(--tinte)]">Patienten auf Station</h2>
        </div>
        {mitAktuell && mitVorher && <div className="flex rounded-lg border border-[var(--linie)] overflow-hidden text-sm" role="group" aria-label="Schicht wählen">
          {(["aktuell", "vorher"] as const).map((w) => (<button key={w} type="button" onClick={() => setWelche(w)} aria-pressed={gewaehlt === w} className={`px-3 py-1.5 ${gewaehlt === w ? "bg-[var(--akzent-flaeche)] text-[var(--tinte)] font-medium" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
              {w === "aktuell" ? "Jetzt" : "Vorige Schicht"}
            </button>))}
        </div>}
      </div>

      {daten.migrationFehlt ? (<p className="text-sm text-[var(--tinte-matt)]">
          Die Zählung ist noch nicht eingerichtet. Die Leitung kann sie freischalten lassen.
        </p>) : (<div className="space-y-5">
          {sichtbar.map((s) => {
                const stand = gewaehlt === "aktuell" ? s.aktuell : s.vorher;
                const wert = anzahl[s.station] ?? "";
                const n = Number(wert);
                const gueltig = wert !== "" && Number.isInteger(n) && n >= 0 && n <= 500;
                const besetzt = laeuft === s.station;
                const feldId = `zaehler-${s.station}`;
                return (<div key={s.station}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <p className="font-medium text-[var(--tinte)]">{s.station}</p>
                  <p className="text-sm text-[var(--tinte-leise)]">{schichtText(schicht)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => senden(s.station, { delta: -1 })} disabled={besetzt || !stand || stand.patienten === 0} aria-label={`Ein Patient weniger auf ${s.station}`} className="w-14 h-14 rounded-xl border border-[var(--linie)] flex items-center justify-center text-[var(--tinte)] hover:bg-[var(--papier-tief)] disabled:opacity-40">
                    <Minus size={22}/>
                  </button>
                  <div className="flex-1 text-center" aria-live="polite">
                    <p className="text-4xl font-semibold text-[var(--tinte)] tabular-nums">{stand ? stand.patienten : "–"}</p>
                    <p className="text-sm text-[var(--tinte-leise)]">
                      {stand ? `höchstens ${stand.hoechststand} · +${stand.zugaenge} / −${stand.abgaenge}` : "noch nicht gezählt"}
                    </p>
                  </div>
                  <button type="button" onClick={() => senden(s.station, { delta: 1 })} disabled={besetzt} aria-label={`Ein Patient mehr auf ${s.station}`} className="w-14 h-14 rounded-xl bg-[var(--akzent)] text-[var(--auf-tinte)] flex items-center justify-center hover:bg-[var(--akzent-tief)] disabled:opacity-40">
                    <Plus size={22}/>
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={feldId} className="text-sm text-[var(--tinte-matt)]">Anzahl</label>
                  <input id={feldId} type="number" inputMode="numeric" min={0} max={500} value={wert} onChange={(e) => setAnzahl((a) => ({ ...a, [s.station]: e.target.value }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-sm text-[var(--tinte)] bg-[var(--papier)]"/>
                  <button type="button" disabled={!gueltig || n === 0 || besetzt} onClick={() => senden(s.station, { delta: n })} className="px-3 py-1.5 rounded-lg border border-[var(--linie)] text-sm text-[var(--tinte)] hover:bg-[var(--papier-tief)] disabled:opacity-40">
                    kommen dazu
                  </button>
                  <button type="button" disabled={!gueltig || n === 0 || besetzt || !stand} onClick={() => senden(s.station, { delta: -n })} className="px-3 py-1.5 rounded-lg border border-[var(--linie)] text-sm text-[var(--tinte)] hover:bg-[var(--papier-tief)] disabled:opacity-40">
                    gehen weg
                  </button>
                  <button type="button" disabled={!gueltig || besetzt} onClick={() => senden(s.station, { anzahl: n })} className="px-3 py-1.5 rounded-lg border border-[var(--linie)] text-sm text-[var(--tinte)] hover:bg-[var(--papier-tief)] disabled:opacity-40">
                    sind jetzt da
                  </button>
                </div>
                {stand?.geaendert_von_name && (<p className="mt-2 text-sm text-[var(--tinte-leise)]">
                    Zuletzt: {stand.geaendert_von_name}, {new Date(stand.geaendert_am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                  </p>)}
              </div>);
            })}
        </div>)}

      {meldung && (<p role="status" className={`mt-4 text-sm ${meldung.ok ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>{meldung.text}</p>)}
      <p className="mt-4 text-sm text-[var(--tinte-leise)]">
        Nur die Zahl, kein Name. Daraus prüft Nurvo, ob die Pflegepersonaluntergrenze in der Schicht gehalten wurde.
      </p>
    </section>);
}

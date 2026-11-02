"use client";
import { useEffect, useState } from "react";
import { useIstPraxis } from "@/lib/PlanContext";
export default function VerspaetungSchalter() {
    const istPraxis = useIstPraxis();
    const [an, setAn] = useState(true);
    const [laeuft, setLaeuft] = useState(false);
    const [hinweis, setHinweis] = useState("");
    useEffect(() => {
        fetch("/api/leitung/meldungen")
            .then(r => r.json())
            .then(d => {
            if (typeof d.verspaetung === "boolean")
                setAn(d.verspaetung);
            if (d.migrationFehlt)
                setHinweis("Migration 20261010_verspaetung_und_rueckmeldung.sql fehlt noch.");
        })
            .catch(() => { });
    }, []);
    async function umschalten() {
        setLaeuft(true);
        setHinweis("");
        const r = await fetch("/api/leitung/meldungen", {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verspaetung: !an }),
        });
        if (r.ok)
            setAn(v => !v);
        else
            setHinweis((await r.json().catch(() => ({}))).error ?? "Speichern fehlgeschlagen.");
        setLaeuft(false);
    }
    const teamleitung = istPraxis ? "Teamleitung" : "Stationsleitung";
    return (<div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-[var(--tinte)] text-[14px]">Verspätung über die App</p>
          <p className="text-[var(--tinte-matt)] text-[13px] mt-0.5">
            {an
            ? `Mitarbeitende können „Ich komme zu spät“ tippen — du und die ${teamleitung} werdet benachrichtigt`
            : `Deaktiviert — Mitarbeitende sehen den Hinweis, dich oder die ${teamleitung} anzurufen`}
          </p>
        </div>
        <button onClick={() => void umschalten()} disabled={laeuft} aria-pressed={an} aria-label="Verspätung über die App" className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${an ? "bg-[var(--akzent)]" : "bg-[var(--linie)]"} disabled:opacity-60`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--papier)] rounded-full shadow transition-transform ${an ? "translate-x-6" : ""}`}/>
        </button>
      </div>
      {hinweis && <p className="text-[13px] text-[var(--warnung)] mt-2">{hinweis}</p>}
    </div>);
}

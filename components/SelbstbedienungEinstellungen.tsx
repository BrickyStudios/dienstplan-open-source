"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Schalter from "@/components/Schalter";
import { SELBSTBEDIENUNG, type Selbst, type SelbstWerte } from "@/lib/rechte";
export default function SelbstbedienungEinstellungen() {
    const [praxis, setPraxis] = useState<SelbstWerte | null>(null);
    const [fehlt, setFehlt] = useState(false);
    const [speichert, setSpeichert] = useState<Selbst | null>(null);
    const [fehler, setFehler] = useState("");
    useEffect(() => {
        fetch("/api/leitung/mitarbeiter-rechte").then(r => r.ok ? r.json() : null)
            .then(d => { if (d) {
            setPraxis(d.praxis ?? {});
            setFehlt(Boolean(d.tabelleFehlt));
        } })
            .catch(() => { });
    }, []);
    if (!praxis)
        return null;
    async function umschalten(id: Selbst) {
        const neu = !(praxis![id] ?? true);
        setSpeichert(id);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/mitarbeiter-rechte", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selbstbedienung: { [id]: neu } }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setFehler(j.error || "Konnte nicht gespeichert werden.");
                return;
            }
            setPraxis(j.praxis ?? { ...praxis, [id]: neu });
        }
        catch {
            setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
        }
        finally {
            setSpeichert(null);
        }
    }
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>shield_person</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Was Mitarbeitende selbst in der App dürfen</h2>
      </div>
      <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
        Gilt für das ganze Team. Was Sie hier abschalten, läuft über Sie: Die Person ruft an, und Sie erfassen es
        selbst. Für einzelne Personen abweichen und Teile Ihrer eigenen Rechte abgeben können Sie unter{" "}
        <Link href="/mitarbeiter" className="text-[var(--akzent)] font-medium hover:underline">Praxisteam → „Rechte“</Link>.
      </p>
      <div className="space-y-2">
        {SELBSTBEDIENUNG.map(s => {
            const an = praxis[s.id] ?? true;
            const gesperrt = fehlt && s.id !== "krank";
            return (<div key={s.id} className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-[var(--linie)]">
              <div>
                <p className="text-[13px] font-semibold text-[var(--tinte)]">{s.titel}</p>
                <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{an ? "Erlaubt" : s.aus}</p>
              </div>
              <Schalter an={an} disabled={!!speichert || gesperrt} onClick={() => umschalten(s.id)}/>
            </div>);
        })}
      </div>
      {fehlt && (<p className="mt-3 text-[13px] text-[var(--warnung)]">
          Bis die Migration 20261022_mitarbeiter_rechte eingespielt ist, lässt sich hier nur die Krankmeldung umschalten.
        </p>)}
      {fehler && <div role="alert" className="mt-3 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{fehler}</div>}
    </div>);
}

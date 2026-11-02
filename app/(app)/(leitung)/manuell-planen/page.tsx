"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import { PulseLoader } from "@/components/PulseLoader";
import StationsPlanungsBrett from "@/components/StationsPlanungsBrett";
import { todayISO } from "@/lib/date";
import { wochenTage, wocheVerschieben } from "@/lib/scheduling/eignung";
type StationZeile = {
    name: string;
    color: string | null;
    personen: number;
    schichten: number;
    offen: number;
};
export default function ManuellPlanenSeite() {
    return (<Suspense fallback={<Laden />}>
      <Inhalt />
    </Suspense>);
}
function Laden() {
    return (<div className="flex items-center justify-center py-24 gap-3 text-[var(--tinte-matt)]">
      <PulseLoader size={20}/><span>Wird geladen …</span>
    </div>);
}
function wochenLabel(woche: string): string {
    const t = wochenTage(woche);
    const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
    return `${kurz(t[0])}–${kurz(t[6])}${t[6].slice(0, 4)}`;
}
function adresse(woche: string, station?: string): string {
    const p = new URLSearchParams({ woche });
    if (station)
        p.set("station", station);
    return `/manuell-planen?${p.toString()}`;
}
function Inhalt() {
    const params = useSearchParams();
    const woche = wochenTage(params.get("woche") || todayISO())[0];
    const station = params.get("station") ?? "";
    return (<div>
      <Header title={station ? `Manuell planen · ${station}` : "Manuell planen"} subtitle={station
            ? "Personen in eine Schicht ziehen — oder anklicken und dann auf die Schicht klicken."
            : "Station wählen, dann die Woche von Hand besetzen."}/>
      <div className="px-4 sm:px-7 pb-10 pt-4">
        <WochenLeiste woche={woche} station={station}/>
        {station
            ? <StationsPlanungsBrett key={`${station}|${woche}`} station={station} woche={woche}/>
            : <StationsListe woche={woche}/>}
      </div>
    </div>);
}
function WochenLeiste({ woche, station }: {
    woche: string;
    station: string;
}) {
    const knopf = "inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] hover:text-[var(--tinte)] transition-colors";
    return (<div className="flex flex-wrap items-center gap-3 mb-5">
      {station && (<Link href={adresse(woche)} className="inline-flex items-center gap-1.5 min-h-[44px] pr-3 text-[14px] text-[var(--akzent)] hover:text-[var(--akzent-tief)]">
          <ChevronLeft size={16}/> Alle Stationen
        </Link>)}
      <div className="flex items-center gap-2 ml-auto">
        <Link href={adresse(wocheVerschieben(woche, -1), station)} aria-label="Vorige Woche" className={knopf}>
          <ChevronLeft size={16}/>
        </Link>
        <span className="text-[14px] text-[var(--tinte)] tabular-nums min-w-[11rem] text-center">{wochenLabel(woche)}</span>
        <Link href={adresse(wocheVerschieben(woche, 1), station)} aria-label="Nächste Woche" className={knopf}>
          <ChevronRight size={16}/>
        </Link>
        <Link href={adresse(wochenTage(todayISO())[0], station)} className={`${knopf} px-3 text-[14px]`}>
          Heute
        </Link>
      </div>
    </div>);
}
function StationsListe({ woche }: {
    woche: string;
}) {
    const [daten, setDaten] = useState<{
        woche: string;
        stationen: StationZeile[];
        fehler: string;
    } | null>(null);
    useEffect(() => {
        let aktiv = true;
        fetch(`/api/leitung/stationsplanung?woche=${woche}`)
            .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
            .catch(() => ({ ok: false, j: {} as {
                error?: string;
            } }))
            .then(({ ok, j }) => {
            if (!aktiv)
                return;
            setDaten({ woche, stationen: ok ? j.stationen ?? [] : [], fehler: ok ? "" : j.error ?? "Stationen konnten nicht geladen werden." });
        });
        return () => { aktiv = false; };
    }, [woche]);
    if (!daten || daten.woche !== woche)
        return <Laden />;
    if (daten.fehler)
        return <p role="alert" className="text-[14px] text-[var(--gefahr)]">{daten.fehler}</p>;
    if (daten.stationen.length === 0) {
        return (<p className="text-[14px] text-[var(--tinte-matt)]">
        Noch keine Stationen angelegt. <Link href="/stationen" className="text-[var(--akzent)] underline underline-offset-2">Stationen anlegen</Link>
      </p>);
    }
    return (<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {daten.stationen.map(s => (<li key={s.name}>
          <Link href={adresse(woche, s.name)} className="flex flex-col gap-2 h-full p-5 rounded-xl border border-[var(--linie)] bg-[var(--papier)] hover:border-[var(--akzent)] transition-colors">
            <span className="flex items-center gap-2 text-[16px] font-medium text-[var(--tinte)]">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[var(--tinte-leise)]" style={s.color ? { background: s.color } : undefined}/>
              {s.name}
            </span>
            <span className="text-[13px] text-[var(--tinte-matt)]">
              {s.personen} {s.personen === 1 ? "Person" : "Personen"} · {s.schichten} {s.schichten === 1 ? "Schicht" : "Schichten"} diese Woche
            </span>
            <span className={`text-[13px] ${s.offen > 0 ? "text-[var(--warnung)]" : "text-[var(--ok)]"}`}>
              {s.schichten === 0 ? "Keine Schichten angelegt" : s.offen > 0 ? `${s.offen} unterbesetzt` : "Alle Schichten besetzt"}
            </span>
          </Link>
        </li>))}
    </ul>);
}

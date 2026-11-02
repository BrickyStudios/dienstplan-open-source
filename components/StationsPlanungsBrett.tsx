"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Moon, Search, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmProvider";
import { PulseLoader } from "@/components/PulseLoader";
import { pruefeEignung, wochenTage, wochenUebersicht, type Eignung, type EignungsBefund, } from "@/lib/scheduling/eignung";
import type { PlanPerson, Stationsplanung } from "@/lib/scheduling/stationsplanung";
type Daten = Stationsplanung & {
    von: string;
    bis: string;
};
const ARTEN = [
    { key: "frueh", label: "Früh", zeit: "06–14" },
    { key: "spaet", label: "Spät", zeit: "14–22" },
    { key: "nacht", label: "Nacht", zeit: "22–06" },
] as const;
const WOCHENTAG = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function kurzDatum(iso: string) {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}
function kurzName(name: string) {
    const teile = name.trim().split(/\s+/);
    return teile.length < 2 ? name : `${teile[0]} ${teile[teile.length - 1][0]}.`;
}
function stunden(min: number) {
    const h = min / 60;
    return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
}
const STUFE_STIL: Record<Eignung["stufe"], string> = {
    ok: "bg-[var(--ok-flaeche)] border-[var(--ok)]",
    warnung: "bg-[var(--warnung-flaeche)] border-[var(--warnung)]",
    blocker: "bg-[var(--gefahr-flaeche)] border-[var(--gefahr)]",
    eingeteilt: "bg-[var(--akzent-flaeche)] border-[var(--akzent)]",
};
const STUFE_TEXT: Record<Eignung["stufe"], string> = {
    ok: "passt",
    warnung: "mit Hinweis",
    blocker: "verstößt gegen eine Grenze",
    eingeteilt: "schon eingeteilt",
};
type Zug = {
    personId: string;
    vonSchicht?: string;
};
type Hinweis = Pick<EignungsBefund, "text" | "norm" | "schwere">;
export default function StationsPlanungsBrett({ station, woche }: {
    station: string;
    woche: string;
}) {
    const confirm = useConfirm();
    const [daten, setDaten] = useState<Daten | null>(null);
    const [ladeFehler, setLadeFehler] = useState("");
    const [fehler, setFehler] = useState("");
    const [gewaehlt, setGewaehlt] = useState<string | null>(null);
    const [zug, setZug] = useState<Zug | null>(null);
    const [ueber, setUeber] = useState<string | null>(null);
    const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);
    const [suche, setSuche] = useState("");
    const url = `/api/leitung/stationsplanung?woche=${woche}&station=${encodeURIComponent(station)}`;
    const holen = useCallback(async () => {
        const r = await fetch(url).catch(() => null);
        const j = await r?.json().catch(() => null);
        return { ok: !!r?.ok, j };
    }, [url]);
    const uebernehmen = useCallback(({ ok, j }: {
        ok: boolean;
        j: (Daten & {
            error?: string;
        }) | null;
    }) => {
        if (ok && j) {
            setDaten(j);
            setLadeFehler("");
        }
        else
            setLadeFehler(j?.error ?? "Die Station konnte nicht geladen werden.");
    }, []);
    useEffect(() => {
        let aktiv = true;
        holen().then(e => { if (aktiv)
            uebernehmen(e); });
        return () => { aktiv = false; };
    }, [holen, uebernehmen]);
    const neuLaden = useCallback(() => holen().then(uebernehmen), [holen, uebernehmen]);
    useEffect(() => {
        if (!gewaehlt)
            return;
        const weg = (e: KeyboardEvent) => { if (e.key === "Escape")
            setGewaehlt(null); };
        window.addEventListener("keydown", weg);
        return () => window.removeEventListener("keydown", weg);
    }, [gewaehlt]);
    const tage = useMemo(() => wochenTage(woche), [woche]);
    const personNachId = useMemo(() => new Map((daten?.personen ?? []).map(p => [p.id, p])), [daten]);
    const aktivePerson = personNachId.get(zug?.personId ?? gewaehlt ?? "") ?? null;
    const raster = useMemo(() => {
        const m = new Map<string, Daten["stationsSchichten"][number]>();
        for (const s of daten?.stationsSchichten ?? [])
            m.set(`${s.date}|${s.shift_type}`, s);
        return m;
    }, [daten]);
    const eignungJeSchicht = useMemo(() => {
        const m = new Map<string, Eignung>();
        if (!daten || !aktivePerson)
            return m;
        for (const s of daten.stationsSchichten) {
            const belegung = zug?.vonSchicht
                ? daten.belegung.filter(b => !(b.shiftId === zug.vonSchicht && b.staffId === aktivePerson.id))
                : daten.belegung;
            m.set(s.id, pruefeEignung(aktivePerson, s, daten.schichten, belegung));
        }
        return m;
    }, [daten, aktivePerson, zug]);
    const uebersichten = useMemo(() => {
        const m = new Map<string, ReturnType<typeof wochenUebersicht>>();
        if (!daten)
            return m;
        for (const p of daten.personen) {
            m.set(p.id, wochenUebersicht(p, woche, daten.stationsSchichten, daten.schichten, daten.belegung));
        }
        return m;
    }, [daten, woche]);
    async function zuteilen(person: PlanPerson, schichtId: string, vonSchicht?: string) {
        if (!daten || beschaeftigt)
            return;
        const springer = vonSchicht
            ? (daten.springerJeSchicht[vonSchicht] ?? []).includes(person.name)
            : person.station !== station;
        if (vonSchicht === schichtId)
            return;
        const schicht = daten.stationsSchichten.find(s => s.id === schichtId);
        if (!schicht)
            return;
        const belegung = vonSchicht
            ? daten.belegung.filter(b => !(b.shiftId === vonSchicht && b.staffId === person.id))
            : daten.belegung;
        const e = pruefeEignung(person, schicht, daten.schichten, belegung);
        if (e.stufe === "eingeteilt")
            return;
        let trotzdem = false;
        if (e.stufe === "blocker") {
            if (!await rueckfrage(person.name, e.befunde))
                return;
            trotzdem = true;
        }
        setFehler("");
        setBeschaeftigt(schichtId);
        setGewaehlt(null);
        setDaten(d => d && {
            ...d,
            belegung: [...d.belegung.filter(b => !(vonSchicht && b.shiftId === vonSchicht && b.staffId === person.id)), { shiftId: schichtId, staffId: person.id }],
            namenJeSchicht: {
                ...d.namenJeSchicht,
                [schichtId]: [...(d.namenJeSchicht[schichtId] ?? []), person.name],
                ...(vonSchicht ? { [vonSchicht]: (d.namenJeSchicht[vonSchicht] ?? []).filter(n => n !== person.name) } : {}),
            },
            springerJeSchicht: springer
                ? { ...d.springerJeSchicht, [schichtId]: [...(d.springerJeSchicht[schichtId] ?? []), person.name] }
                : d.springerJeSchicht,
        });
        const ok = await speichern(person, schichtId, trotzdem, springer);
        if (ok && vonSchicht)
            await austragenAnfrage(person.name, vonSchicht);
        setBeschaeftigt(null);
        await neuLaden();
    }
    async function speichern(person: PlanPerson, schichtId: string, trotzdem: boolean, springer: boolean): Promise<boolean> {
        const res = await fetch("/api/leitung/shifts/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: schichtId, staff_name: person.name, staff_id: person.id, trotzdem, is_springer: springer }),
        }).catch(() => null);
        if (res?.status === 409 && !trotzdem) {
            const j = await res.json().catch(() => ({}));
            const befunde: Hinweis[] = (j.pruefung ?? []).map((b: {
                text: string;
                norm: string;
                schwere: string;
            }) => ({
                text: b.text, norm: b.norm, schwere: b.schwere === "blocker" ? "blocker" : "warnung",
            }));
            if (await rueckfrage(person.name, befunde))
                return speichern(person, schichtId, true, springer);
            return false;
        }
        if (!res?.ok) {
            const msg = await res?.json().then(j => j.error).catch(() => null);
            setFehler(msg || `${person.name} konnte nicht eingeteilt werden — bitte erneut versuchen.`);
            return false;
        }
        return true;
    }
    async function austragenAnfrage(name: string, schichtId: string): Promise<boolean> {
        const res = await fetch("/api/leitung/shifts/assign", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: schichtId, staff_name: name }),
        }).catch(() => null);
        if (!res?.ok)
            setFehler(`${name} konnte nicht ausgetragen werden — bitte erneut versuchen.`);
        return !!res?.ok;
    }
    async function austragen(name: string, schichtId: string) {
        if (beschaeftigt)
            return;
        setFehler("");
        setBeschaeftigt(schichtId);
        setDaten(d => d && {
            ...d,
            namenJeSchicht: { ...d.namenJeSchicht, [schichtId]: (d.namenJeSchicht[schichtId] ?? []).filter(n => n !== name) },
            belegung: d.belegung.filter(b => !(b.shiftId === schichtId && personNachId.get(b.staffId)?.name === name)),
        });
        await austragenAnfrage(name, schichtId);
        setBeschaeftigt(null);
        await neuLaden();
    }
    async function artUmschalten(name: string, schichtId: string) {
        if (!daten || beschaeftigt)
            return;
        const warSpringer = (daten.springerJeSchicht[schichtId] ?? []).includes(name);
        const setzen = (springer: boolean) => setDaten(d => d && {
            ...d,
            springerJeSchicht: {
                ...d.springerJeSchicht,
                [schichtId]: springer
                    ? [...(d.springerJeSchicht[schichtId] ?? []).filter(n => n !== name), name]
                    : (d.springerJeSchicht[schichtId] ?? []).filter(n => n !== name),
            },
        });
        setFehler("");
        setBeschaeftigt(schichtId);
        setzen(!warSpringer);
        const res = await fetch("/api/leitung/shifts/assign", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: schichtId, staff_name: name, is_springer: !warSpringer }),
        }).catch(() => null);
        if (!res?.ok) {
            setzen(warSpringer);
            setFehler(`${name} konnte nicht umgestellt werden — bitte erneut versuchen.`);
        }
        setBeschaeftigt(null);
    }
    function rueckfrage(name: string, befunde: Hinweis[]) {
        return confirm({
            title: `${name} trotzdem einteilen?`,
            body: (<div className="space-y-2">
          <ul className="space-y-1.5">
            {befunde.map((b, i) => (<li key={i} className={b.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}>
                {b.text} <span className="text-[var(--tinte-leise)]">({b.norm})</span>
              </li>))}
          </ul>
          <p className="text-[var(--tinte-leise)]">Der automatische Plan würde so nie einteilen. Die Verantwortung für die Abweichung liegt bei Ihnen.</p>
        </div>),
            confirmLabel: "Trotzdem einteilen",
            danger: true,
        });
    }
    function ziehStart(e: React.DragEvent, z: Zug) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(z));
        setZug(z);
    }
    function ziehEnde() {
        setZug(null);
        setUeber(null);
    }
    function loslassen(e: React.DragEvent, schichtId: string) {
        e.preventDefault();
        let z: Zug | null = zug;
        try {
            z = JSON.parse(e.dataTransfer.getData("text/plain")) as Zug;
        }
        catch { }
        ziehEnde();
        const person = z ? personNachId.get(z.personId) : undefined;
        if (person)
            void zuteilen(person, schichtId, z?.vonSchicht);
    }
    if (ladeFehler)
        return <p role="alert" className="text-[14px] text-[var(--gefahr)]">{ladeFehler}</p>;
    if (!daten) {
        return (<div className="flex items-center justify-center py-24 gap-3 text-[var(--tinte-matt)]">
        <PulseLoader size={20}/><span>Station wird geladen …</span>
      </div>);
    }
    const arten = ARTEN.filter(a => daten.stationsSchichten.some(s => s.shift_type === a.key));
    const begriff = suche.trim().toLowerCase();
    const passend = (p: PlanPerson) => !begriff || p.name.toLowerCase().includes(begriff);
    const hier = daten.personen.filter(p => p.station === station && passend(p));
    const einspringer = daten.personen.filter(p => p.station !== station && p.einsatzStationen.includes(station) && passend(p));
    const weitere = daten.personen.filter(p => p.station !== station && !p.einsatzStationen.includes(station) && passend(p));
    const ueberEignung = ueber ? eignungJeSchicht.get(ueber) : undefined;
    const ueberSchicht = ueber ? daten.stationsSchichten.find(s => s.id === ueber) : undefined;
    return (<div className="flex flex-col lg:flex-row gap-6 items-start">
      
      <aside className="w-full lg:w-72 flex-shrink-0 space-y-4 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-1">
        <div className="relative">
          <label htmlFor="mp-suche" className="sr-only">Person suchen</label>
          <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-leise)]"/>
          <input id="mp-suche" type="search" value={suche} onChange={e => setSuche(e.target.value)} placeholder="Person suchen" className="w-full min-h-[44px] pl-9 pr-3 border border-[var(--linie)] rounded-lg text-[14px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
        </div>

        <PersonenGruppe titel={`${station} (${hier.length})`} personen={hier} leer="Dieser Station ist niemand zugeordnet." offen {...{ gewaehlt, setGewaehlt, ziehStart, ziehEnde, uebersichten, woche }}/>
        {einspringer.length > 0 && (<PersonenGruppe titel={`Dürfen hier einspringen (${einspringer.length})`} personen={einspringer} leer="" offen {...{ gewaehlt, setGewaehlt, ziehStart, ziehEnde, uebersichten, woche }}/>)}
        <PersonenGruppe titel={`Weitere Mitarbeitende (${weitere.length})`} personen={weitere} leer="Keine weiteren Personen." offen={!!begriff} {...{ gewaehlt, setGewaehlt, ziehStart, ziehEnde, uebersichten, woche }}/>
      </aside>

      
      <section className="flex-1 min-w-0 w-full space-y-3" aria-label={`Schichten ${station}`}>
        {aktivePerson && (<p aria-live="polite" className="text-[14px] text-[var(--tinte-matt)]">
            <strong className="text-[var(--tinte)] font-medium">{aktivePerson.name}</strong>
            {zug ? " — auf eine Schicht ziehen." : " ist gewählt — eine Schicht anklicken, um einzuteilen. Esc hebt die Auswahl auf."}
            {" "}Grün passt, gelb mit Hinweis, rot verstößt gegen eine Grenze.
          </p>)}
        {fehler && <p role="alert" className="text-[14px] text-[var(--gefahr)]">{fehler}</p>}
        {daten.stationsSchichten.length > 0 && (<p className="text-[13px] text-[var(--tinte-leise)]">
            <ArtMarke springer={false}/> fest eingeplant · <ArtMarke springer/> Springer — anklicken zum Umschalten.
          </p>)}

        {daten.stationsSchichten.length === 0 ? (<div className="p-6 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px] text-[var(--tinte-matt)]">
            Für diese Woche sind auf {station} noch keine Schichten angelegt.{" "}
            <Link href="/schichtplan" className="text-[var(--akzent)] underline underline-offset-2">Im Schichtplan anlegen</Link>
          </div>) : (<div className="overflow-x-auto rounded-xl border border-[var(--linie)] bg-[var(--papier)]">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className="w-16 p-2 text-left font-medium text-[var(--tinte-leise)]"><span className="sr-only">Schicht</span></th>
                  {tage.map((t, i) => (<th key={t} scope="col" className="p-2 text-left font-medium text-[var(--tinte-matt)] border-l border-[var(--linie)]">
                      {WOCHENTAG[i]} <span className="text-[var(--tinte-leise)] font-normal">{kurzDatum(t)}</span>
                    </th>))}
                </tr>
              </thead>
              <tbody>
                {arten.map(a => (<tr key={a.key} className="border-t border-[var(--linie)]">
                    <th scope="row" className="p-2 align-top text-left font-medium text-[var(--tinte)]">
                      {a.label}
                      <span className="block font-normal text-[var(--tinte-leise)]">{a.zeit}</span>
                    </th>
                    {tage.map(t => {
                    const s = raster.get(`${t}|${a.key}`);
                    if (!s)
                        return <td key={t} className="p-2 border-l border-[var(--linie)] text-[var(--tinte-leise)] align-top">—</td>;
                    const namen = daten.namenJeSchicht[s.id] ?? [];
                    const springerHier = daten.springerJeSchicht[s.id] ?? [];
                    const eignung = eignungJeSchicht.get(s.id);
                    const ziel = !!aktivePerson;
                    return (<td key={t} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (ueber !== s.id)
                        setUeber(s.id); }} onDragLeave={() => setUeber(u => (u === s.id ? null : u))} onDrop={e => loslassen(e, s.id)} onMouseEnter={() => aktivePerson && setUeber(s.id)} className="p-1 align-top border-l border-[var(--linie)]">
                          <div className={`min-h-[88px] h-full rounded-lg border p-1 transition-colors ${ziel && eignung ? STUFE_STIL[eignung.stufe] : "border-transparent"} ${ueber === s.id && ziel ? "ring-2 ring-[var(--akzent)]" : ""}`}>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <Besetzung ist={namen.length} soll={s.planned_staff}/>
                              {beschaeftigt === s.id && <PulseLoader size={12}/>}
                            </div>
                            <ul className="space-y-1">
                              {namen.map(n => {
                            const p = daten.personen.find(x => x.name === n);
                            return (<li key={n} draggable={!!p} onDragStart={p ? e => ziehStart(e, { personId: p.id, vonSchicht: s.id }) : undefined} onDragEnd={ziehEnde} className={`group/chip flex items-center rounded-md bg-[var(--papier-tief)] pl-1.5 ${p ? "cursor-grab" : ""}`}>
                                    
                                    <button type="button" onClick={() => artUmschalten(n, s.id)} disabled={!!beschaeftigt} aria-label={`${n} am ${kurzDatum(t)}, ${a.label}: ${springerHier.includes(n) ? "Springer — auf fest umstellen" : "fest — auf Springer umstellen"}`} title={springerHier.includes(n) ? "Springer — anklicken für fest" : "Fest — anklicken für Springer"} className="flex-shrink-0 mr-1 rounded disabled:opacity-60">
                                      <ArtMarke springer={springerHier.includes(n)}/>
                                    </button>
                                    <span className="flex-1 min-w-0 truncate leading-7 text-[13px] text-[var(--tinte)]" title={n}>{kurzName(n)}</span>
                                    <button type="button" onClick={() => austragen(n, s.id)} aria-label={`${n} aus ${a.label} am ${kurzDatum(t)} austragen`} className="inline-flex flex-shrink-0 items-center justify-center w-6 h-7 overflow-hidden pointer-fine:w-0 pointer-fine:group-hover/chip:w-6 pointer-fine:group-focus-within/chip:w-6 rounded-md text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)]">
                                      <X size={12}/>
                                    </button>
                                  </li>);
                        })}
                            </ul>
                            {gewaehlt && aktivePerson && (<button type="button" onClick={() => zuteilen(aktivePerson, s.id)} onFocus={() => setUeber(s.id)} disabled={eignung?.stufe === "eingeteilt" || !!beschaeftigt} className="mt-1 w-full min-h-[32px] rounded-md border border-dashed border-[var(--linie)] text-[13px] text-[var(--tinte-matt)] hover:border-[var(--akzent)] hover:text-[var(--akzent)] disabled:opacity-50">
                                {eignung?.stufe === "eingeteilt" ? "eingeteilt" : `+ ${kurzName(aktivePerson.name)}`}
                                <span className="sr-only"> am {kurzDatum(t)}, {a.label}: {eignung ? STUFE_TEXT[eignung.stufe] : ""}</span>
                              </button>)}
                          </div>
                        </td>);
                })}
                  </tr>))}
              </tbody>
            </table>
          </div>)}

        
        {aktivePerson && ueberSchicht && ueberEignung && (<div aria-live="polite" className="p-4 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px]">
            <p className="font-medium text-[var(--tinte)] mb-1.5">
              {aktivePerson.name} · {ARTEN.find(a => a.key === ueberSchicht.shift_type)?.label ?? ueberSchicht.shift_type} am {kurzDatum(ueberSchicht.date)}: {STUFE_TEXT[ueberEignung.stufe]}
            </p>
            {ueberEignung.befunde.length > 0 ? (<ul className="space-y-1">
                {ueberEignung.befunde.map((b, i) => (<li key={i} className={b.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}>
                    {b.text} <span className="text-[var(--tinte-leise)]">({b.norm})</span>
                  </li>))}
              </ul>) : ueberEignung.stufe === "ok" && (<p className="text-[var(--ok)]">Ruhezeit, Arbeitszeit, Nächte am Stück und Abwesenheit sind eingehalten.</p>)}
          </div>)}
      </section>
    </div>);
}
function ArtMarke({ springer }: {
    springer: boolean;
}) {
    return (<span aria-hidden="true" className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-semibold align-middle ${springer ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--warnung)]" : "bg-[var(--papier)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
      {springer ? "S" : "F"}
    </span>);
}
function Besetzung({ ist, soll }: {
    ist: number;
    soll: number;
}) {
    const farbe = soll === 0 ? "text-[var(--tinte-leise)]" : ist >= soll ? "text-[var(--ok)]" : "text-[var(--warnung)]";
    return (<span className={`text-[13px] tabular-nums ${farbe}`} title={`${ist} von ${soll} besetzt`}>
      {ist}/{soll}
    </span>);
}
function PersonenGruppe({ titel, personen, leer, offen, gewaehlt, setGewaehlt, ziehStart, ziehEnde, uebersichten, woche, }: {
    titel: string;
    personen: PlanPerson[];
    leer: string;
    offen: boolean;
    gewaehlt: string | null;
    setGewaehlt: (id: string | null) => void;
    ziehStart: (e: React.DragEvent, z: Zug) => void;
    ziehEnde: () => void;
    uebersichten: Map<string, ReturnType<typeof wochenUebersicht>>;
    woche: string;
}) {
    return (<details open={offen} className="group rounded-xl border border-[var(--linie)] bg-[var(--papier)]">
      <summary className="cursor-pointer list-none flex items-center justify-between min-h-[44px] px-4 text-[14px] font-medium text-[var(--tinte)]">
        {titel}
        <span aria-hidden="true" className="text-[var(--tinte-leise)] group-open:rotate-180 transition-transform">▾</span>
      </summary>
      {personen.length === 0 ? (<p className="px-4 pb-4 text-[13px] text-[var(--tinte-leise)]">{leer}</p>) : (<ul className="px-2 pb-2 space-y-1.5">
          {personen.map(p => (<PersonKarte key={p.id} person={p} uebersicht={uebersichten.get(p.id)} gewaehlt={gewaehlt === p.id} onWaehlen={() => setGewaehlt(gewaehlt === p.id ? null : p.id)} ziehStart={ziehStart} ziehEnde={ziehEnde} woche={woche}/>))}
        </ul>)}
    </details>);
}
function PersonKarte({ person, uebersicht, gewaehlt, onWaehlen, ziehStart, ziehEnde, woche, }: {
    person: PlanPerson;
    uebersicht: ReturnType<typeof wochenUebersicht> | undefined;
    gewaehlt: boolean;
    onWaehlen: () => void;
    ziehStart: (e: React.DragEvent, z: Zug) => void;
    ziehEnde: () => void;
    woche: string;
}) {
    const tage = wochenTage(woche);
    const abwesend = tage.filter(t => person.abwesendeTage[t] !== undefined);
    const ue = uebersicht;
    const vertrag = person.vertragsMinutenWoche;
    const ueber = ue && vertrag > 0 && ue.minutenWoche > vertrag;
    let nacht: {
        text: string;
        stil: string;
    } | null = null;
    if (ue && ue.nachtSchichtenWoche > 0) {
        const tagKurz = ue.nachtMoeglichAn.map(d => ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(d + "T00:00:00Z").getUTCDay()]);
        nacht = ue.nachtMoeglichAn.length === 0
            ? { text: "Nacht: diese Woche nicht mehr möglich", stil: "text-[var(--gefahr)]" }
            : { text: `Nacht möglich: ${tagKurz.join(", ")}`, stil: "text-[var(--tinte-matt)]" };
    }
    const grenze = person.grenzen.maxConsecutiveNights;
    return (<li>
      <button type="button" draggable onDragStart={e => ziehStart(e, { personId: person.id })} onDragEnd={ziehEnde} onClick={onWaehlen} aria-pressed={gewaehlt} className={`w-full text-left rounded-lg border px-3 py-2.5 cursor-grab active:cursor-grabbing transition-colors ${gewaehlt ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] bg-[var(--papier)] hover:border-[var(--tinte-leise)]"}`}>
        <span className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-medium text-[var(--tinte)] truncate">{person.name}</span>
          {gewaehlt && <Check size={15} aria-hidden="true" className="text-[var(--akzent)] flex-shrink-0"/>}
        </span>
        {ue && (<span className={`block text-[13px] tabular-nums ${ueber ? "text-[var(--warnung)]" : "text-[var(--tinte-matt)]"}`}>
            {stunden(ue.minutenWoche)} von {stunden(vertrag)} h diese Woche
            {ue.naechteWoche > 0 && ` · ${ue.naechteWoche} ${ue.naechteWoche === 1 ? "Nacht" : "Nächte"}`}
          </span>)}
        {nacht && (<span className={`block text-[13px] ${nacht.stil}`}>
            <Moon size={13} aria-hidden="true" className="inline -mt-0.5 mr-1.5"/>
            {nacht.text}
            {grenze != null && <span className="text-[var(--tinte-leise)]"> · max. {grenze} am Stück</span>}
          </span>)}
        {abwesend.length > 0 && (<span className="block text-[13px] text-[var(--warnung)]">
            <AlertTriangle size={13} aria-hidden="true" className="inline -mt-0.5 mr-1.5"/>
            {person.abwesendeTage[abwesend[0]] || "Abwesend"}: {abwesend.map(kurzDatum).join(", ")}
          </span>)}
        {person.grenzen.noSundayWork && (<span className="block text-[13px] text-[var(--tinte-leise)]">Arbeitet nicht sonntags</span>)}
      </button>
    </li>);
}

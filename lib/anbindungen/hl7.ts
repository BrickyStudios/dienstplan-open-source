import { createHash } from "crypto";
export type Hl7Nachricht = {
    art: string;
    ereignis: string;
    nummer: string;
    version: string;
    segmente: Hl7Segment[];
};
export type Hl7Segment = {
    name: string;
    felder: string[];
};
type Trenner = {
    feld: string;
    komponente: string;
    wiederholung: string;
    entwertung: string;
    unterkomponente: string;
};
const STANDARD_TRENNER: Trenner = {
    feld: "|",
    komponente: "^",
    wiederholung: "~",
    entwertung: "\\",
    unterkomponente: "&",
};
export function hl7Lesen(roh: string): Hl7Nachricht | null {
    const text = roh.replace(/^﻿/, "").trim();
    if (!text.startsWith("MSH"))
        return null;
    const feld = text[3] ?? "|";
    const kodier = text.slice(4, 8);
    const trenner: Trenner = {
        feld,
        komponente: kodier[0] ?? STANDARD_TRENNER.komponente,
        wiederholung: kodier[1] ?? STANDARD_TRENNER.wiederholung,
        entwertung: kodier[2] ?? STANDARD_TRENNER.entwertung,
        unterkomponente: kodier[3] ?? STANDARD_TRENNER.unterkomponente,
    };
    const zeilen = text.split(/\r\n|\r|\n/).filter((z) => z.trim().length > 0);
    const segmente: Hl7Segment[] = [];
    for (const zeile of zeilen) {
        const teile = zeile.split(trenner.feld);
        const name = (teile.shift() ?? "").trim();
        if (name.length !== 3)
            continue;
        if (name === "MSH") {
            teile.unshift(feld);
        }
        segmente.push({ name, felder: teile });
    }
    const msh = segmente.find((s) => s.name === "MSH");
    if (!msh)
        return null;
    const typ = komponenten(feldWert(msh, 9), trenner);
    return {
        art: typ[0] ?? "",
        ereignis: typ[1] ?? "",
        nummer: feldWert(msh, 10),
        version: feldWert(msh, 12),
        segmente,
    };
}
export function feldWert(segment: Hl7Segment, nummer: number): string {
    return segment.felder[nummer - 1] ?? "";
}
export function segment(nachricht: Hl7Nachricht, name: string): Hl7Segment | null {
    return nachricht.segmente.find((s) => s.name === name) ?? null;
}
function komponenten(wert: string, trenner: Trenner = STANDARD_TRENNER): string[] {
    const erste = wert.split(trenner.wiederholung)[0] ?? "";
    return erste.split(trenner.komponente).map((k) => entwerten(k, trenner));
}
function entwerten(text: string, trenner: Trenner): string {
    if (!text.includes(trenner.entwertung))
        return text;
    const e = trenner.entwertung;
    return text
        .split(`${e}F${e}`).join(trenner.feld)
        .split(`${e}S${e}`).join(trenner.komponente)
        .split(`${e}T${e}`).join(trenner.unterkomponente)
        .split(`${e}R${e}`).join(trenner.wiederholung)
        .split(`${e}E${e}`).join(e)
        .split(`${e}X0A${e}`).join("\n")
        .split(`${e}X0D${e}`).join("\n");
}
export type BelegungsArt = "zugang" | "abgang" | "wechsel";
export type Belegungsaenderung = {
    art: BelegungsArt;
    station: string;
    vorherigeStation?: string;
    fallSchluessel: string;
    zeitpunkt: string;
    aufenthalt: string;
};
const EREIGNISSE: Record<string, BelegungsArt> = {
    A01: "zugang",
    A02: "wechsel",
    A03: "abgang",
    A04: "zugang",
    A08: "wechsel",
    A11: "abgang",
    A13: "zugang",
};
export function belegungsaenderung(nachricht: Hl7Nachricht, salz: string): Belegungsaenderung | null {
    if (nachricht.art !== "ADT")
        return null;
    const art = EREIGNISSE[nachricht.ereignis];
    if (!art)
        return null;
    if (!salz)
        throw new Error("belegungsaenderung: Salz fehlt");
    const pv1 = segment(nachricht, "PV1");
    const pid = segment(nachricht, "PID");
    if (!pv1 || !pid)
        return null;
    const fallNummer = fallNummerAus(pid, pv1);
    if (!fallNummer)
        return null;
    const station = komponenten(feldWert(pv1, 3))[0] ?? "";
    const vorher = komponenten(feldWert(pv1, 6))[0] ?? "";
    const aufenthalt = feldWert(pv1, 2).trim().toUpperCase();
    if (art === "wechsel" && !station)
        return null;
    if (art === "zugang" && !station)
        return null;
    return {
        art,
        station,
        vorherigeStation: vorher || undefined,
        fallSchluessel: fallSchluessel(fallNummer, salz),
        zeitpunkt: zeitpunktAus(nachricht, pv1, art),
        aufenthalt,
    };
}
function fallNummerAus(pid: Hl7Segment, pv1: Hl7Segment): string {
    const besuch = komponenten(feldWert(pv1, 19))[0] ?? "";
    if (besuch)
        return `besuch:${besuch}`;
    const patient = komponenten(feldWert(pid, 3))[0] ?? "";
    return patient ? `patient:${patient}` : "";
}
function zeitpunktAus(nachricht: Hl7Nachricht, pv1: Hl7Segment, art: BelegungsArt): string {
    const kandidaten = [
        art === "abgang" ? feldWert(pv1, 45) : feldWert(pv1, 44),
        feldWert(segment(nachricht, "EVN") ?? { name: "EVN", felder: [] }, 2),
        feldWert(segment(nachricht, "MSH") ?? { name: "MSH", felder: [] }, 7),
    ];
    for (const k of kandidaten) {
        const iso = hl7ZeitZuIso(k);
        if (iso)
            return iso;
    }
    return new Date().toISOString();
}
export function hl7ZeitZuIso(stempel: string): string | null {
    const s = (stempel ?? "").trim();
    const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})?(\d{2})?)?(?:\.\d+)?([+-]\d{4})?$/.exec(s);
    if (!m)
        return null;
    const [, jahr, monat, tag, stunde, minute, sekunde, zone] = m;
    const basis = `${jahr}-${monat}-${tag}T${stunde ?? "00"}:${minute ?? "00"}:${sekunde ?? "00"}`;
    if (zone) {
        const iso = `${basis}${zone.slice(0, 3)}:${zone.slice(3)}`;
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(basis);
    return Number.isNaN(d.getTime()) ? null : basis;
}
export function fallSchluessel(nummer: string, salz: string): string {
    return createHash("sha256").update(`${salz}:${nummer}`).digest("hex").slice(0, 32);
}
export function quittung(nachricht: Hl7Nachricht | null, status: "AA" | "AE" | "AR", text?: string): string {
    const nummer = nachricht?.nummer || "UNBEKANNT";
    const jetzt = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14);
    const msa = text ? `MSA|${status}|${nummer}|${text.replace(/[|\r\n]/g, " ")}` : `MSA|${status}|${nummer}`;
    return [
        `MSH|^~\\&|NURVO|NURVO|||${jetzt}||ACK|${jetzt}|P|${nachricht?.version || "2.5"}`,
        msa,
    ].join("\r");
}

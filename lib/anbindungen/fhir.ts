import type { Datenart } from "./typen";
export type FhirZugang = {
    basis: string;
    auth: "keine" | "basic" | "token";
    benutzer?: string;
    geheimnis?: string;
};
export class FhirFehler extends Error {
    readonly status: number;
    constructor(nachricht: string, status = 0) {
        super(nachricht);
        this.name = "FhirFehler";
        this.status = status;
    }
}
export function zieladresseErlaubt(url: string): {
    ok: true;
} | {
    ok: false;
    grund: string;
} {
    let u: URL;
    try {
        u = new URL(url);
    }
    catch {
        return { ok: false, grund: "Keine gültige Adresse." };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
        return { ok: false, grund: "Nur http und https." };
    }
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost")) {
        return { ok: false, grund: "localhost ist der Server selbst, nicht Ihr KIS." };
    }
    if (host === "::1" || /^127\./.test(host)) {
        return { ok: false, grund: "Rückschleifen-Adressen führen auf den Server selbst." };
    }
    if (/^169\.254\./.test(host) || host === "metadata.google.internal" || host.endsWith(".internal")) {
        return { ok: false, grund: "Diese Adresse gehört der Cloud-Umgebung, nicht Ihrem Haus." };
    }
    return { ok: true };
}
const SEITEN_GRENZE = 20;
const EINTRAG_GRENZE = 5000;
const ZEITGRENZE_MS = 20000;
type FhirRessource = Record<string, unknown>;
async function abrufen(zugang: FhirZugang, url: string): Promise<unknown> {
    const erlaubt = zieladresseErlaubt(url);
    if (!erlaubt.ok)
        throw new FhirFehler(erlaubt.grund);
    const kopf: Record<string, string> = { Accept: "application/fhir+json, application/json" };
    if (zugang.auth === "token" && zugang.geheimnis) {
        kopf.Authorization = `Bearer ${zugang.geheimnis}`;
    }
    else if (zugang.auth === "basic" && zugang.benutzer) {
        const roh = `${zugang.benutzer}:${zugang.geheimnis ?? ""}`;
        kopf.Authorization = `Basic ${Buffer.from(roh, "utf8").toString("base64")}`;
    }
    const abbruch = AbortSignal.timeout(ZEITGRENZE_MS);
    let antwort: Response;
    try {
        antwort = await fetch(url, {
            headers: kopf,
            signal: abbruch,
            redirect: "manual",
        });
    }
    catch (e) {
        const grund = e instanceof Error && e.name === "TimeoutError"
            ? `Keine Antwort innerhalb von ${ZEITGRENZE_MS / 1000} Sekunden.`
            : "Der Server ist nicht erreichbar.";
        throw new FhirFehler(grund);
    }
    if (antwort.status >= 300 && antwort.status < 400) {
        throw new FhirFehler("Der Server leitet um. Bitte die endgültige Adresse eintragen.", antwort.status);
    }
    if (antwort.status === 401 || antwort.status === 403) {
        throw new FhirFehler("Zugang abgelehnt — Benutzer, Passwort oder Token stimmen nicht.", antwort.status);
    }
    if (!antwort.ok) {
        throw new FhirFehler(`Der Server antwortet mit Fehler ${antwort.status}.`, antwort.status);
    }
    const text = await antwort.text();
    try {
        return JSON.parse(text);
    }
    catch {
        throw new FhirFehler("Die Antwort ist kein JSON — zeigt die Adresse wirklich auf einen FHIR-Endpunkt?");
    }
}
export async function fhirSammeln(zugang: FhirZugang, suche: string): Promise<FhirRessource[]> {
    const basis = zugang.basis.replace(/\/+$/, "");
    let url: string | null = `${basis}/${suche.replace(/^\//, "")}`;
    const gesammelt: FhirRessource[] = [];
    for (let seite = 0; seite < SEITEN_GRENZE && url; seite++) {
        const bundle = (await abrufen(zugang, url)) as Record<string, unknown>;
        const eintraege = Array.isArray(bundle.entry) ? bundle.entry : [];
        for (const e of eintraege) {
            const res = (e as Record<string, unknown>)?.resource;
            if (res && typeof res === "object")
                gesammelt.push(res as FhirRessource);
            if (gesammelt.length >= EINTRAG_GRENZE)
                return gesammelt;
        }
        const links = Array.isArray(bundle.link) ? bundle.link : [];
        const weiter = links.find((l) => (l as Record<string, unknown>)?.relation === "next") as Record<string, unknown> | undefined;
        const naechste = typeof weiter?.url === "string" ? weiter.url : null;
        url = naechste && naechste !== url ? naechste : null;
    }
    return gesammelt;
}
export type PersonalSatz = {
    name: string;
    rolle: string | null;
    station: string | null;
    quellId: string;
};
export type StationSatz = {
    name: string;
    quellId: string;
};
export type BelegungSatz = {
    station: string;
    anzahl: number;
};
export function nameAus(res: FhirRessource): string {
    const namen = Array.isArray(res.name) ? (res.name as Record<string, unknown>[]) : [];
    const bevorzugt = namen.find((n) => n.use === "official") ?? namen[0];
    if (!bevorzugt)
        return "";
    if (typeof bevorzugt.text === "string" && bevorzugt.text.trim())
        return bevorzugt.text.trim();
    const vor = Array.isArray(bevorzugt.given) ? (bevorzugt.given as string[]).join(" ") : "";
    const nach = typeof bevorzugt.family === "string" ? bevorzugt.family : "";
    return `${vor} ${nach}`.trim();
}
function refId(ref: unknown): string {
    const wert = (ref as Record<string, unknown>)?.reference;
    if (typeof wert !== "string")
        return "";
    const teile = wert.split("/");
    return teile[teile.length - 1] ?? "";
}
function anzeigeText(feld: unknown): string | null {
    const c = feld as Record<string, unknown> | undefined;
    if (!c)
        return null;
    if (typeof c.text === "string" && c.text.trim())
        return c.text.trim();
    const codings = Array.isArray(c.coding) ? (c.coding as Record<string, unknown>[]) : [];
    for (const k of codings) {
        if (typeof k.display === "string" && k.display.trim())
            return k.display.trim();
        if (typeof k.code === "string" && k.code.trim())
            return k.code.trim();
    }
    return null;
}
export function personalAus(practitioners: FhirRessource[], rollen: FhirRessource[], stationsNamen: Map<string, string> = new Map()): PersonalSatz[] {
    const rollenJePerson = new Map<string, FhirRessource[]>();
    for (const r of rollen) {
        if (r.active === false)
            continue;
        const id = refId(r.practitioner);
        if (!id)
            continue;
        rollenJePerson.set(id, [...(rollenJePerson.get(id) ?? []), r]);
    }
    const heraus: PersonalSatz[] = [];
    for (const p of practitioners) {
        if (p.active === false)
            continue;
        const name = nameAus(p);
        if (!name)
            continue;
        const id = typeof p.id === "string" ? p.id : "";
        const meine = rollenJePerson.get(id) ?? [];
        const erste = meine[0];
        let station: string | null = null;
        if (erste) {
            const orte = Array.isArray(erste.location) ? (erste.location as unknown[]) : [];
            const ortId = refId(orte[0]);
            station = stationsNamen.get(ortId) ?? null;
        }
        const codes = erste && Array.isArray(erste.code) ? (erste.code as unknown[]) : [];
        heraus.push({
            name,
            rolle: erste ? anzeigeText(codes[0]) : null,
            station,
            quellId: id,
        });
    }
    return heraus;
}
export function stationenAus(locations: FhirRessource[]): StationSatz[] {
    const heraus: StationSatz[] = [];
    for (const l of locations) {
        if (l.status === "inactive")
            continue;
        const typ = (anzeigeText(l.physicalType) ?? "").toLowerCase();
        const istStation = typ === "wa" || typ === "ward" || typ.includes("station");
        if (!istStation)
            continue;
        const name = typeof l.name === "string" ? l.name.trim() : "";
        if (!name)
            continue;
        heraus.push({ name, quellId: typeof l.id === "string" ? l.id : "" });
    }
    return heraus;
}
export function stationsNamen(locations: FhirRessource[]): Map<string, string> {
    const karte = new Map<string, string>();
    for (const l of locations) {
        const id = typeof l.id === "string" ? l.id : "";
        const name = typeof l.name === "string" ? l.name.trim() : "";
        if (id && name)
            karte.set(id, name);
    }
    return karte;
}
export type BelegungsFall = {
    station: string;
    quellId: string;
};
export function belegungsFaelleAus(encounters: FhirRessource[], namen: Map<string, string>): BelegungsFall[] {
    const heraus: BelegungsFall[] = [];
    for (const e of encounters) {
        const station = stationDesFalls(e, namen);
        if (!station)
            continue;
        const quellId = typeof e.id === "string" ? e.id : "";
        if (!quellId)
            continue;
        heraus.push({ station, quellId });
    }
    return heraus;
}
export function belegungAus(encounters: FhirRessource[], namen: Map<string, string>): BelegungSatz[] {
    const zaehler = new Map<string, number>();
    for (const e of encounters) {
        const station = stationDesFalls(e, namen);
        if (!station)
            continue;
        zaehler.set(station, (zaehler.get(station) ?? 0) + 1);
    }
    return [...zaehler.entries()]
        .map(([station, anzahl]) => ({ station, anzahl }))
        .sort((a, b) => a.station.localeCompare(b.station, "de"));
}
function stationDesFalls(e: FhirRessource, namen: Map<string, string>): string {
    if (e.status !== "in-progress")
        return "";
    const orte = Array.isArray(e.location) ? (e.location as Record<string, unknown>[]) : [];
    const aktiv = orte.filter((o) => o.status !== "completed");
    const genommen = aktiv.length > 0 ? aktiv[aktiv.length - 1] : orte[orte.length - 1];
    if (!genommen)
        return "";
    return namen.get(refId(genommen.location)) ?? "";
}
export type PruefErgebnis = {
    ok: boolean;
    meldung: string;
    software?: string;
    fhirVersion?: string;
};
export async function fhirPruefen(zugang: FhirZugang): Promise<PruefErgebnis> {
    try {
        const basis = zugang.basis.replace(/\/+$/, "");
        const meta = (await abrufen(zugang, `${basis}/metadata`)) as Record<string, unknown>;
        if (meta.resourceType !== "CapabilityStatement") {
            return { ok: false, meldung: "Die Adresse antwortet, liefert aber keine FHIR-CapabilityStatement." };
        }
        const soft = meta.software as Record<string, unknown> | undefined;
        return {
            ok: true,
            meldung: "Verbindung steht.",
            software: typeof soft?.name === "string" ? soft.name : undefined,
            fhirVersion: typeof meta.fhirVersion === "string" ? meta.fhirVersion : undefined,
        };
    }
    catch (e) {
        return { ok: false, meldung: e instanceof Error ? e.message : "Unbekannter Fehler." };
    }
}
export type AbgleichErgebnis = {
    personal: PersonalSatz[];
    stationen: StationSatz[];
    belegung: BelegungSatz[];
    belegungsFaelle: BelegungsFall[];
    hinweise: string[];
};
export async function fhirAbgleich(zugang: FhirZugang, uebernehmen: Datenart[]): Promise<AbgleichErgebnis> {
    const hinweise: string[] = [];
    const brauchtOrte = uebernehmen.includes("einheiten") ||
        uebernehmen.includes("belegung") ||
        uebernehmen.includes("personal");
    const locations = brauchtOrte ? await fhirSammeln(zugang, "Location?_count=200") : [];
    const namen = stationsNamen(locations);
    let personal: PersonalSatz[] = [];
    if (uebernehmen.includes("personal")) {
        const [leute, rollen] = await Promise.all([
            fhirSammeln(zugang, "Practitioner?active=true&_count=200"),
            fhirSammeln(zugang, "PractitionerRole?_count=200").catch(() => {
                hinweise.push("PractitionerRole nicht abrufbar — Personal ohne Rolle und Station übernommen.");
                return [] as FhirRessource[];
            }),
        ]);
        personal = personalAus(leute, rollen, namen);
    }
    const stationen = uebernehmen.includes("einheiten") ? stationenAus(locations) : [];
    if (uebernehmen.includes("einheiten") && locations.length > 0 && stationen.length === 0) {
        hinweise.push(`${locations.length} Orte gefunden, aber keiner davon ist als Station gekennzeichnet ` +
            "(Location.physicalType). Die Stationen bitte von Hand anlegen.");
    }
    let belegung: BelegungSatz[] = [];
    let belegungsFaelle: BelegungsFall[] = [];
    if (uebernehmen.includes("belegung")) {
        const faelle = await fhirSammeln(zugang, "Encounter?status=in-progress&_count=200");
        belegung = belegungAus(faelle, namen);
        belegungsFaelle = belegungsFaelleAus(faelle, namen);
        const ohneId = belegung.reduce((s, b) => s + b.anzahl, 0) - belegungsFaelle.length;
        if (ohneId > 0) {
            hinweise.push(`${ohneId} Aufenthalte ohne Kennung im Quellsystem — sie sind in der Zahl ` +
                "enthalten, lassen sich zwischen zwei Abrufen aber nicht wiedererkennen.");
        }
    }
    return { personal, stationen, belegung, belegungsFaelle, hinweise };
}

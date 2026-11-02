import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import { isISODate } from "@/lib/date";
import { spalteFehlt } from "@/lib/db-fehler";
import { aktenEntschluesseln, aktenSchluesselVorhanden, aktenVerschluesseln, steuerIdNormal, svNummerNormal, } from "@/lib/personalakte/verschluesselung";
type Admin = SupabaseClient<any>;
export const BUCKET = "personalakte";
export const MAX_BYTES = 4 * 1024 * 1024;
export const ERLAUBTE_TYPEN: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
};
export const EINTRAG_ARTEN = {
    vertrag: "Arbeitsvertrag",
    vertragsaenderung: "Vertragsänderung",
    eintritt: "Eintrittsunterlagen",
    gespraech: "Mitarbeitergespräch",
    abmahnung: "Abmahnung",
    fortbildung: "Fortbildung",
    bescheinigung: "Bescheinigung",
    zeugnis: "Arbeitszeugnis",
    austritt: "Austrittsunterlagen",
    sonstiges: "Sonstiges",
    krankschreibung: "Krankschreibung",
    fehlzeit: "Fehlzeit",
} as const;
export type EintragArt = keyof typeof EINTRAG_ARTEN;
export function istEintragArt(v: unknown): v is EintragArt {
    return typeof v === "string" && v in EINTRAG_ARTEN;
}
const TEXTFELDER = [
    "geburtsort", "geburtsname", "staatsangehoerigkeit", "strasse", "plz", "ort",
    "telefon_privat", "email_privat", "notfallkontakt", "krankenkasse", "taetigkeit",
    "austrittsgrund", "kuendigungsfrist",
] as const;
const DATUMSFELDER = ["geburtsdatum", "eintritt", "probezeit_bis", "befristet_bis", "austritt"] as const;
export type AkteDaten = {
    [K in (typeof TEXTFELDER)[number] | (typeof DATUMSFELDER)[number]]: string | null;
} & {
    wochenstunden: number | null;
    urlaubstage_vertrag: number | null;
    steuer_id: string | null;
    sv_nummer: string | null;
};
export type AkteZeile = AkteDaten & {
    id: string | null;
    staff_id: string;
    full_name: string;
    geaendert_am: string | null;
    geaendert_von: string | null;
};
export function leereAkte(staffId: string, fullName: string): AkteZeile {
    const a: Record<string, unknown> = { id: null, staff_id: staffId, full_name: fullName, geaendert_am: null, geaendert_von: null };
    for (const f of [...TEXTFELDER, ...DATUMSFELDER])
        a[f] = null;
    a.wochenstunden = null;
    a.urlaubstage_vertrag = null;
    a.steuer_id = null;
    a.sv_nummer = null;
    return a as AkteZeile;
}
export function eingabePruefen(body: Record<string, unknown>): {
    zeile: Record<string, unknown>;
    fehler: string | null;
} {
    const zeile: Record<string, unknown> = {};
    for (const f of TEXTFELDER) {
        if (!(f in body))
            continue;
        const v = typeof body[f] === "string" ? (body[f] as string).trim().slice(0, 300) : "";
        zeile[f] = v || null;
    }
    for (const f of DATUMSFELDER) {
        if (!(f in body))
            continue;
        const v = body[f];
        if (v === null || v === "")
            zeile[f] = null;
        else if (isISODate(v))
            zeile[f] = v;
        else
            return { zeile, fehler: `Ungültiges Datum im Feld ${f}.` };
    }
    for (const [f, max] of [["wochenstunden", 60], ["urlaubstage_vertrag", 60]] as const) {
        if (!(f in body))
            continue;
        const v = body[f];
        if (v === null || v === "") {
            zeile[f] = null;
            continue;
        }
        const n = Number(String(v).replace(",", "."));
        if (!Number.isFinite(n) || n < 0 || n > max)
            return { zeile, fehler: `${f === "wochenstunden" ? "Wochenstunden" : "Urlaubstage"}: Wert zwischen 0 und ${max}.` };
        zeile[f] = f === "urlaubstage_vertrag" ? Math.round(n) : n;
    }
    const geheim: [
        string,
        string,
        (s: string) => string | null,
        string
    ][] = [
        ["steuer_id", "steuer_id_enc", steuerIdNormal, "Die Steuer-ID hat 11 Ziffern."],
        ["sv_nummer", "sv_nummer_enc", svNummerNormal, "Die SV-Nummer hat 12 Zeichen, z. B. 12 150385 M 012."],
    ];
    for (const [feld, spalte, normal, meldung] of geheim) {
        if (!(feld in body))
            continue;
        const roh = typeof body[feld] === "string" ? (body[feld] as string).trim() : "";
        if (!roh) {
            zeile[spalte] = null;
            continue;
        }
        const wert = normal(roh);
        if (!wert)
            return { zeile, fehler: meldung };
        if (!aktenSchluesselVorhanden())
            return { zeile, fehler: "schluessel_fehlt" };
        zeile[spalte] = aktenVerschluesseln(wert);
    }
    const e = zeile.eintritt as string | null | undefined, a = zeile.austritt as string | null | undefined;
    if (e && a && a < e)
        return { zeile, fehler: "Der Austritt liegt vor dem Eintritt." };
    return { zeile, fehler: null };
}
type DbAkte = Record<string, unknown> & {
    steuer_id_enc?: string | null;
    sv_nummer_enc?: string | null;
};
export function akteAusDb(row: DbAkte): AkteZeile {
    const { steuer_id_enc, sv_nummer_enc, erinnert: _erinnert, facility_name: _f, ...rest } = row;
    void _erinnert;
    void _f;
    return {
        ...(rest as Omit<AkteZeile, "steuer_id" | "sv_nummer">),
        steuer_id: aktenEntschluesseln(steuer_id_enc),
        sv_nummer: aktenEntschluesseln(sv_nummer_enc),
    } as AkteZeile;
}
export type Eintrag = {
    id: string;
    art: EintragArt;
    datum: string;
    titel: string;
    notiz: string | null;
    wiedervorlage: string | null;
    dokument_name: string | null;
    dokument_typ: string | null;
    dokument_bytes: number | null;
    erstellt_von: string | null;
    erstellt_am: string;
    kenntnis_angefordert?: boolean;
    kenntnis_am?: string | null;
    kenntnis_von?: string | null;
    datum_bis?: string | null;
    grund?: string | null;
};
export const EINTRAG_SPALTEN_ALT = "id, art, datum, titel, notiz, wiedervorlage, dokument_name, dokument_typ, dokument_bytes, erstellt_von, erstellt_am";
export const EINTRAG_SPALTEN_KENNTNIS = `${EINTRAG_SPALTEN_ALT}, kenntnis_angefordert, kenntnis_am, kenntnis_von`;
export const EINTRAG_SPALTEN = `${EINTRAG_SPALTEN_KENNTNIS}, datum_bis, grund`;
export type StammZeile = {
    id: string;
    full_name: string;
    role: string | null;
    qualifikation?: string | null;
    tax_class?: number | null;
    church_tax?: boolean | null;
    children_count?: number | null;
    hourly_rate?: number | null;
    email?: string | null;
    phone?: string | null;
};
export async function personDerEinrichtung(admin: Admin, facility: string, staffId: string): Promise<StammZeile | null> {
    if (!/^[0-9a-f-]{36}$/i.test(staffId))
        return null;
    const { data } = await admin.from("facility_staff").select("*")
        .eq("facility_name", facility).eq("id", staffId).maybeSingle();
    if (data)
        return data as StammZeile;
    const { data: konto } = await admin.from("user_profiles").select("full_name")
        .eq("facility", facility).eq("id", staffId).maybeSingle();
    if (!konto?.full_name)
        return null;
    const { data: perName } = await admin.from("facility_staff").select("*")
        .eq("facility_name", facility).eq("full_name", konto.full_name).limit(1).maybeSingle();
    return (perName as StammZeile | null) ?? null;
}
export async function akteLaden(admin: Admin, facility: string, staffId: string) {
    const eintraegeMit = (spalten: string) => admin.from("personalakte_eintraege").select(spalten)
        .eq("facility_name", facility).eq("staff_id", staffId).order("datum", { ascending: false });
    const [akte, ersterVersuch] = await Promise.all([
        admin.from("personalakte").select("*").eq("facility_name", facility).eq("staff_id", staffId).maybeSingle(),
        eintraegeMit(EINTRAG_SPALTEN),
    ]);
    let eintraege = ersterVersuch;
    for (const spalten of [EINTRAG_SPALTEN_KENNTNIS, EINTRAG_SPALTEN_ALT]) {
        if (!spalteFehlt(eintraege.error))
            break;
        eintraege = await eintraegeMit(spalten);
    }
    return { akte, eintraege };
}
export async function protokollieren(admin: Admin, args: {
    facility: string;
    staffId: string;
    wer: string;
    rolle: string;
    aktion: string;
    details?: string;
}): Promise<void> {
    const { error } = await admin.from("personalakte_protokoll").insert({
        facility_name: args.facility,
        staff_id: args.staffId,
        wer: args.wer,
        rolle: args.rolle,
        aktion: args.aktion,
        details: args.details ?? null,
    });
    if (error)
        console.error("[personalakte] Protokoll nicht geschrieben:", error.message);
}
export const FELD_LABEL: Record<string, string> = {
    geburtsdatum: "Geburtsdatum", geburtsort: "Geburtsort", geburtsname: "Geburtsname",
    staatsangehoerigkeit: "Staatsangehörigkeit", strasse: "Straße", plz: "PLZ", ort: "Ort",
    telefon_privat: "Telefon privat", email_privat: "E-Mail privat", notfallkontakt: "Notfallkontakt",
    steuer_id: "Steuer-ID", sv_nummer: "SV-Nummer", krankenkasse: "Krankenkasse",
    taetigkeit: "Tätigkeit", eintritt: "Eintritt", probezeit_bis: "Probezeit bis",
    befristet_bis: "Befristet bis", austritt: "Austritt", austrittsgrund: "Austrittsgrund",
    wochenstunden: "Wochenstunden", urlaubstage_vertrag: "Urlaubstage", kuendigungsfrist: "Kündigungsfrist",
};
export type VerlaufZeile = {
    feld: string;
    alt: string | null;
    neu: string | null;
    verschluesselt: boolean;
};
function alsText(v: unknown): string | null {
    if (v === null || v === undefined || v === "")
        return null;
    return String(v);
}
export function verlaufErmitteln(vorher: Record<string, unknown> | null, zeile: Record<string, unknown>): VerlaufZeile[] {
    const aus: VerlaufZeile[] = [];
    for (const [spalte, neuRoh] of Object.entries(zeile)) {
        const verschluesselt = spalte.endsWith("_enc");
        const feld = spalte.replace(/_enc$/, "");
        const altRoh = vorher ? vorher[spalte] : null;
        if (verschluesselt) {
            const a = aktenEntschluesseln(altRoh as string | null | undefined);
            const n = aktenEntschluesseln(neuRoh as string | null | undefined);
            if ((a ?? null) === (n ?? null))
                continue;
            aus.push({ feld, alt: alsText(altRoh), neu: alsText(neuRoh), verschluesselt: true });
        }
        else {
            const a = alsText(altRoh), n = alsText(neuRoh);
            const gleich = a === n || (a !== null && n !== null && !isNaN(Number(a)) && Number(a) === Number(n));
            if (gleich)
                continue;
            aus.push({ feld, alt: a, neu: n, verschluesselt: false });
        }
    }
    return aus;
}
export async function verlaufLaden(admin: Admin, facility: string, staffId: string) {
    const { data, error } = await admin.from("personalakte_verlauf")
        .select("feld, alt, neu, verschluesselt, wer, am")
        .eq("facility_name", facility).eq("staff_id", staffId)
        .order("am", { ascending: false }).limit(500);
    if (error)
        return [];
    return (data ?? []).map((v) => ({
        feld: v.feld as string,
        label: FELD_LABEL[v.feld as string] ?? (v.feld as string),
        alt: v.verschluesselt ? aktenEntschluesseln(v.alt as string | null) : (v.alt as string | null),
        neu: v.verschluesselt ? aktenEntschluesseln(v.neu as string | null) : (v.neu as string | null),
        wer: v.wer as string,
        am: v.am as string,
    }));
}
export async function aktenPersonenEntfernen(admin: Admin, facility: string, staffIds: string[]): Promise<number> {
    if (staffIds.length === 0)
        return 0;
    const { data } = await admin.from("personalakte_eintraege")
        .select("dokument_pfad").eq("facility_name", facility)
        .in("staff_id", staffIds).not("dokument_pfad", "is", null);
    const pfade = (data ?? [])
        .map((d: {
        dokument_pfad: string | null;
    }) => d.dokument_pfad)
        .filter((p): p is string => Boolean(p));
    if (pfade.length > 0)
        await admin.storage.from(BUCKET).remove(pfade).then(() => { }, () => { });
    let geloescht = 0;
    for (const tabelle of ["personalakte_eintraege", "personalakte_verlauf", "personalakte_protokoll", "personalakte"]) {
        const res = await admin.from(tabelle).delete({ count: "exact" })
            .eq("facility_name", facility).in("staff_id", staffIds);
        if (tabelle === "personalakte")
            geloescht = res.count ?? 0;
    }
    return geloescht;
}
async function bucketSicherstellen(admin: Admin): Promise<void> {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
    if (error && !/exist/i.test(error.message))
        throw error;
}
export function dokumentPfad(facility: string, staffId: string, endung: string): string {
    const f = createHash("sha256").update(facility).digest("hex").slice(0, 24);
    return `${f}/${staffId}/${randomUUID()}.${endung}`;
}
export function signaturPasst(typ: string, kopf: Uint8Array): boolean {
    const b = (i: number) => kopf[i];
    if (typ === "application/pdf")
        return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
    if (typ === "image/png")
        return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
    if (typ === "image/jpeg")
        return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    return false;
}
export async function dokumentHochladen(admin: Admin, pfad: string, datei: Blob, typ: string): Promise<void> {
    await bucketSicherstellen(admin);
    const { error } = await admin.storage.from(BUCKET).upload(pfad, datei, { contentType: typ, upsert: false });
    if (error)
        throw error;
}
export async function dokumentLink(admin: Admin, pfad: string, name: string): Promise<string | null> {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(pfad, 60, { download: name });
    if (error)
        return null;
    return data?.signedUrl ?? null;
}
export async function dokumentLoeschen(admin: Admin, pfad: string): Promise<void> {
    await admin.storage.from(BUCKET).remove([pfad]).then(() => { }, () => { });
}

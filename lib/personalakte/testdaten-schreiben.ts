import type { SupabaseClient } from "@supabase/supabase-js";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { BUCKET, ERLAUBTE_TYPEN, dokumentLoeschen, dokumentPfad, } from "@/lib/personalakte/akte";
import { testdokumentPdf } from "@/lib/personalakte/testdokument";
import { TESTDATEN_MARKE, erzeugeAkten, fasseZusammen, type AktenPerson, type EintragZeileNeu, type ErzeugteAkten, } from "@/lib/personalakte/testdaten";
import { aktenSchluesselVorhanden, aktenVerschluesseln } from "@/lib/personalakte/verschluesselung";
type Admin = SupabaseClient<any>;
export type SchreibOptionen = {
    dokumente?: number;
    dryRun?: boolean;
    heute?: string;
};
export type SchreibErgebnis = {
    akten: number;
    eintraege: number;
    verlauf: number;
    dokumente: number;
    uebersprungen: number;
    hinweise: string[];
    migrationFehlt?: boolean;
    zusammenfassung: string;
};
export async function aktenEinrichtungEntfernen(admin: Admin, facility: string): Promise<void> {
    const { data } = await admin.from("personalakte_eintraege")
        .select("dokument_pfad").eq("facility_name", facility).not("dokument_pfad", "is", null);
    const pfade = (data ?? [])
        .map((d: {
        dokument_pfad: string | null;
    }) => d.dokument_pfad)
        .filter((p): p is string => Boolean(p));
    if (pfade.length > 0)
        await admin.storage.from(BUCKET).remove(pfade).then(() => { }, () => { });
    for (const tabelle of ["personalakte_eintraege", "personalakte_verlauf", "personalakte_protokoll", "personalakte"]) {
        await admin.from(tabelle).delete().eq("facility_name", facility).then(() => { }, () => { });
    }
}
const STAPEL = 400;
async function einfuegen(admin: Admin, tabelle: string, zeilen: Record<string, unknown>[]) {
    for (let i = 0; i < zeilen.length; i += STAPEL) {
        const { error } = await admin.from(tabelle).insert(zeilen.slice(i, i + STAPEL));
        if (error)
            return error;
    }
    return null;
}
const EINTRAG_TITEL_ALT: Record<string, string> = {
    eintritt: "Eintritt: ",
    zeugnis: "Zeugnis: ",
    austritt: "Austritt: ",
};
const NEUE_ARTEN = new Set(["eintritt", "zeugnis", "austritt"]);
export async function aktenTestdatenSchreiben(admin: Admin, facility: string, personen: AktenPerson[], optionen: SchreibOptionen = {}): Promise<SchreibErgebnis> {
    const hinweise: string[] = [];
    const leer = (extra: Partial<SchreibErgebnis> = {}): SchreibErgebnis => ({
        akten: 0, eintraege: 0, verlauf: 0, dokumente: 0, uebersprungen: 0,
        hinweise, zusammenfassung: "Nichts erzeugt.", ...extra,
    });
    if (personen.length === 0)
        return leer();
    const bestand = await admin.from("personalakte")
        .select("staff_id, geaendert_von").eq("facility_name", facility);
    if (tabelleFehlt(bestand.error)) {
        hinweise.push("Migration 20261007_personalakte.sql fehlt — ohne sie gibt es keine Akten.");
        return leer({ migrationFehlt: true });
    }
    if (bestand.error) {
        hinweise.push(`Bestand nicht lesbar: ${bestand.error.message}`);
        return leer();
    }
    const vonHand = new Set((bestand.data ?? [])
        .filter((a: {
        geaendert_von: string | null;
    }) => a.geaendert_von !== TESTDATEN_MARKE)
        .map((a: {
        staff_id: string;
    }) => a.staff_id));
    const zuErzeugen = personen.filter(p => !vonHand.has(p.id));
    if (zuErzeugen.length === 0) {
        hinweise.push(`Alle ${personen.length} Akten sind von Hand gepflegt — nichts angefasst.`);
        return leer({ uebersprungen: personen.length });
    }
    const mitGeheimnissen = aktenSchluesselVorhanden();
    if (!mitGeheimnissen) {
        hinweise.push("Steuer-ID und SV-Nummer bleiben leer — in der Umgebung fehlt PERSONALAKTE_SCHLUESSEL.");
    }
    const erzeugt: ErzeugteAkten = erzeugeAkten(facility, zuErzeugen, {
        mitGeheimnissen, heute: optionen.heute,
    });
    const zusammenfassung = fasseZusammen(erzeugt);
    if (optionen.dryRun) {
        return {
            akten: erzeugt.akten.length, eintraege: erzeugt.eintraege.length,
            verlauf: erzeugt.verlauf.length, dokumente: 0,
            uebersprungen: vonHand.size, hinweise,
            zusammenfassung: `Würde erzeugen: ${zusammenfassung}.`,
        };
    }
    const aktenZeilen = erzeugt.akten.map(a => {
        const { steuer_id, sv_nummer, ...rest } = a;
        return {
            ...rest,
            steuer_id_enc: typeof steuer_id === "string" ? aktenVerschluesseln(steuer_id) : null,
            sv_nummer_enc: typeof sv_nummer === "string" ? aktenVerschluesseln(sv_nummer) : null,
        };
    });
    const alteDok = await admin.from("personalakte_eintraege")
        .select("dokument_pfad").eq("facility_name", facility)
        .eq("erstellt_von", TESTDATEN_MARKE).not("dokument_pfad", "is", null);
    const pfade = (alteDok.data ?? [])
        .map((d: {
        dokument_pfad: string | null;
    }) => d.dokument_pfad)
        .filter((p): p is string => Boolean(p));
    if (pfade.length > 0) {
        await admin.storage.from(BUCKET).remove(pfade).then(() => { }, () => { });
    }
    await admin.from("personalakte_eintraege").delete()
        .eq("facility_name", facility).eq("erstellt_von", TESTDATEN_MARKE);
    await admin.from("personalakte").delete()
        .eq("facility_name", facility).eq("geaendert_von", TESTDATEN_MARKE);
    await admin.from("personalakte_verlauf").delete()
        .eq("facility_name", facility).eq("wer", TESTDATEN_MARKE).then(() => { }, () => { });
    const akteFehler = await einfuegen(admin, "personalakte", aktenZeilen);
    if (akteFehler) {
        hinweise.push(`Akten nicht gespeichert: ${akteFehler.message}`);
        return leer({ uebersprungen: vonHand.size });
    }
    let eintraege: Record<string, unknown>[] = erzeugt.eintraege as Record<string, unknown>[];
    let eintragFehler = await einfuegen(admin, "personalakte_eintraege", eintraege);
    if (spalteFehlt(eintragFehler)) {
        eintraege = eintraege.map(z => {
            const { kenntnis_angefordert, kenntnis_am, kenntnis_von, ...rest } = z;
            return rest;
        });
        hinweise.push("Kenntnisnahme übersprungen — Migration 20261007_personalakte_kenntnis.sql fehlt.");
        eintragFehler = await einfuegen(admin, "personalakte_eintraege", eintraege);
    }
    if (eintragFehler?.code === "23514" && /art_check/.test(eintragFehler.message ?? "")) {
        eintraege = eintraege.map(z => NEUE_ARTEN.has(String(z.art))
            ? { ...z, art: "sonstiges", titel: `${EINTRAG_TITEL_ALT[String(z.art)] ?? ""}${z.titel}`.slice(0, 200) }
            : z);
        hinweise.push("Eintritt, Zeugnis und Austritt als „Sonstiges\" gespeichert — Migration 20261007_personalakte_ausbau.sql fehlt.");
        eintragFehler = await einfuegen(admin, "personalakte_eintraege", eintraege);
    }
    if (eintragFehler)
        hinweise.push(`Einträge nicht gespeichert: ${eintragFehler.message}`);
    let verlaufAnzahl = 0;
    if (erzeugt.verlauf.length > 0) {
        const fehler = await einfuegen(admin, "personalakte_verlauf", erzeugt.verlauf);
        if (tabelleFehlt(fehler))
            hinweise.push("Verlauf übersprungen — Migration 20261007_personalakte_ausbau.sql fehlt.");
        else if (fehler)
            hinweise.push(`Verlauf nicht gespeichert: ${fehler.message}`);
        else
            verlaufAnzahl = erzeugt.verlauf.length;
    }
    const dokumente = eintragFehler ? 0 : await dokumenteAblegen(admin, facility, erzeugt.eintraege, Math.max(0, Math.round(optionen.dokumente ?? 6)), hinweise);
    return {
        akten: aktenZeilen.length,
        eintraege: eintragFehler ? 0 : eintraege.length,
        verlauf: verlaufAnzahl,
        dokumente,
        uebersprungen: vonHand.size,
        hinweise,
        zusammenfassung,
    };
}
async function dokumenteAblegen(admin: Admin, facility: string, eintraege: EintragZeileNeu[], anzahl: number, hinweise: string[]): Promise<number> {
    if (anzahl === 0)
        return 0;
    const vertraege = eintraege.filter(e => e.art === "vertrag").slice(0, anzahl);
    if (vertraege.length === 0)
        return 0;
    const { error: bucketFehler } = await admin.storage.createBucket(BUCKET, { public: false });
    if (bucketFehler && !/exist/i.test(bucketFehler.message)) {
        hinweise.push(`Dokumente übersprungen — Speicher „${BUCKET}" nicht verfügbar: ${bucketFehler.message}`);
        return 0;
    }
    let gelegt = 0;
    for (const e of vertraege) {
        const staffId = String(e.staff_id);
        const pfad = dokumentPfad(facility, staffId, ERLAUBTE_TYPEN["application/pdf"]);
        const pdf = testdokumentPdf(String(e.titel), [
            "",
            "Dies ist ein ERZEUGTES Testdokument von Nurvo.",
            "Es enthält keine echten Personendaten und ersetzt keinen Vertrag.",
            "",
            `Einrichtung: ${facility}`,
            `Eintrag vom: ${String(e.datum)}`,
            `Angelegt von: ${TESTDATEN_MARKE}`,
        ]);
        const { error } = await admin.storage.from(BUCKET)
            .upload(pfad, pdf, { contentType: "application/pdf", upsert: false });
        if (error) {
            hinweise.push(`Dokument nicht gespeichert: ${error.message}`);
            break;
        }
        const { error: zeileFehler } = await admin.from("personalakte_eintraege")
            .update({
            dokument_pfad: pfad,
            dokument_name: `${String(e.titel).replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 100)}.pdf`,
            dokument_typ: "application/pdf",
            dokument_bytes: pdf.length,
        })
            .eq("facility_name", facility).eq("staff_id", staffId)
            .eq("art", "vertrag").eq("datum", String(e.datum));
        if (zeileFehler) {
            await dokumentLoeschen(admin, pfad);
            hinweise.push(`Dokument wieder entfernt — Zeile nicht aktualisiert: ${zeileFehler.message}`);
            break;
        }
        gelegt++;
    }
    return gelegt;
}

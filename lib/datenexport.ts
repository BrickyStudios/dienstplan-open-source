import type { SupabaseClient } from "@supabase/supabase-js";
import { strToU8, zipSync, type Zippable } from "fflate";
import { alleZeilen } from "@/lib/supabase-paging";
import { aktenEntschluesseln } from "@/lib/personalakte/verschluesselung";
type Admin = SupabaseClient<any>;
export type ExportTabelle = {
    tabelle: string;
    ueber: "facility_name" | "facility" | "staff_id";
    ohne?: string[];
    inhalt: string;
};
export const EXPORT: ExportTabelle[] = [
    { tabelle: "facility_settings", ueber: "facility_name", inhalt: "Einstellungen der Einrichtung" },
    { tabelle: "stations", ueber: "facility_name", inhalt: "Stationen bzw. Wohnbereiche" },
    { tabelle: "bereiche", ueber: "facility_name", inhalt: "Bereiche (z. B. Funktionsdienste, Praxisbereiche)" },
    { tabelle: "bereich_members", ueber: "facility_name", inhalt: "Zuordnung von Personen zu Bereichen" },
    { tabelle: "facility_staff", ueber: "facility_name", inhalt: "Personalstamm mit Vertragsgrenzen und Lohn-Eckdaten" },
    { tabelle: "user_profiles", ueber: "facility", ohne: ["recovery_phrase_hash"], inhalt: "Benutzerkonten (ohne Wiederherstellungsphrase)" },
    { tabelle: "station_leaders", ueber: "facility_name", inhalt: "Stations- und Bereichsleitungen" },
    { tabelle: "mitarbeiter_rechte", ueber: "facility_name", inhalt: "Rechte je Mitarbeiter und Selbstbedienung" },
    { tabelle: "certificates", ueber: "staff_id", inhalt: "Zertifikate und Qualifikationsnachweise" },
    { tabelle: "staff_certificates", ueber: "facility", inhalt: "Zertifikate aus der Mitarbeiter-Ansicht" },
    { tabelle: "trainings", ueber: "facility_name", inhalt: "Schulungen" },
    { tabelle: "training_attendees", ueber: "facility_name", inhalt: "Teilnahme an Schulungen" },
    { tabelle: "external_agencies", ueber: "facility_name", inhalt: "Hinterlegte Personaldienstleister" },
    { tabelle: "shift_templates", ueber: "facility_name", inhalt: "Schichtvorlagen" },
    { tabelle: "staffing_needs", ueber: "facility_name", inhalt: "Soll-Bedarf" },
    { tabelle: "shifts", ueber: "facility_name", inhalt: "Schichten" },
    { tabelle: "shift_assignments", ueber: "facility_name", inhalt: "Einteilungen (wer arbeitet wann)" },
    { tabelle: "bereich_shift_templates", ueber: "facility_name", inhalt: "Schichtvorlagen der Bereiche" },
    { tabelle: "bereich_shifts", ueber: "facility_name", inhalt: "Schichten der Bereiche" },
    { tabelle: "bereich_shift_assignments", ueber: "facility_name", inhalt: "Einteilungen in Bereichen" },
    { tabelle: "bereich_tasks", ueber: "facility_name", inhalt: "Aufgaben der Bereiche" },
    { tabelle: "station_tasks", ueber: "facility_name", inhalt: "Stationsaufgaben" },
    { tabelle: "task_categories", ueber: "facility_name", inhalt: "Aufgabenkategorien" },
    { tabelle: "task_codes", ueber: "facility_name", inhalt: "Aufgaben-Codes (Aufkleber)" },
    { tabelle: "facility_oncall_days", ueber: "facility_name", inhalt: "Bereitschaftstage" },
    { tabelle: "on_call_entries", ueber: "facility_name", inhalt: "Bereitschaftsdienste" },
    { tabelle: "springer_oncall", ueber: "facility_name", inhalt: "Springer-Bereitschaft" },
    { tabelle: "schicht_belegung", ueber: "facility_name", inhalt: "Belegung je Schicht" },
    { tabelle: "staff_wishes", ueber: "facility_name", inhalt: "Dienstwünsche" },
    { tabelle: "staff_availability", ueber: "facility_name", inhalt: "Verfügbarkeiten" },
    { tabelle: "availability_entries", ueber: "facility_name", inhalt: "Verfügbarkeitseinträge" },
    { tabelle: "vacation_requests", ueber: "staff_id", inhalt: "Urlaubsanträge" },
    { tabelle: "flextime_requests", ueber: "facility_name", inhalt: "Gleitzeittage" },
    { tabelle: "shift_swap_requests", ueber: "facility_name", inhalt: "Schichttausch" },
    { tabelle: "shift_release_requests", ueber: "facility_name", inhalt: "Schichtabgaben" },
    { tabelle: "shift_release_offers", ueber: "facility_name", inhalt: "Angebote zu Schichtabgaben" },
    { tabelle: "sick_reports", ueber: "facility_name", inhalt: "Krankmeldungen" },
    { tabelle: "nichterscheinen", ueber: "facility_name", inhalt: "Entschiedene Fälle „nicht erschienen“" },
    { tabelle: "external_agency_requests", ueber: "facility_name", inhalt: "Anfragen an Personaldienstleister" },
    { tabelle: "emergency_plan_runs", ueber: "facility_name", inhalt: "Notfallplan-Läufe" },
    { tabelle: "notfall_vorlagen", ueber: "facility_name", inhalt: "Notfall-Vorlagen" },
    { tabelle: "notfall_berechtigte", ueber: "facility_name", inhalt: "Wer Notfall-Vorlagen auslösen darf" },
    { tabelle: "notfall_ausloesungen", ueber: "facility_name", inhalt: "Protokoll ausgelöster Notfall-Vorlagen mit Empfängern" },
    { tabelle: "notfall_rueckmeldungen", ueber: "facility_name", inhalt: "Rückmeldungen „Ich könnte kommen“ auf Notfall-Vorlagen" },
    { tabelle: "verspaetungen", ueber: "facility_name", inhalt: "Über die App gemeldete Verspätungen" },
    { tabelle: "time_entries", ueber: "facility", inhalt: "Zeiterfassung" },
    { tabelle: "shift_reports", ueber: "facility_name", inhalt: "Schichtberichte (Soll gegen Ist)" },
    { tabelle: "overtime_rebalance_suggestions", ueber: "facility_name", inhalt: "Vorschläge zum Überstundenausgleich" },
    { tabelle: "payroll_runs", ueber: "facility_name", inhalt: "Lohnläufe" },
    { tabelle: "payroll_entries", ueber: "facility_name", inhalt: "Lohnabrechnungen" },
    { tabelle: "ppbv_records", ueber: "facility_name", inhalt: "Personalbemessungs-Nachweis" },
    { tabelle: "ppbv_einstufung", ueber: "facility_name", inhalt: "PPBV-Einstufung (nur Anzahlen)" },
    { tabelle: "burnout_scores", ueber: "facility_name", inhalt: "Belastungswerte" },
    { tabelle: "burnout_snapshots", ueber: "staff_id", inhalt: "Belastungsverlauf" },
    { tabelle: "shift_difficulty_ratings", ueber: "facility", inhalt: "Einschätzungen der Schichtbelastung" },
    { tabelle: "certificate_reminder_log", ueber: "facility_name", inhalt: "Versandte Zertifikats-Erinnerungen" },
    { tabelle: "ki_plan_recommendations", ueber: "facility_name", inhalt: "KI-Empfehlungen zum Plan" },
    { tabelle: "ki_monthly_adjustment_runs", ueber: "facility_name", inhalt: "Monatliche KI-Analysen" },
    { tabelle: "copilot_runs", ueber: "facility_name", inhalt: "Copilot-Läufe" },
    { tabelle: "simulator_runs", ueber: "facility_name", inhalt: "Simulationen" },
    { tabelle: "auto_schedule_log", ueber: "facility_name", inhalt: "Protokoll der automatischen Planung" },
    { tabelle: "personalakte", ueber: "facility_name", inhalt: "Personalakten (Steuer-ID und SV-Nummer entschlüsselt)" },
    { tabelle: "personalakte_eintraege", ueber: "facility_name", inhalt: "Einträge der Personalakten; Dateien unter dokumente/" },
    { tabelle: "personalakte_verlauf", ueber: "facility_name", inhalt: "Änderungsverlauf der Personalakten" },
    { tabelle: "personalakte_protokoll", ueber: "facility_name", inhalt: "Zugriffsprotokoll der Personalakten" },
    { tabelle: "notifications", ueber: "facility_name", inhalt: "Benachrichtigungen" },
    { tabelle: "support_messages", ueber: "facility", inhalt: "Support-Anfragen" },
    { tabelle: "anbindungen", ueber: "facility_name", ohne: ["geheimnis", "hl7_token_hash", "kalender_token_hash", "fall_salz"], inhalt: "Anbindungen an Fremdsysteme (ohne Zugangsdaten)" },
    { tabelle: "anbindung_laeufe", ueber: "facility_name", inhalt: "Läufe der Anbindungen" },
    { tabelle: "anbindung_belegung", ueber: "facility_name", inhalt: "Über Anbindungen empfangene Belegung" },
];
export const AUSGENOMMEN: Record<string, string> = {
    invite_codes: "Einladungscodes sind Zugangsschlüssel",
    checkin_tokens: "Check-in-Token sind Zugangsschlüssel",
    mitarbeiter_kalender: "Kalenderabo-Adressen der Mitarbeitenden sind Zugangsschlüssel",
    analytics_events: "Nurvo-interne, pseudonymisierte Nutzungsstatistik",
    admin_access_log: "Nurvo-internes Protokoll der Admin-Zugriffe",
    feedback_interests: "Nurvo-interne Rückmeldungen aus der Umfrage",
    leitung_einrichtungen: "Zugriffsrechte der Leitungskonten über mehrere Einrichtungen — Kontodaten, keine Einrichtungsdaten",
};
const LIMIT_DOKUMENTE_BYTES = 200 * 1024 * 1024;
function csvWert(v: unknown): string {
    if (v === null || v === undefined)
        return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function alsCsv(zeilen: Record<string, unknown>[]): string {
    const spalten = [...new Set(zeilen.flatMap((z) => Object.keys(z)))];
    const kopf = spalten.join(";");
    const rumpf = zeilen.map((z) => spalten.map((s) => csvWert(z[s])).join(";"));
    return "﻿" + [kopf, ...rumpf].join("\r\n");
}
export function zeileBereinigen(t: ExportTabelle, z: Record<string, unknown>): Record<string, unknown> {
    const aus: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(z)) {
        if (t.ohne?.includes(k))
            continue;
        if (k.endsWith("_enc")) {
            aus[k.replace(/_enc$/, "")] = aktenEntschluesseln(v as string | null);
            continue;
        }
        aus[k] = v;
    }
    return aus;
}
export type ExportErgebnis = {
    zip: Uint8Array;
    tabellen: number;
    zeilen: number;
    dokumente: number;
    fehlend: string[];
};
export async function exportBauen(admin: Admin, facility: string, stand: Date = new Date()): Promise<ExportErgebnis> {
    const dateien: Zippable = {};
    const uebersicht: string[] = [];
    const fehlend: string[] = [];
    let zeilenSumme = 0;
    const { data: staff } = await alleZeilen<{
        id: string;
    }>((von, bis) => admin.from("facility_staff").select("id").eq("facility_name", facility).range(von, bis));
    const { data: konten } = await alleZeilen<{
        id: string;
        staff_id: string | null;
    }>((von, bis) => admin.from("user_profiles").select("id, staff_id").eq("facility", facility).range(von, bis));
    const personen = [...new Set([
            ...(staff ?? []).map((s) => s.id),
            ...(konten ?? []).flatMap((k) => [k.id, k.staff_id].filter((x): x is string => !!x)),
        ])];
    for (const t of EXPORT) {
        let zeilen: Record<string, unknown>[] = [];
        if (t.ueber === "staff_id") {
            for (let i = 0; i < personen.length; i += 200) {
                const block = personen.slice(i, i + 200);
                const { data, error } = await alleZeilen<Record<string, unknown>>((von, bis) => admin.from(t.tabelle).select("*").in("staff_id", block).range(von, bis));
                if (error) {
                    fehlend.push(`${t.tabelle}: ${error.message}`);
                    zeilen = [];
                    break;
                }
                zeilen.push(...(data ?? []));
            }
        }
        else {
            const { data, error } = await alleZeilen<Record<string, unknown>>((von, bis) => admin.from(t.tabelle).select("*").eq(t.ueber, facility).range(von, bis));
            if (error) {
                fehlend.push(`${t.tabelle}: ${error.message}`);
                continue;
            }
            zeilen = data ?? [];
        }
        const sauber = zeilen.map((z) => zeileBereinigen(t, z));
        dateien[`daten/${t.tabelle}.json`] = strToU8(JSON.stringify(sauber, null, 2));
        dateien[`csv/${t.tabelle}.csv`] = strToU8(alsCsv(sauber));
        uebersicht.push(`${t.tabelle.padEnd(32)} ${String(sauber.length).padStart(7)}  ${t.inhalt}`);
        zeilenSumme += sauber.length;
    }
    let dokumente = 0, bytes = 0;
    const { data: eintraege } = await admin.from("personalakte_eintraege")
        .select("id, staff_id, dokument_pfad, dokument_name").eq("facility_name", facility).not("dokument_pfad", "is", null);
    for (const e of eintraege ?? []) {
        if (bytes > LIMIT_DOKUMENTE_BYTES) {
            fehlend.push("Weitere Dokumente über 200 MB: bitte beim Support anfordern");
            break;
        }
        const { data: blob } = await admin.storage.from("personalakte").download(e.dokument_pfad as string);
        if (!blob) {
            fehlend.push(`Dokument ${e.dokument_name} nicht lesbar`);
            continue;
        }
        const inhalt = new Uint8Array(await blob.arrayBuffer());
        bytes += inhalt.length;
        const name = String(e.dokument_name ?? "dokument").replace(/[\\/:*?"<>|]/g, "_");
        dateien[`dokumente/${e.staff_id}/${e.id}_${name}`] = inhalt;
        dokumente++;
    }
    const liesmich = [
        `Nurvo — Gesamtexport der Einrichtung „${facility}"`,
        `Stand: ${stand.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
        "",
        "Aufbau:",
        "  daten/      jede Tabelle als JSON — vollständig, maschinenlesbar, für den Umzug",
        "  csv/        dieselben Tabellen als CSV (Semikolon, UTF-8) — zum Öffnen in Excel",
        "  dokumente/  die Dateien der Personalakten, je Person ein Ordner (Ordnername = staff_id)",
        "",
        "Verknüpfung: Personen tragen in jeder Tabelle dieselbe Kennung (facility_staff.id = staff_id).",
        "Steuer-ID und SV-Nummer stehen entschlüsselt in daten/personalakte.json — die Datei vertraulich behandeln.",
        "",
        "Tabellen (Name, Zeilen, Inhalt):",
        ...uebersicht.map((z) => "  " + z),
        "",
        "Nicht enthalten, mit Grund:",
        ...Object.entries(AUSGENOMMEN).map(([t, g]) => `  ${t}: ${g}`),
        "  IBAN: liegt nur auf den Endgeräten der Beschäftigten, nie auf dem Server.",
        ...(fehlend.length ? ["", "Hinweise beim Erstellen:", ...fehlend.map((f) => "  " + f)] : []),
    ].join("\r\n");
    dateien["LIESMICH.txt"] = strToU8("﻿" + liesmich);
    return { zip: zipSync(dateien, { level: 6 }), tabellen: EXPORT.length, zeilen: zeilenSumme, dokumente, fehlend };
}

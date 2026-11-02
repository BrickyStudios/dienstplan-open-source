import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOvertimeCandidates, computeShiftGapExcluding, loadSettings } from "@/lib/sick-resolution";
import { ersatzAmTag, ersatzSchwelle, mindestbesetzungFuer } from "@/lib/scheduling/praxis-raster";
import { ladeBurnoutScores, ladeGenehmigteAbwesenheiten } from "@/lib/scheduling/plan-context";
import { buildStaffDirectory, loadStaffDirectory, type StaffDirectory } from "@/lib/staff-identity";
import { assessReplacementPpbv } from "@/lib/swap-ppbv";
import { notifyLeitung, notifyStaffByName } from "@/lib/notify";
import type { ReplacementCandidate } from "@/lib/scheduling/generate-plan-core";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO } from "@/lib/date";
type Admin = SupabaseClient<any>;
export const FRIST_REGEL_STUNDEN = 24;
export const FRIST_VORLAUF_STUNDEN = 12;
export const FRIST_MINDEST_STUNDEN = 2;
export type FristErgebnis = {
    frist: Date | null;
    zuKnapp: boolean;
};
export function berechneFrist(schichtBeginn: Date | null, jetzt: Date): FristErgebnis {
    const regel = new Date(jetzt.getTime() + FRIST_REGEL_STUNDEN * 3600000);
    if (!schichtBeginn || Number.isNaN(schichtBeginn.getTime()))
        return { frist: regel, zuKnapp: false };
    const spaetestens = new Date(schichtBeginn.getTime() - FRIST_VORLAUF_STUNDEN * 3600000);
    const frist = regel < spaetestens ? regel : spaetestens;
    const restStunden = (frist.getTime() - jetzt.getTime()) / 3600000;
    if (restStunden < FRIST_MINDEST_STUNDEN)
        return { frist: null, zuKnapp: true };
    return { frist, zuKnapp: false };
}
export function schichtBeginnAt(date: string, startTime: string | null | undefined): Date | null {
    if (!date)
        return null;
    const zeit = (startTime && /^\d{2}:\d{2}/.test(startTime)) ? startTime.slice(0, 5) : "06:00";
    const d = new Date(`${date}T${zeit}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}
export type ReleaseShift = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number | null;
    start_time: string | null;
    end_time: string | null;
};
export type AblehnGrund = "urlaub" | "fachkraftquote" | "regeln";
export type Diagnose = {
    geprueft: number;
    moeglich: number;
    angefragt: number;
    abgelehnt: number;
    frist_abgelaufen: number;
    gruende: Partial<Record<AblehnGrund, number>>;
};
export const LEERE_DIAGNOSE: Diagnose = {
    geprueft: 0, moeglich: 0, angefragt: 0, abgelehnt: 0, frist_abgelaufen: 0, gruende: {},
};
export type Kandidat = {
    staffId: string;
    staffName: string;
    score: number;
    reason: string;
    isOvertime: boolean;
    belastung: number | null;
};
export type ReleaseRow = {
    id: string;
    facility_name: string;
    staff_id: string;
    shift_id: string;
    shift_date: string;
    shift_type: string;
    station: string | null;
    reason: string;
    status: string;
    ersatz_noetig: boolean | null;
    luecke: number | null;
    uebernommen_von: string | null;
    diagnose: Diagnose | null;
    created_at: string;
    leitung_decided_at: string | null;
    resolved_at: string | null;
};
export type OfferRow = {
    id: string;
    release_id: string;
    facility_name: string;
    staff_id: string;
    rang: number;
    score: number | null;
    status: string;
    frist: string;
    created_at: string;
    decided_at: string | null;
};
export function istMigrationsLuecke(code: string | undefined | null): boolean {
    return tabelleFehlt({ code }) || spalteFehlt({ code });
}
export type Ersatzbedarf = {
    ersatzNoetig: boolean;
    luecke: number;
    quotenHinweis: string;
};
export async function pruefeErsatzbedarf(admin: Admin, facility: string, shift: ReleaseShift, staffId: string, staffName: string | null): Promise<Ersatzbedarf> {
    const { replacementMin, besetzungJeTag } = await loadSettings(admin, facility);
    const schwelle = ersatzSchwelle(Number(shift.planned_staff) || 1, ersatzAmTag(besetzungJeTag, shift.date, shift.shift_type) ?? mindestbesetzungFuer(replacementMin, shift.station, shift.shift_type));
    const luecke = schwelle <= 0 ? 0 : await computeShiftGapExcluding(admin, shift.id, schwelle, staffId, staffName);
    if (luecke > 0)
        return { ersatzNoetig: true, luecke, quotenHinweis: "" };
    const ppbv = await assessReplacementPpbv(admin, facility, {
        shiftId: shift.id, outgoingStaffId: staffId, outgoingName: staffName,
    }).catch(() => null);
    if (ppbv && !ppbv.ok)
        return { ersatzNoetig: true, luecke: Math.max(1, luecke), quotenHinweis: ppbv.reason };
    return { ersatzNoetig: false, luecke, quotenHinweis: "" };
}
async function ladeVerzeichnis(admin: Admin, facility: string): Promise<StaffDirectory> {
    const [staffRes, profilesRes] = await Promise.all([
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facility),
        admin.from("user_profiles").select("id, full_name").eq("facility", facility),
    ]);
    return buildStaffDirectory((staffRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[], (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[]);
}
export async function findeUebernahmeKandidaten(admin: Admin, facility: string, shift: ReleaseShift, abgebendeStaffId: string, abgebendeName: string | null, bereitsGefragt: string[] = []): Promise<{
    kandidaten: Kandidat[];
    diagnose: Diagnose;
}> {
    const diagnose: Diagnose = { ...LEERE_DIAGNOSE, gruende: {} };
    const settings = await loadSettings(admin, facility);
    const verzeichnis = await ladeVerzeichnis(admin, facility);
    const gefragteNamen = bereitsGefragt
        .map(id => verzeichnis.nameById.get(id))
        .filter((n): n is string => !!n);
    const ausschluss = [...(abgebendeName ? [abgebendeName] : []), ...gefragteNamen];
    const roh: ReplacementCandidate[] = await buildOvertimeCandidates(admin, facility, { station: shift.station, date: shift.date, shift_type: shift.shift_type, start_time: shift.start_time, end_time: shift.end_time }, shift.date, settings, ausschluss, undefined, abgebendeName).catch(() => [] as ReplacementCandidate[]);
    diagnose.geprueft = roh.length;
    if (roh.length === 0)
        return { kandidaten: [], diagnose };
    const ids = roh.map(c => c.staff_id).filter(Boolean);
    const abwesenheiten = await ladeGenehmigteAbwesenheiten(admin, {
        facilityName: facility, staffIds: ids, von: shift.date, bis: shift.date,
    }).catch(() => []);
    const gesperrt = new Set(abwesenheiten.map(a => a.staff_id));
    const belastungById = new Map<string, number>();
    for (const b of await ladeBurnoutScores(admin, { facilityName: facility, staffIds: ids }).catch(() => [])) {
        belastungById.set(b.staff_id, b.score);
    }
    const kandidaten: Kandidat[] = [];
    for (const c of roh) {
        if (gesperrt.has(c.staff_id)) {
            diagnose.gruende.urlaub = (diagnose.gruende.urlaub ?? 0) + 1;
            continue;
        }
        const ppbv = await assessReplacementPpbv(admin, facility, {
            shiftId: shift.id,
            outgoingStaffId: abgebendeStaffId, outgoingName: abgebendeName,
            incomingStaffId: c.staff_id, incomingName: c.staff_name,
        }).catch(() => null);
        if (ppbv && !ppbv.ok) {
            diagnose.gruende.fachkraftquote = (diagnose.gruende.fachkraftquote ?? 0) + 1;
            continue;
        }
        kandidaten.push({
            staffId: c.staff_id, staffName: c.staff_name, score: c.score, reason: c.reason,
            isOvertime: c.is_overtime, belastung: belastungById.get(c.staff_id) ?? null,
        });
    }
    kandidaten.sort((a, b) => {
        if (a.isOvertime !== b.isOvertime)
            return a.isOvertime ? 1 : -1;
        const belastungA = a.belastung ?? 0, belastungB = b.belastung ?? 0;
        const wertA = a.score - belastungA * 0.3;
        const wertB = b.score - belastungB * 0.3;
        return wertB - wertA;
    });
    diagnose.moeglich = kandidaten.length;
    diagnose.gruende.regeln = Math.max(0, diagnose.geprueft - kandidaten.length
        - (diagnose.gruende.urlaub ?? 0) - (diagnose.gruende.fachkraftquote ?? 0));
    if (diagnose.gruende.regeln === 0)
        delete diagnose.gruende.regeln;
    return { kandidaten, diagnose };
}
async function ladeSchicht(admin: Admin, facility: string, shiftId: string): Promise<ReleaseShift | null> {
    const { data } = await admin.from("shifts")
        .select("id, station, date, shift_type, planned_staff, start_time, end_time")
        .eq("facility_name", facility).eq("id", shiftId).maybeSingle();
    return (data as ReleaseShift | null) ?? null;
}
async function ladeVorgang(admin: Admin, facility: string, releaseId: string): Promise<ReleaseRow | null> {
    const { data } = await admin.from("shift_release_requests").select("*")
        .eq("id", releaseId).eq("facility_name", facility).maybeSingle();
    return (data as ReleaseRow | null) ?? null;
}
async function ladeAngebote(admin: Admin, releaseId: string): Promise<OfferRow[]> {
    const { data } = await admin.from("shift_release_offers").select("*")
        .eq("release_id", releaseId).order("rang");
    return (data ?? []) as OfferRow[];
}
function fmtDatum(date: string): string {
    try {
        return new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return date;
    }
}
function fmtSchicht(typ: string): string {
    return ({ frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" } as Record<string, string>)[typ] ?? typ;
}
function fmtFrist(iso: string): string {
    try {
        return new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    catch {
        return iso;
    }
}
export type VorgangErgebnis = {
    status: ReleaseRow["status"];
    meldung: string;
    angefragt?: string;
    frist?: string;
};
export async function bearbeiteVorgang(admin: Admin, facility: string, releaseId: string): Promise<VorgangErgebnis> {
    const vorgang = await ladeVorgang(admin, facility, releaseId);
    if (!vorgang)
        return { status: "eskaliert", meldung: "Vorgang nicht gefunden." };
    if (["ohne_ersatz_abgesagt", "uebernommen", "eskaliert", "abgelehnt_leitung", "zurueckgezogen"].includes(vorgang.status)) {
        return { status: vorgang.status, meldung: "" };
    }
    if (vorgang.status === "wartet_auf_leitung") {
        return { status: vorgang.status, meldung: "Die Leitung muss die Absage noch bestätigen." };
    }
    const jetzt = new Date();
    const angebote = await ladeAngebote(admin, releaseId);
    const offen = angebote.find(o => o.status === "offen");
    if (offen) {
        if (new Date(offen.frist).getTime() > jetzt.getTime()) {
            return { status: vorgang.status, meldung: "Die Anfrage läuft noch.", frist: offen.frist };
        }
        const { data: abgelaufen } = await admin.from("shift_release_offers")
            .update({ status: "frist_abgelaufen", decided_at: jetzt.toISOString() })
            .eq("id", offen.id).eq("status", "offen").is("decided_at", null)
            .select("id").maybeSingle();
        if (!abgelaufen)
            return { status: vorgang.status, meldung: "Die Anfrage wird gerade beantwortet." };
    }
    const schicht = await ladeSchicht(admin, facility, vorgang.shift_id);
    if (!schicht)
        return eskaliere(admin, facility, vorgang, "Die Schicht existiert nicht mehr.", vorgang.diagnose ?? LEERE_DIAGNOSE);
    const verzeichnis = await ladeVerzeichnis(admin, facility);
    const abgebendeName = verzeichnis.nameById.get(vorgang.staff_id) ?? null;
    const bereitsGefragt = angebote.map(o => o.staff_id);
    const { kandidaten, diagnose } = await findeUebernahmeKandidaten(admin, facility, schicht, vorgang.staff_id, abgebendeName, bereitsGefragt);
    diagnose.angefragt = angebote.length;
    diagnose.abgelehnt = angebote.filter(o => o.status === "abgelehnt").length;
    diagnose.frist_abgelaufen = angebote.filter(o => o.status === "frist_abgelaufen").length + (offen ? 1 : 0);
    if (kandidaten.length === 0) {
        return eskaliere(admin, facility, vorgang, "Kein:e Kolleg:in konnte die Schicht übernehmen.", diagnose);
    }
    const beginn = schichtBeginnAt(schicht.date, schicht.start_time);
    const { frist, zuKnapp } = berechneFrist(beginn, jetzt);
    if (zuKnapp || !frist) {
        return eskaliere(admin, facility, vorgang, `Bis zum Schichtbeginn bleibt zu wenig Zeit für eine Anfrage (mindestens ${FRIST_MINDEST_STUNDEN} Stunden).`, diagnose);
    }
    const naechster = kandidaten[0];
    const rang = angebote.length;
    const { error } = await admin.from("shift_release_offers").insert({
        facility_name: facility, release_id: releaseId, staff_id: naechster.staffId,
        rang, score: Math.round(naechster.score), status: "offen", frist: frist.toISOString(),
    });
    if (error) {
        if (error.code === "23505")
            return { status: vorgang.status, meldung: "Die Anfrage läuft bereits." };
        return eskaliere(admin, facility, vorgang, "Die Anfrage konnte nicht gestellt werden.", diagnose);
    }
    diagnose.angefragt = rang + 1;
    await admin.from("shift_release_requests")
        .update({ status: "wartet_auf_kandidat", ersatz_noetig: true, diagnose })
        .eq("id", releaseId).then(() => { }, () => { });
    await notifyStaffByName(admin, facility, naechster.staffName, "Kannst du eine Schicht übernehmen?", `${abgebendeName ?? "Ein:e Kolleg:in"} kann die ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)} (${schicht.station}) nicht übernehmen.`
        + ` Bitte bis ${fmtFrist(frist.toISOString())} antworten.${naechster.isOvertime ? " Hinweis: das wären Überstunden." : ""}`);
    return {
        status: "wartet_auf_kandidat", angefragt: naechster.staffName, frist: frist.toISOString(),
        meldung: `${naechster.staffName} wurde gefragt (Frist: ${fmtFrist(frist.toISOString())}).`,
    };
}
async function eskaliere(admin: Admin, facility: string, vorgang: ReleaseRow, grund: string, diagnose: Diagnose): Promise<VorgangErgebnis> {
    const jetzt = new Date().toISOString();
    await admin.from("shift_release_requests")
        .update({ status: "eskaliert", diagnose, resolved_at: jetzt })
        .eq("id", vorgang.id).then(() => { }, () => { });
    const verzeichnis = await ladeVerzeichnis(admin, facility);
    const name = verzeichnis.nameById.get(vorgang.staff_id) ?? "Ein:e Mitarbeiter:in";
    await notifyLeitung(admin, facility, "Schichtabgabe: kein Ersatz gefunden", `${name} kann die ${fmtSchicht(vorgang.shift_type)} am ${fmtDatum(vorgang.shift_date)}`
        + `${vorgang.station ? ` (${vorgang.station})` : ""} nicht übernehmen. ${grund} ${beschreibeDiagnose(diagnose)}`);
    await notifyStaffByName(admin, facility, name, "Schichtabgabe: Leitung entscheidet", `Für deine ${fmtSchicht(vorgang.shift_type)} am ${fmtDatum(vorgang.shift_date)} wurde kein Ersatz gefunden. Die Leitung übernimmt.`);
    return { status: "eskaliert", meldung: `${grund} Die Leitung wurde informiert.` };
}
export function beschreibeDiagnose(d: Diagnose | null | undefined): string {
    if (!d)
        return "";
    const teile: string[] = [];
    if (d.angefragt > 0)
        teile.push(`${d.angefragt} angefragt`);
    if (d.abgelehnt > 0)
        teile.push(`${d.abgelehnt} abgelehnt`);
    if (d.frist_abgelaufen > 0)
        teile.push(`${d.frist_abgelaufen}× Frist verstrichen`);
    if (d.gruende.urlaub)
        teile.push(`${d.gruende.urlaub} im Urlaub`);
    if (d.gruende.fachkraftquote)
        teile.push(`${d.gruende.fachkraftquote} hätten die Fachkraftquote gerissen`);
    if (d.gruende.regeln)
        teile.push(`${d.gruende.regeln} durch Ruhezeit/Vertrag/Verfügbarkeit gesperrt`);
    if (teile.length === 0)
        return `Geprüft wurden ${d.geprueft} Personen.`;
    return `Geprüft: ${d.geprueft} Personen — ${teile.join(", ")}.`;
}
export type StartErgebnis = {
    ok: false;
    grund: string;
    code?: number;
} | {
    ok: true;
    releaseId: string;
    ergebnis: VorgangErgebnis;
};
export async function starteAbgabe(admin: Admin, facility: string, args: {
    staffId: string;
    staffName: string | null;
    shiftId: string;
    reason: string;
    modus: "manual" | "automatic";
}): Promise<StartErgebnis> {
    const schicht = await ladeSchicht(admin, facility, args.shiftId);
    if (!schicht)
        return { ok: false, grund: "Diese Schicht wurde nicht gefunden.", code: 404 };
    const heute = berlinTodayISO();
    if (schicht.date < heute)
        return { ok: false, grund: "Vergangene Schichten lassen sich nicht mehr abgeben.", code: 400 };
    const { data: eigene } = await admin.from("shift_assignments")
        .select("id, staff_id, staff_name, status").eq("facility_name", facility).eq("shift_id", args.shiftId);
    const meine = ((eigene ?? []) as {
        id: string;
        staff_id: string | null;
        staff_name: string | null;
        status: string | null;
    }[])
        .filter(a => (a.status ?? "confirmed") === "confirmed")
        .find(a => a.staff_id === args.staffId || (!!args.staffName && a.staff_name === args.staffName));
    if (!meine)
        return { ok: false, grund: "Diese Schicht ist dir nicht (mehr) zugewiesen.", code: 403 };
    const bedarf = await pruefeErsatzbedarf(admin, facility, schicht, args.staffId, args.staffName);
    const { data: created, error } = await admin.from("shift_release_requests").insert({
        facility_name: facility, staff_id: args.staffId,
        shift_id: schicht.id, shift_date: schicht.date, shift_type: schicht.shift_type, station: schicht.station,
        reason: args.reason,
        status: bedarf.ersatzNoetig ? "sucht_ersatz" : (args.modus === "automatic" ? "ohne_ersatz_abgesagt" : "wartet_auf_leitung"),
        ersatz_noetig: bedarf.ersatzNoetig, luecke: bedarf.luecke,
        diagnose: LEERE_DIAGNOSE,
    }).select().single();
    if (error) {
        if (error.code === "23505")
            return { ok: false, grund: "Für diese Schicht läuft bereits eine Abgabe.", code: 409 };
        if (istMigrationsLuecke(error.code)) {
            return { ok: false, grund: "Die Schichtabgabe ist in dieser Einrichtung noch nicht eingerichtet (SQL-Migration 20260911 fehlt).", code: 503 };
        }
        return { ok: false, grund: error.message, code: 500 };
    }
    const releaseId = (created as {
        id: string;
    }).id;
    const name = args.staffName ?? "Ein:e Mitarbeiter:in";
    if (!bedarf.ersatzNoetig) {
        if (args.modus === "automatic") {
            const ok = await entferneAusSchicht(admin, facility, meine.id, schicht.id);
            if (!ok) {
                await admin.from("shift_release_requests").update({ status: "eskaliert", resolved_at: new Date().toISOString() })
                    .eq("id", releaseId).then(() => { }, () => { });
                return { ok: true, releaseId, ergebnis: { status: "eskaliert", meldung: "Die Zuweisung konnte nicht gelöst werden. Die Leitung entscheidet." } };
            }
            await admin.from("shift_release_requests").update({ resolved_at: new Date().toISOString() })
                .eq("id", releaseId).then(() => { }, () => { });
            await notifyLeitung(admin, facility, "Schicht ohne Ersatz abgesagt", `${name} gibt die ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)} (${schicht.station}) ab.`
                + ` Die Schicht bleibt auch ohne diese Person besetzt (Soll ${schicht.planned_staff ?? 1}). Grund: ${args.reason}`);
            return { ok: true, releaseId, ergebnis: { status: "ohne_ersatz_abgesagt", meldung: "Die Schicht ist auch ohne dich besetzt — deine Absage gilt." } };
        }
        await notifyLeitung(admin, facility, "Schichtabgabe ohne Ersatz — bitte bestätigen", `${name} kann die ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)} (${schicht.station}) nicht übernehmen.`
            + ` Die Schicht bliebe auch ohne diese Person besetzt. Grund: ${args.reason}`);
        return { ok: true, releaseId, ergebnis: { status: "wartet_auf_leitung", meldung: "Für diesen Tag wird kein Ersatz gebraucht. Die Leitung bestätigt die Absage." } };
    }
    if (bedarf.quotenHinweis) {
        await notifyLeitung(admin, facility, "Schichtabgabe: Fachkraftquote betroffen", `${name} (${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)}): ${bedarf.quotenHinweis}`);
    }
    const ergebnis = await bearbeiteVorgang(admin, facility, releaseId);
    return { ok: true, releaseId, ergebnis };
}
async function entferneAusSchicht(admin: Admin, facility: string, assignmentId: string, shiftId: string): Promise<boolean> {
    const { error } = await admin.from("shift_assignments")
        .update({ status: "cancelled" }).eq("id", assignmentId).eq("facility_name", facility);
    if (!error) {
        await syncActualStaff(admin, facility, [shiftId]);
        return true;
    }
    const { error: delErr } = await admin.from("shift_assignments")
        .delete().eq("id", assignmentId).eq("facility_name", facility);
    if (!delErr)
        await syncActualStaff(admin, facility, [shiftId]);
    return !delErr;
}
async function uebertrageSchicht(admin: Admin, facility: string, shiftId: string, von: {
    staffId: string;
    staffName: string | null;
}, an: {
    staffId: string;
    staffName: string;
}, alsUeberstunde: boolean): Promise<{
    ok: boolean;
    grund?: string;
}> {
    const { data } = await admin.from("shift_assignments")
        .select("id, staff_id, staff_name, status").eq("facility_name", facility).eq("shift_id", shiftId);
    const rows = (data ?? []) as {
        id: string;
        staff_id: string | null;
        staff_name: string | null;
        status: string | null;
    }[];
    const aktiv = rows.filter(r => (r.status ?? "confirmed") === "confirmed");
    const zeile = aktiv.find(r => r.staff_id === von.staffId) ?? (von.staffName ? aktiv.find(r => r.staff_name === von.staffName) : undefined);
    if (!zeile)
        return { ok: false, grund: "Die Zuweisung wurde inzwischen geändert." };
    if (aktiv.some(r => r.id !== zeile.id && (r.staff_id === an.staffId || r.staff_name === an.staffName))) {
        return { ok: false, grund: "Die übernehmende Person steht bereits auf dieser Schicht." };
    }
    const nochDieselbe = <Q extends {
        eq: (k: string, v: string) => Q;
        is: (k: string, v: null) => Q;
    }>(q: Q): Q => zeile.staff_id ? q.eq("staff_id", zeile.staff_id) : q.is("staff_id", null).eq("staff_name", zeile.staff_name ?? "");
    const versuch = await nochDieselbe(admin.from("shift_assignments")
        .update({ staff_id: an.staffId, staff_name: an.staffName, is_overtime: alsUeberstunde, understaffing_decision: "schichtabgabe" })
        .eq("id", zeile.id)).select("id");
    let { error } = versuch;
    let getroffen = versuch.data?.length ?? 0;
    if (error) {
        const ohne = await nochDieselbe(admin.from("shift_assignments")
            .update({ staff_id: an.staffId, staff_name: an.staffName }).eq("id", zeile.id)).select("id");
        error = ohne.error;
        getroffen = ohne.data?.length ?? 0;
    }
    if (error)
        return { ok: false, grund: "Die Schicht konnte nicht übertragen werden." };
    if (getroffen === 0)
        return { ok: false, grund: "Die Zuweisung wurde inzwischen geändert." };
    return { ok: true };
}
export type AntwortErgebnis = {
    ok: boolean;
    status: string;
    meldung: string;
};
export async function beantworteAngebot(admin: Admin, facility: string, offerId: string, staffId: string, antwort: "annehmen" | "ablehnen"): Promise<AntwortErgebnis> {
    const jetzt = new Date();
    const { data: offerRow } = await admin.from("shift_release_offers")
        .update({ decided_at: jetzt.toISOString() })
        .eq("id", offerId).eq("facility_name", facility).eq("staff_id", staffId).eq("status", "offen")
        .is("decided_at", null)
        .select("*").maybeSingle();
    const angebot = offerRow as OfferRow | null;
    if (!angebot)
        return { ok: false, status: "", meldung: "Diese Anfrage ist nicht mehr offen." };
    try {
        return await entscheideAngebot(admin, facility, angebot, staffId, antwort, jetzt);
    }
    catch (e) {
        await admin.from("shift_release_offers").update({ decided_at: null })
            .eq("id", angebot.id).eq("facility_name", facility).eq("status", "offen").then(() => { }, () => { });
        throw e;
    }
}
async function entscheideAngebot(admin: Admin, facility: string, angebot: OfferRow, staffId: string, antwort: "annehmen" | "ablehnen", jetzt: Date): Promise<AntwortErgebnis> {
    const vorgang = await ladeVorgang(admin, facility, angebot.release_id);
    if (!vorgang)
        return { ok: false, status: "", meldung: "Der Vorgang wurde nicht gefunden." };
    if (new Date(angebot.frist).getTime() <= jetzt.getTime()) {
        await admin.from("shift_release_offers").update({ status: "frist_abgelaufen", decided_at: jetzt.toISOString() })
            .eq("id", angebot.id).then(() => { }, () => { });
        const weiter = await bearbeiteVorgang(admin, facility, angebot.release_id);
        return { ok: false, status: weiter.status, meldung: "Die Frist für diese Anfrage ist abgelaufen." };
    }
    const verzeichnis = await ladeVerzeichnis(admin, facility);
    const abgebendeName = verzeichnis.nameById.get(vorgang.staff_id) ?? null;
    const uebernehmendeName = verzeichnis.nameById.get(staffId) ?? "";
    if (antwort === "ablehnen") {
        await admin.from("shift_release_offers").update({ status: "abgelehnt", decided_at: jetzt.toISOString() })
            .eq("id", angebot.id).then(() => { }, () => { });
        const weiter = await bearbeiteVorgang(admin, facility, angebot.release_id);
        return { ok: true, status: weiter.status, meldung: "Abgelehnt — es wird weitergesucht." };
    }
    const schicht = await ladeSchicht(admin, facility, vorgang.shift_id);
    if (!schicht)
        return { ok: false, status: vorgang.status, meldung: "Die Schicht existiert nicht mehr." };
    const { kandidaten } = await findeUebernahmeKandidaten(admin, facility, schicht, vorgang.staff_id, abgebendeName, []);
    const nochGeeignet = kandidaten.find(k => k.staffId === staffId);
    if (!nochGeeignet) {
        await admin.from("shift_release_offers").update({ status: "uebersprungen", decided_at: jetzt.toISOString() })
            .eq("id", angebot.id).then(() => { }, () => { });
        const weiter = await bearbeiteVorgang(admin, facility, angebot.release_id);
        await notifyStaffByName(admin, facility, uebernehmendeName, "Übernahme nicht mehr möglich", `Die ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)} lässt sich inzwischen nicht mehr auf dich übertragen (Ruhezeit, Urlaub oder Vertragsgrenze).`);
        return { ok: false, status: weiter.status, meldung: "Die Übernahme ist inzwischen nicht mehr zulässig." };
    }
    const uebertrag = await uebertrageSchicht(admin, facility, schicht.id, { staffId: vorgang.staff_id, staffName: abgebendeName }, { staffId, staffName: uebernehmendeName || nochGeeignet.staffName }, nochGeeignet.isOvertime);
    if (!uebertrag.ok) {
        await admin.from("shift_release_offers").update({ status: "uebersprungen", decided_at: jetzt.toISOString() })
            .eq("id", angebot.id).then(() => { }, () => { });
        const weiter = await bearbeiteVorgang(admin, facility, angebot.release_id);
        return { ok: false, status: weiter.status, meldung: uebertrag.grund ?? "Die Übernahme ist fehlgeschlagen." };
    }
    await mitWiederholung("Angebot angenommen", () => admin.from("shift_release_offers")
        .update({ status: "angenommen", decided_at: jetzt.toISOString() }).eq("id", angebot.id));
    await mitWiederholung("Vorgang übernommen", () => admin.from("shift_release_requests")
        .update({ status: "uebernommen", uebernommen_von: staffId, resolved_at: jetzt.toISOString() })
        .eq("id", vorgang.id));
    const wer = uebernehmendeName || nochGeeignet.staffName;
    if (abgebendeName) {
        await notifyStaffByName(admin, facility, abgebendeName, "Schicht übernommen", `${wer} übernimmt deine ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)}. Du arbeitest an dem Tag nicht.`);
    }
    await notifyLeitung(admin, facility, "Schicht übernommen", `${wer} übernimmt die ${fmtSchicht(schicht.shift_type)} am ${fmtDatum(schicht.date)} (${schicht.station}) von ${abgebendeName ?? "einer abgebenden Person"}.`
        + `${nochGeeignet.isOvertime ? " Hinweis: als Überstunde." : ""} Grund der Abgabe: ${vorgang.reason}`);
    return { ok: true, status: "uebernommen", meldung: "Übernommen — die Schicht steht jetzt in deinem Plan." };
}
export type EntscheidErgebnis = {
    ok: boolean;
    status: string;
    meldung: string;
    code?: number;
};
export async function entscheideAlsLeitung(admin: Admin, facility: string, releaseId: string, entscheidung: "freigeben" | "ablehnen", hinweis?: string): Promise<EntscheidErgebnis> {
    const vorgang = await ladeVorgang(admin, facility, releaseId);
    if (!vorgang)
        return { ok: false, status: "", meldung: "Der Vorgang wurde nicht gefunden.", code: 404 };
    if (["ohne_ersatz_abgesagt", "uebernommen", "abgelehnt_leitung", "zurueckgezogen"].includes(vorgang.status)) {
        return { ok: false, status: vorgang.status, meldung: "Dieser Vorgang ist bereits abgeschlossen.", code: 409 };
    }
    const dir = await loadStaffDirectory(admin, facility);
    const abgebendeName = dir.nameById.get(vorgang.staff_id) ?? null;
    const jetzt = new Date().toISOString();
    if (entscheidung === "ablehnen") {
        await admin.from("shift_release_offers")
            .update({ status: "uebersprungen", decided_at: jetzt })
            .eq("release_id", releaseId).eq("status", "offen").then(() => { }, () => { });
        await admin.from("shift_release_requests")
            .update({ status: "abgelehnt_leitung", leitung_decided_at: jetzt, resolved_at: jetzt })
            .eq("id", releaseId).eq("facility_name", facility);
        if (abgebendeName) {
            await notifyStaffByName(admin, facility, abgebendeName, "Abgabe abgelehnt", `Die ${fmtSchicht(vorgang.shift_type)} am ${fmtDatum(vorgang.shift_date)} bleibt bei dir.`
                + (hinweis ? ` Begründung: ${hinweis}` : ""));
        }
        return { ok: true, status: "abgelehnt_leitung", meldung: "Der Dienst bleibt bei der abgebenden Person." };
    }
    const { data: rows } = await admin.from("shift_assignments")
        .select("id, staff_id, staff_name, status").eq("facility_name", facility).eq("shift_id", vorgang.shift_id);
    const zeile = ((rows ?? []) as {
        id: string;
        staff_id: string | null;
        staff_name: string | null;
        status: string | null;
    }[])
        .filter(r => (r.status ?? "confirmed") === "confirmed")
        .find(r => r.staff_id === vorgang.staff_id || (!!abgebendeName && r.staff_name === abgebendeName));
    if (zeile && !(await entferneAusSchicht(admin, facility, zeile.id, vorgang.shift_id))) {
        return { ok: false, status: vorgang.status, meldung: "Die Zuweisung konnte nicht gelöst werden.", code: 500 };
    }
    await admin.from("shift_release_offers")
        .update({ status: "uebersprungen", decided_at: jetzt })
        .eq("release_id", releaseId).eq("status", "offen").then(() => { }, () => { });
    await admin.from("shift_release_requests")
        .update({ status: "ohne_ersatz_abgesagt", leitung_decided_at: jetzt, resolved_at: jetzt })
        .eq("id", releaseId).eq("facility_name", facility);
    if (abgebendeName) {
        await notifyStaffByName(admin, facility, abgebendeName, "Abgabe bestätigt", `Die ${fmtSchicht(vorgang.shift_type)} am ${fmtDatum(vorgang.shift_date)} ist nicht mehr deine.`
            + (hinweis ? ` Hinweis: ${hinweis}` : ""));
    }
    return {
        ok: true, status: "ohne_ersatz_abgesagt",
        meldung: zeile
            ? "Freigegeben — die Person steht nicht mehr auf dieser Schicht."
            : "Freigegeben. Eine aktive Zuweisung gab es nicht mehr.",
    };
}
export async function ziehZurueck(admin: Admin, facility: string, releaseId: string, staffId: string): Promise<EntscheidErgebnis> {
    const vorgang = await ladeVorgang(admin, facility, releaseId);
    if (!vorgang)
        return { ok: false, status: "", meldung: "Der Vorgang wurde nicht gefunden.", code: 404 };
    if (vorgang.staff_id !== staffId) {
        return { ok: false, status: "", meldung: "Das ist nicht dein Vorgang.", code: 403 };
    }
    if (!["sucht_ersatz", "wartet_auf_kandidat", "wartet_auf_leitung"].includes(vorgang.status)) {
        return { ok: false, status: vorgang.status, meldung: "Dieser Vorgang lässt sich nicht mehr zurücknehmen.", code: 409 };
    }
    const jetzt = new Date().toISOString();
    const offen = (await ladeAngebote(admin, releaseId)).find(a => a.status === "offen");
    if (offen) {
        await admin.from("shift_release_offers")
            .update({ status: "uebersprungen", decided_at: jetzt }).eq("id", offen.id).then(() => { }, () => { });
        const dir = await loadStaffDirectory(admin, facility);
        const gefragt = dir.nameById.get(offen.staff_id);
        if (gefragt) {
            await notifyStaffByName(admin, facility, gefragt, "Anfrage zurückgezogen", `Die Anfrage zur ${fmtSchicht(vorgang.shift_type)} am ${fmtDatum(vorgang.shift_date)} hat sich erledigt — du musst nichts tun.`);
        }
    }
    await admin.from("shift_release_requests")
        .update({ status: "zurueckgezogen", resolved_at: jetzt })
        .eq("id", releaseId).eq("facility_name", facility);
    return { ok: true, status: "zurueckgezogen", meldung: "Zurückgenommen — die Schicht bleibt bei dir." };
}
export async function verarbeiteFaelligeVorgaenge(admin: Admin, facility: string): Promise<number> {
    try {
        const { data, error } = await admin.from("shift_release_offers")
            .select("release_id, frist, status")
            .eq("facility_name", facility).eq("status", "offen").lt("frist", new Date().toISOString());
        if (error || !data)
            return 0;
        const ids = [...new Set((data as {
                release_id: string;
            }[]).map(r => r.release_id))];
        for (const id of ids)
            await bearbeiteVorgang(admin, facility, id).catch(() => { });
        return ids.length;
    }
    catch {
        return 0;
    }
}
async function mitWiederholung(was: string, schreib: () => PromiseLike<{
    error: unknown;
}>): Promise<void> {
    for (let i = 0; i < 2; i++) {
        const { error } = await schreib();
        if (!error)
            return;
        if (i === 1)
            console.error(`[schichtabgabe] ${was}: Statuswechsel gescheitert`, error);
    }
}

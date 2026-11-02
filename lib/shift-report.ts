import type { SupabaseClient } from "@supabase/supabase-js";
import { istMigrationsFehler, planFenster, pflichtpauseMinuten, type ShiftRow } from "@/lib/burnout";
import { buildStaffDirectory } from "@/lib/staff-identity";
import { berlinTodayISO } from "@/lib/date";
import { MIN_REST_HOURS_ARBZG } from "@/lib/legal-limits";
type Admin = SupabaseClient<any>;
export const VERSPAETUNG_TOLERANZ_MINUTEN = 5;
export const FRUEHGEHEN_TOLERANZ_MINUTEN = 5;
export const RUHEZEIT_SOLL_STUNDEN = MIN_REST_HOURS_ARBZG;
const ZUORDNUNGSFENSTER_MS = 6 * 3600000;
export type TimeEntryFull = {
    id: string;
    user_id: string;
    user_name?: string | null;
    station?: string | null;
    check_in: string;
    check_out: string | null;
    duration_minutes?: number | null;
    total_pause_minutes?: number | null;
    required_break_minutes?: number | null;
};
export type ShiftSummary = {
    timeEntryId: string;
    staffId: string;
    shiftId: string | null;
    shiftDate: string;
    station: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    actualStart: string;
    actualEnd: string | null;
    lateMinutes: number | null;
    earlyLeaveMinutes: number | null;
    isLate: boolean;
    leftEarly: boolean;
    plannedMinutes: number | null;
    actualMinutes: number | null;
    pauseMinutes: number;
    requiredPauseMinutes: number;
    pauseCompliant: boolean;
    restHoursBefore: number | null;
    restCompliant: boolean | null;
};
function minutenZwischen(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 60000);
}
function tagesSchluessel(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const t = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${t}`;
}
export function buildShiftSummary(params: {
    entry: TimeEntryFull;
    plan: {
        shiftId: string;
        start: Date;
        end: Date;
        station?: string | null;
    } | null;
    vorherigesEnde: Date | null;
    toleranzMinuten?: number;
}): ShiftSummary | null {
    const { entry, plan, vorherigesEnde } = params;
    const toleranz = params.toleranzMinuten ?? VERSPAETUNG_TOLERANZ_MINUTEN;
    const start = new Date(entry.check_in);
    if (isNaN(start.getTime()))
        return null;
    const end = entry.check_out ? new Date(entry.check_out) : null;
    if (end && isNaN(end.getTime()))
        return null;
    const pause = entry.total_pause_minutes ?? 0;
    const brutto = end ? Math.max(0, minutenZwischen(start, end)) : null;
    const netto = entry.duration_minutes ?? (brutto != null ? Math.max(0, brutto - pause) : null);
    const pflichtpause = entry.required_break_minutes ?? (netto != null ? pflichtpauseMinuten(netto) : 0);
    const lateMinutes = plan ? minutenZwischen(plan.start, start) : null;
    const earlyLeaveMinutes = plan && end ? minutenZwischen(end, plan.end) : null;
    const rest = vorherigesEnde ? minutenZwischen(vorherigesEnde, start) / 60 : null;
    const restHoursBefore = rest != null && rest >= 0 ? Math.round(rest * 100) / 100 : null;
    return {
        timeEntryId: entry.id,
        staffId: entry.user_id,
        shiftId: plan?.shiftId ?? null,
        shiftDate: tagesSchluessel(start),
        station: entry.station ?? plan?.station ?? null,
        plannedStart: plan ? plan.start.toISOString() : null,
        plannedEnd: plan ? plan.end.toISOString() : null,
        actualStart: start.toISOString(),
        actualEnd: end ? end.toISOString() : null,
        lateMinutes,
        earlyLeaveMinutes,
        isLate: lateMinutes != null && lateMinutes > toleranz,
        leftEarly: earlyLeaveMinutes != null && earlyLeaveMinutes > FRUEHGEHEN_TOLERANZ_MINUTEN,
        plannedMinutes: plan ? Math.max(0, minutenZwischen(plan.start, plan.end)) : null,
        actualMinutes: netto,
        pauseMinutes: pause,
        requiredPauseMinutes: pflichtpause,
        pauseCompliant: pflichtpause === 0 || pause >= pflichtpause,
        restHoursBefore,
        restCompliant: restHoursBefore == null ? null : restHoursBefore >= RUHEZEIT_SOLL_STUNDEN,
    };
}
export type PunctualityRow = {
    staffId: string;
    shifts: number;
    bewerteteShifts: number;
    lateCount: number;
    lateMinutesSum: number;
    worstLateMinutes: number;
    earlyLeaveCount: number;
    pauseViolations: number;
    restViolations: number;
};
export function aggregatePunctuality(reports: ShiftSummary[]): PunctualityRow[] {
    const proPerson = new Map<string, PunctualityRow>();
    for (const r of reports) {
        const row = proPerson.get(r.staffId) ?? {
            staffId: r.staffId, shifts: 0, bewerteteShifts: 0, lateCount: 0,
            lateMinutesSum: 0, worstLateMinutes: 0, earlyLeaveCount: 0,
            pauseViolations: 0, restViolations: 0,
        };
        row.shifts++;
        if (r.lateMinutes != null)
            row.bewerteteShifts++;
        if (r.isLate && r.lateMinutes != null) {
            row.lateCount++;
            row.lateMinutesSum += r.lateMinutes;
            if (r.lateMinutes > row.worstLateMinutes)
                row.worstLateMinutes = r.lateMinutes;
        }
        if (r.leftEarly)
            row.earlyLeaveCount++;
        if (!r.pauseCompliant)
            row.pauseViolations++;
        if (r.restCompliant === false)
            row.restViolations++;
        proPerson.set(r.staffId, row);
    }
    return [...proPerson.values()].sort((a, b) => b.lateCount - a.lateCount || b.lateMinutesSum - a.lateMinutesSum);
}
function tageZurueck(tage: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - tage);
    return d;
}
export type ShiftReportAuswertung = {
    reports: ShiftSummary[];
    punctuality: PunctualityRow[];
    nameById: Map<string, string>;
};
export async function evaluateShiftReports(admin: Admin, facilityName: string, opts: {
    tage?: number;
    staffId?: string;
} = {}): Promise<ShiftReportAuswertung> {
    const tage = opts.tage ?? 28;
    const von = tageZurueck(tage);
    const vonTag = berlinTodayISO(von);
    const bisTag = berlinTodayISO();
    const teVon = new Date(von.getTime() - 36 * 3600000);
    const [shiftsRes, profilesRes, staffRes] = await Promise.all([
        admin.from("shifts").select("id, date, shift_type, start_time, end_time, station")
            .eq("facility_name", facilityName).gte("date", vonTag).lte("date", bisTag),
        admin.from("user_profiles").select("id, full_name").eq("facility", facilityName),
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facilityName),
    ]);
    const shifts = (shiftsRes.data ?? []) as (ShiftRow & {
        station?: string | null;
    })[];
    const directory = buildStaffDirectory((staffRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[], (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[]);
    const planProPerson = new Map<string, {
        shiftId: string;
        start: Date;
        end: Date;
        station?: string | null;
    }[]>();
    if (shifts.length > 0) {
        const shiftById = new Map(shifts.map(s => [s.id, s]));
        type ZuweisungRow = {
            shift_id: string;
            staff_id?: string | null;
            staff_name?: string | null;
            status?: string | null;
        };
        const aRes = await admin.from("shift_assignments")
            .select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facilityName).in("shift_id", shifts.map(s => s.id));
        let zuweisungen = (aRes.data ?? []) as ZuweisungRow[];
        if (aRes.error && istMigrationsFehler(aRes.error.code)) {
            const schlank = await admin.from("shift_assignments")
                .select("shift_id, staff_id, staff_name")
                .eq("facility_name", facilityName).in("shift_id", shifts.map(s => s.id));
            zuweisungen = (schlank.data ?? []) as ZuweisungRow[];
        }
        for (const a of zuweisungen) {
            if ((a.status ?? "confirmed") === "cancelled")
                continue;
            const shift = shiftById.get(a.shift_id);
            if (!shift)
                continue;
            const staffId = a.staff_id || (a.staff_name ? directory.idByName.get(a.staff_name) : null);
            if (!staffId)
                continue;
            const fenster = planFenster(shift);
            if (!fenster)
                continue;
            const liste = planProPerson.get(staffId) ?? [];
            liste.push({ shiftId: shift.id, start: fenster.start, end: fenster.end, station: shift.station ?? null });
            planProPerson.set(staffId, liste);
        }
    }
    const SPALTEN = "id, user_id, user_name, station, check_in, check_out, duration_minutes, total_pause_minutes, required_break_minutes";
    let teQuery = admin.from("time_entries").select(SPALTEN)
        .eq("facility", facilityName).not("check_out", "is", null)
        .gte("check_in", teVon.toISOString()).order("check_in", { ascending: true });
    if (opts.staffId)
        teQuery = teQuery.eq("user_id", opts.staffId);
    const teRes = await teQuery;
    let entries = (teRes.data ?? []) as TimeEntryFull[];
    if (teRes.error && istMigrationsFehler(teRes.error.code)) {
        let fallback = admin.from("time_entries")
            .select("id, user_id, user_name, station, check_in, check_out, duration_minutes")
            .eq("facility", facilityName).not("check_out", "is", null)
            .gte("check_in", teVon.toISOString()).order("check_in", { ascending: true });
        if (opts.staffId)
            fallback = fallback.eq("user_id", opts.staffId);
        const schlank = await fallback;
        entries = (schlank.data ?? []) as TimeEntryFull[];
    }
    const proPerson = new Map<string, TimeEntryFull[]>();
    for (const e of entries) {
        const liste = proPerson.get(e.user_id) ?? [];
        liste.push(e);
        proPerson.set(e.user_id, liste);
    }
    const reports: ShiftSummary[] = [];
    for (const [staffId, liste] of proPerson) {
        liste.sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
        const plaene = [...(planProPerson.get(staffId) ?? [])];
        const belegt = new Set<string>();
        let vorherigesEnde: Date | null = null;
        for (const e of liste) {
            const start = new Date(e.check_in);
            let treffer: {
                shiftId: string;
                start: Date;
                end: Date;
                station?: string | null;
            } | null = null;
            let bester = Infinity;
            for (const p of plaene) {
                if (belegt.has(p.shiftId))
                    continue;
                const abstand = Math.abs(p.start.getTime() - start.getTime());
                if (abstand < bester && abstand <= ZUORDNUNGSFENSTER_MS) {
                    bester = abstand;
                    treffer = p;
                }
            }
            if (treffer)
                belegt.add(treffer.shiftId);
            const summary = buildShiftSummary({ entry: e, plan: treffer, vorherigesEnde });
            if (summary) {
                if (summary.shiftDate >= vonTag)
                    reports.push(summary);
                vorherigesEnde = e.check_out ? new Date(e.check_out) : vorherigesEnde;
            }
        }
    }
    reports.sort((a, b) => b.actualStart.localeCompare(a.actualStart));
    return { reports, punctuality: aggregatePunctuality(reports), nameById: directory.nameById };
}
export async function persistShiftReports(admin: Admin, facilityName: string, reports: ShiftSummary[]): Promise<boolean> {
    if (reports.length === 0)
        return true;
    const rows = reports.map(r => ({
        facility_name: facilityName,
        staff_id: r.staffId,
        time_entry_id: r.timeEntryId,
        shift_id: r.shiftId,
        shift_date: r.shiftDate,
        station: r.station,
        planned_start: r.plannedStart,
        planned_end: r.plannedEnd,
        actual_start: r.actualStart,
        actual_end: r.actualEnd,
        late_minutes: r.lateMinutes,
        early_leave_minutes: r.earlyLeaveMinutes,
        is_late: r.isLate,
        left_early: r.leftEarly,
        planned_minutes: r.plannedMinutes,
        actual_minutes: r.actualMinutes,
        pause_minutes: r.pauseMinutes,
        required_pause_minutes: r.requiredPauseMinutes,
        pause_compliant: r.pauseCompliant,
        rest_hours_before: r.restHoursBefore,
        rest_compliant: r.restCompliant,
        tolerance_minutes: VERSPAETUNG_TOLERANZ_MINUTEN,
        updated_at: new Date().toISOString(),
    }));
    try {
        const { error } = await admin.from("shift_reports").upsert(rows, { onConflict: "time_entry_id" });
        if (error && istMigrationsFehler(error.code))
            return false;
        if (error) {
            console.warn("[schichtbericht] Konnte nicht gespeichert werden:", error.message);
            return false;
        }
        return true;
    }
    catch (err) {
        console.warn("[schichtbericht] Konnte nicht gespeichert werden:", err);
        return false;
    }
}
export async function recordShiftReportAfterCheckout(admin: Admin, facilityName: string, staffId: string): Promise<void> {
    if (!facilityName || !staffId)
        return;
    try {
        const { reports } = await evaluateShiftReports(admin, facilityName, { tage: 28, staffId });
        await persistShiftReports(admin, facilityName, reports);
    }
    catch (err) {
        console.warn("[schichtbericht] Neuberechnung nach Schichtende fehlgeschlagen:", err);
    }
}

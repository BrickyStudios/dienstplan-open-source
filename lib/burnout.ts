import type { SupabaseClient } from "@supabase/supabase-js";
import { isGermanHoliday } from "@/lib/holidays";
import { buildStaffDirectory, type StaffDirectory } from "@/lib/staff-identity";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO } from "@/lib/date";
import { MIN_REST_HOURS_ARBZG } from "@/lib/legal-limits";
type Admin = SupabaseClient<any>;
export const BURNOUT_WINDOW_DAYS = 28;
const MIN_REST_MINUTES = MIN_REST_HOURS_ARBZG * 60;
const SHORT_NOTICE_HOURS = 48;
const UEBLICHE_SERIE_TAGE = 5;
export type BurnoutBand = "stabil" | "erhoeht" | "kritisch";
export const BURNOUT_SCHWELLE_ERHOEHT = 30;
export const BURNOUT_SCHWELLE_KRITISCH = 60;
export type BurnoutFactorKey = "nacht" | "serientage" | "ruhezeit" | "ueberstunden" | "wochenende" | "rotation" | "pausen" | "einspringen";
type FactorDef = {
    key: BurnoutFactorKey;
    label: string;
    gewicht: number;
    referenz: number;
    einheit: string;
    erklaerung: string;
};
export const BURNOUT_FAKTOREN: readonly FactorDef[] = [
    {
        key: "nacht", label: "Nachtdienste", gewicht: 20, referenz: 8, einheit: "Dienste",
        erklaerung: "Nachtarbeit stört den Tag-Nacht-Rhythmus am stärksten. Ab 8 Nächten in 28 Tagen volle Punkte.",
    },
    {
        key: "serientage", label: "Dienste ohne freien Tag", gewicht: 18, referenz: 3, einheit: "Tage über 5",
        erklaerung: "Gezählt wird nur, was über eine übliche Fünf-Tage-Serie hinausgeht. 8 Tage am Stück = volle Punkte.",
    },
    {
        key: "ruhezeit", label: "Ruhezeit unter 11 h", gewicht: 16, referenz: 4, einheit: "Unterschreitungen",
        erklaerung: "§ 5 ArbZG verlangt 11 Stunden zwischen zwei Diensten. 4 Unterschreitungen in 28 Tagen = volle Punkte.",
    },
    {
        key: "ueberstunden", label: "Überstunden", gewicht: 14, referenz: 25, einheit: "% über Soll",
        erklaerung: "Gestempelte Zeit gegen die vertragliche Wochenzeit. 25 % Mehrarbeit im Fenster = volle Punkte.",
    },
    {
        key: "wochenende", label: "Wochenende und Feiertag", gewicht: 10, referenz: 8, einheit: "Punkte",
        erklaerung: "Wochenenddienst zählt 1, Feiertagsdienst 2. 8 Punkte in 28 Tagen = volle Punkte.",
    },
    {
        key: "rotation", label: "Schichtart-Wechsel", gewicht: 8, referenz: 8, einheit: "Wechsel",
        erklaerung: "Wechsel zwischen Früh, Spät und Nacht. Rückwärts (Nacht auf Spät auf Früh) zählt doppelt.",
    },
    {
        key: "pausen", label: "Pause unter Vorgabe", gewicht: 8, referenz: 5, einheit: "Dienste",
        erklaerung: "Dienste, in denen die Pflichtpause nach § 4 ArbZG nicht genommen wurde.",
    },
    {
        key: "einspringen", label: "Kurzfristig eingesprungen", gewicht: 6, referenz: 3, einheit: "Dienste",
        erklaerung: "Zuweisung weniger als 48 Stunden vor Dienstbeginn.",
    },
] as const;
export type BurnoutShift = {
    date: string;
    shiftType: string;
    startsAt: Date;
    endsAt: Date;
    workedMinutes: number | null;
    pauseMinutes: number | null;
    requiredPauseMinutes: number | null;
    shortNotice: boolean;
};
export type BurnoutInput = {
    staffId: string;
    shifts: BurnoutShift[];
    contractHoursPerWeek: number | null;
};
export type BurnoutFactorResult = {
    key: BurnoutFactorKey;
    label: string;
    wert: number;
    referenz: number;
    gewicht: number;
    punkte: number;
    einheit: string;
    erklaerung: string;
};
export type BurnoutMetrics = {
    totalShifts: number;
    nightShifts: number;
    weekendShifts: number;
    holidayShifts: number;
    maxConsecutiveDays: number;
    shortRestCount: number;
    overtimePct: number;
    rotationChanges: number;
    shortBreakShifts: number;
    shortNoticeShifts: number;
    workedMinutes: number;
};
export type BurnoutResult = {
    staffId: string;
    score: number;
    band: BurnoutBand;
    metrics: BurnoutMetrics;
    factors: BurnoutFactorResult[];
};
export function burnoutBand(score: number): BurnoutBand {
    if (score >= BURNOUT_SCHWELLE_KRITISCH)
        return "kritisch";
    if (score >= BURNOUT_SCHWELLE_ERHOEHT)
        return "erhoeht";
    return "stabil";
}
export function pflichtpauseMinuten(workedMinutes: number): number {
    if (workedMinutes > 9 * 60)
        return 45;
    if (workedMinutes > 6 * 60)
        return 30;
    return 0;
}
function istNacht(s: BurnoutShift): boolean {
    if (s.shiftType === "nacht")
        return true;
    const h = s.startsAt.getHours();
    return h >= 21 || h < 5;
}
function tagesSchluessel(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const t = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${t}`;
}
function rotationsKlasse(shiftType: string, startsAt: Date): "frueh" | "spaet" | "nacht" {
    if (shiftType === "nacht")
        return "nacht";
    if (shiftType === "frueh")
        return "frueh";
    if (shiftType === "spaet")
        return "spaet";
    const h = startsAt.getHours();
    if (h >= 21 || h < 5)
        return "nacht";
    if (h >= 14)
        return "spaet";
    return "frueh";
}
const ROTATION_ORDER: Record<"frueh" | "spaet" | "nacht", number> = { frueh: 0, spaet: 1, nacht: 2 };
export function computeBurnoutScore(input: BurnoutInput): BurnoutResult {
    const shifts = [...input.shifts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    let nightShifts = 0, weekendShifts = 0, holidayShifts = 0;
    let shortBreakShifts = 0, shortNoticeShifts = 0, workedMinutes = 0;
    for (const s of shifts) {
        if (istNacht(s))
            nightShifts++;
        const dow = s.startsAt.getDay();
        if (dow === 0 || dow === 6)
            weekendShifts++;
        if (isGermanHoliday(s.date))
            holidayShifts++;
        if (s.shortNotice)
            shortNoticeShifts++;
        if (s.workedMinutes != null)
            workedMinutes += s.workedMinutes;
        const soll = s.requiredPauseMinutes
            ?? (s.workedMinutes != null ? pflichtpauseMinuten(s.workedMinutes) : null);
        if (soll != null && soll > 0 && s.pauseMinutes != null && s.pauseMinutes < soll)
            shortBreakShifts++;
    }
    const tage = [...new Set(shifts.map(s => tagesSchluessel(s.startsAt)))].sort();
    let maxConsecutiveDays = 0, lauf = 0;
    let vorher: number | null = null;
    for (const tag of tage) {
        const ms = new Date(tag + "T00:00:00").getTime();
        lauf = vorher != null && Math.round((ms - vorher) / 86400000) === 1 ? lauf + 1 : 1;
        if (lauf > maxConsecutiveDays)
            maxConsecutiveDays = lauf;
        vorher = ms;
    }
    let shortRestCount = 0;
    for (let i = 0; i < shifts.length - 1; i++) {
        const pause = Math.floor((shifts[i + 1].startsAt.getTime() - shifts[i].endsAt.getTime()) / 60000);
        if (pause >= 0 && pause < MIN_REST_MINUTES)
            shortRestCount++;
    }
    let rotationChanges = 0;
    for (let i = 0; i < shifts.length - 1; i++) {
        const a = rotationsKlasse(shifts[i].shiftType, shifts[i].startsAt);
        const b = rotationsKlasse(shifts[i + 1].shiftType, shifts[i + 1].startsAt);
        if (a === b)
            continue;
        rotationChanges += ROTATION_ORDER[b] < ROTATION_ORDER[a] ? 2 : 1;
    }
    const sollMinuten = input.contractHoursPerWeek != null && input.contractHoursPerWeek > 0
        ? input.contractHoursPerWeek * 60 * (BURNOUT_WINDOW_DAYS / 7)
        : 0;
    const overtimePct = sollMinuten > 0 && workedMinutes > 0
        ? Math.max(0, Math.round((workedMinutes / sollMinuten - 1) * 100))
        : 0;
    const metrics: BurnoutMetrics = {
        totalShifts: shifts.length,
        nightShifts, weekendShifts, holidayShifts,
        maxConsecutiveDays, shortRestCount, overtimePct,
        rotationChanges, shortBreakShifts, shortNoticeShifts, workedMinutes,
    };
    const messwerte: Record<BurnoutFactorKey, number> = {
        nacht: nightShifts,
        serientage: Math.max(0, maxConsecutiveDays - UEBLICHE_SERIE_TAGE),
        ruhezeit: shortRestCount,
        ueberstunden: overtimePct,
        wochenende: weekendShifts + 2 * holidayShifts,
        rotation: rotationChanges,
        pausen: shortBreakShifts,
        einspringen: shortNoticeShifts,
    };
    const factors: BurnoutFactorResult[] = BURNOUT_FAKTOREN.map(def => {
        const wert = messwerte[def.key];
        const anteil = def.referenz > 0 ? Math.min(1, Math.max(0, wert / def.referenz)) : 0;
        return {
            key: def.key, label: def.label, wert, referenz: def.referenz,
            gewicht: def.gewicht, punkte: Math.round(anteil * def.gewicht * 10) / 10,
            einheit: def.einheit, erklaerung: def.erklaerung,
        };
    });
    const score = Math.min(100, Math.round(factors.reduce((s, f) => s + f.punkte, 0)));
    return { staffId: input.staffId, score, band: burnoutBand(score), metrics, factors };
}
export type ShiftRow = {
    id: string;
    date: string;
    shift_type: string;
    start_time?: string | null;
    end_time?: string | null;
};
export type AssignmentRow = {
    shift_id: string;
    staff_id?: string | null;
    staff_name?: string | null;
    status?: string | null;
    created_at?: string | null;
};
export type TimeEntryRow = {
    user_id: string;
    check_in: string;
    check_out: string | null;
    duration_minutes?: number | null;
    total_pause_minutes?: number | null;
    required_break_minutes?: number | null;
};
const FALLBACK_ZEITEN: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
export function planFenster(shift: ShiftRow): {
    start: Date;
    end: Date;
} | null {
    const fb = FALLBACK_ZEITEN[shift.shift_type] ?? FALLBACK_ZEITEN.frueh;
    const st = (shift.start_time || fb.start).slice(0, 5);
    const et = (shift.end_time || fb.end).slice(0, 5);
    const start = new Date(`${shift.date}T${st}:00`);
    const end = new Date(`${shift.date}T${et}:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
        return null;
    if (end.getTime() <= start.getTime())
        end.setDate(end.getDate() + 1);
    return { start, end };
}
export function buildBurnoutInputs(params: {
    shifts: ShiftRow[];
    assignments: AssignmentRow[];
    timeEntries: TimeEntryRow[];
    directory: StaffDirectory;
    contractHoursByStaffId: Map<string, number | null>;
}): BurnoutInput[] {
    const { shifts, assignments, timeEntries, directory, contractHoursByStaffId } = params;
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const proPerson = new Map<string, BurnoutShift[]>();
    for (const a of assignments) {
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
        const kurzfristig = a.created_at
            ? fenster.start.getTime() - new Date(a.created_at).getTime() < SHORT_NOTICE_HOURS * 3600000
            : false;
        const liste = proPerson.get(staffId) ?? [];
        liste.push({
            date: shift.date, shiftType: shift.shift_type,
            startsAt: fenster.start, endsAt: fenster.end,
            workedMinutes: null, pauseMinutes: null, requiredPauseMinutes: null,
            shortNotice: kurzfristig,
        });
        proPerson.set(staffId, liste);
    }
    for (const e of timeEntries) {
        if (!e.check_out)
            continue;
        const start = new Date(e.check_in);
        const end = new Date(e.check_out);
        if (isNaN(start.getTime()) || isNaN(end.getTime()))
            continue;
        const netto = e.duration_minutes ?? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
        const pause = e.total_pause_minutes ?? 0;
        const liste = proPerson.get(e.user_id) ?? [];
        let treffer: BurnoutShift | null = null;
        let bester = Infinity;
        for (const s of liste) {
            if (s.workedMinutes != null)
                continue;
            const abstand = Math.abs(s.startsAt.getTime() - start.getTime());
            if (abstand < bester && abstand <= 6 * 3600000) {
                bester = abstand;
                treffer = s;
            }
        }
        if (treffer) {
            treffer.startsAt = start;
            treffer.endsAt = end;
            treffer.workedMinutes = netto;
            treffer.pauseMinutes = pause;
            treffer.requiredPauseMinutes = e.required_break_minutes ?? pflichtpauseMinuten(netto);
        }
        else {
            liste.push({
                date: tagesSchluessel(start),
                shiftType: rotationsKlasse("", start),
                startsAt: start, endsAt: end,
                workedMinutes: netto, pauseMinutes: pause,
                requiredPauseMinutes: e.required_break_minutes ?? pflichtpauseMinuten(netto),
                shortNotice: false,
            });
        }
        proPerson.set(e.user_id, liste);
    }
    return [...proPerson.entries()].map(([staffId, shiftsOfStaff]) => ({
        staffId,
        shifts: shiftsOfStaff,
        contractHoursPerWeek: contractHoursByStaffId.get(staffId) ?? null,
    }));
}
export function istMigrationsFehler(code: string | undefined | null): boolean {
    return tabelleFehlt({ code }) || spalteFehlt({ code });
}
function tageZurueck(tage: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - tage);
    return d;
}
export type BurnoutAuswertung = {
    results: BurnoutResult[];
    nameById: Map<string, string>;
};
export async function evaluateFacilityBurnout(admin: Admin, facilityName: string): Promise<BurnoutAuswertung> {
    const von = tageZurueck(BURNOUT_WINDOW_DAYS);
    const vonTag = berlinTodayISO(von);
    const bisTag = berlinTodayISO();
    const [shiftsRes, profilesRes, staffRes] = await Promise.all([
        admin.from("shifts").select("id, date, shift_type, start_time, end_time")
            .eq("facility_name", facilityName).gte("date", vonTag).lte("date", bisTag),
        admin.from("user_profiles").select("id, full_name").eq("facility", facilityName),
        admin.from("facility_staff").select("id, full_name, max_hours_per_week").eq("facility_name", facilityName),
    ]);
    const shifts = (shiftsRes.data ?? []) as ShiftRow[];
    const staffRows = (staffRes.data ?? []) as {
        id: string;
        full_name: string | null;
        max_hours_per_week?: number | null;
    }[];
    const directory = buildStaffDirectory(staffRows, (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[]);
    const contractHoursByStaffId = new Map<string, number | null>();
    for (const row of staffRows) {
        if (!row.full_name)
            continue;
        const id = directory.idByName.get(row.full_name);
        if (id)
            contractHoursByStaffId.set(id, row.max_hours_per_week ?? null);
    }
    let assignments: AssignmentRow[] = [];
    if (shifts.length > 0) {
        const ids = shifts.map(s => s.id);
        const res = await admin.from("shift_assignments")
            .select("shift_id, staff_id, staff_name, status, created_at")
            .eq("facility_name", facilityName).in("shift_id", ids);
        if (res.error && istMigrationsFehler(res.error.code)) {
            const schlank = await admin.from("shift_assignments")
                .select("shift_id, staff_id, staff_name")
                .eq("facility_name", facilityName).in("shift_id", ids);
            assignments = (schlank.data ?? []) as AssignmentRow[];
        }
        else {
            assignments = (res.data ?? []) as AssignmentRow[];
        }
    }
    const teRes = await admin.from("time_entries")
        .select("user_id, check_in, check_out, duration_minutes, total_pause_minutes, required_break_minutes")
        .eq("facility", facilityName).not("check_out", "is", null).gte("check_in", von.toISOString());
    let timeEntries = (teRes.data ?? []) as TimeEntryRow[];
    if (teRes.error && istMigrationsFehler(teRes.error.code)) {
        const schlank = await admin.from("time_entries")
            .select("user_id, check_in, check_out, duration_minutes")
            .eq("facility", facilityName).not("check_out", "is", null).gte("check_in", von.toISOString());
        timeEntries = (schlank.data ?? []) as TimeEntryRow[];
    }
    const inputs = buildBurnoutInputs({ shifts, assignments, timeEntries, directory, contractHoursByStaffId });
    const results = inputs.map(computeBurnoutScore).sort((a, b) => b.score - a.score);
    return { results, nameById: directory.nameById };
}
export type BurnoutPersistTrigger = "checkout" | "ansicht";
export async function persistBurnoutScores(admin: Admin, facilityName: string, results: BurnoutResult[], trigger: BurnoutPersistTrigger): Promise<boolean> {
    if (results.length === 0)
        return true;
    const jetzt = new Date();
    const rows = results.map(r => ({
        facility_name: facilityName,
        staff_id: r.staffId,
        score_date: berlinTodayISO(jetzt),
        computed_at: jetzt.toISOString(),
        window_days: BURNOUT_WINDOW_DAYS,
        score: r.score,
        band: r.band,
        total_shifts: r.metrics.totalShifts,
        night_shifts: r.metrics.nightShifts,
        weekend_shifts: r.metrics.weekendShifts,
        holiday_shifts: r.metrics.holidayShifts,
        max_consecutive_days: r.metrics.maxConsecutiveDays,
        short_rest_count: r.metrics.shortRestCount,
        overtime_pct: r.metrics.overtimePct,
        rotation_changes: r.metrics.rotationChanges,
        short_break_shifts: r.metrics.shortBreakShifts,
        short_notice_shifts: r.metrics.shortNoticeShifts,
        factors: Object.fromEntries(r.factors.map(f => [f.key, f.punkte])),
        trigger_source: trigger,
    }));
    try {
        const { error } = await admin.from("burnout_scores")
            .upsert(rows, { onConflict: "facility_name,staff_id,score_date" });
        if (error && istMigrationsFehler(error.code))
            return false;
        if (error) {
            console.warn("[burnout] Score konnte nicht gespeichert werden:", error.message);
            return false;
        }
        return true;
    }
    catch (err) {
        console.warn("[burnout] Score konnte nicht gespeichert werden:", err);
        return false;
    }
}
export type BurnoutVerlaufPunkt = {
    date: string;
    avgScore: number;
    kritisch: number;
    erhoeht: number;
    stabil: number;
    staffCount: number;
};
export async function loadBurnoutVerlauf(admin: Admin, facilityName: string, tage = 84, staffId?: string): Promise<BurnoutVerlaufPunkt[]> {
    const von = berlinTodayISO(tageZurueck(tage));
    let q = admin.from("burnout_scores")
        .select("staff_id, score_date, score, band")
        .eq("facility_name", facilityName).gte("score_date", von)
        .order("score_date", { ascending: true });
    if (staffId)
        q = q.eq("staff_id", staffId);
    const { data, error } = await q;
    if (error || !data)
        return [];
    const proTag = new Map<string, {
        summe: number;
        n: number;
        kritisch: number;
        erhoeht: number;
        stabil: number;
    }>();
    for (const row of data as {
        score_date: string;
        score: number;
        band: string;
    }[]) {
        const eintrag = proTag.get(row.score_date) ?? { summe: 0, n: 0, kritisch: 0, erhoeht: 0, stabil: 0 };
        eintrag.summe += row.score;
        eintrag.n += 1;
        if (row.band === "kritisch")
            eintrag.kritisch++;
        else if (row.band === "erhoeht")
            eintrag.erhoeht++;
        else
            eintrag.stabil++;
        proTag.set(row.score_date, eintrag);
    }
    return [...proTag.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, e]) => ({
        date,
        avgScore: e.n > 0 ? Math.round(e.summe / e.n) : 0,
        kritisch: e.kritisch, erhoeht: e.erhoeht, stabil: e.stabil, staffCount: e.n,
    }));
}
export async function getBurnoutScore(admin: Admin, facilityName: string, staffId: string): Promise<{
    score: number;
    band: BurnoutBand;
    computedAt: string | null;
} | null> {
    if (!facilityName || !staffId)
        return null;
    try {
        const { data, error } = await admin.from("burnout_scores")
            .select("score, band, computed_at")
            .eq("facility_name", facilityName).eq("staff_id", staffId)
            .order("score_date", { ascending: false }).limit(1).maybeSingle();
        if (!error && data) {
            const row = data as {
                score: number;
                band: string;
                computed_at: string | null;
            };
            return { score: row.score, band: burnoutBand(row.score), computedAt: row.computed_at };
        }
        const { results } = await evaluateFacilityBurnout(admin, facilityName);
        const treffer = results.find(r => r.staffId === staffId);
        return treffer ? { score: treffer.score, band: treffer.band, computedAt: null } : null;
    }
    catch (err) {
        console.warn("[burnout] Score konnte nicht gelesen werden:", err);
        return null;
    }
}
export async function recalcBurnoutAfterShift(admin: Admin, facilityName: string): Promise<void> {
    if (!facilityName)
        return;
    try {
        const { results } = await evaluateFacilityBurnout(admin, facilityName);
        await persistBurnoutScores(admin, facilityName, results, "checkout");
    }
    catch (err) {
        console.warn("[burnout] Neuberechnung nach Schichtende fehlgeschlagen:", err);
    }
}

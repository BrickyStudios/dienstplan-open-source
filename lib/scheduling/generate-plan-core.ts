import { istArzt, istNichtPflegeStation, stationsdienst } from "@/lib/berufe";
import { bereitschaftZurDienstplanung, dienstplanungVon, passtZurDienstplanung, type Dienstplanung } from "@/lib/scheduling/dienstplanung";
import { addDaysISO, utcTagISO, zeitumstellungMinuten } from "@/lib/date";
import { MAX_HOURS_PER_SHIFT_ARBZG, MIN_REST_HOURS_ARBZG, MIN_REST_HOURS_VERKUERZT_ARBZG, minijobGrenze } from "@/lib/legal-limits";
export const SHIFT_PRIORITY: Record<string, number> = { nacht: 0, frueh: 1, spaet: 2 };
const OVERTIME_ELIGIBLE_TYPES = new Set(["Vollzeit", "Teilzeit", "Geringfügig"]);
const EINSPRING_MALUS = 15;
function stationsZugang(staff: {
    station: string | null;
    einsatzStationen: string[];
    stationsdienst?: boolean;
}, station: string, nichtPflege?: ReadonlySet<string>): "eigen" | "einspringen" | null {
    if (staff.stationsdienst === false && !istNichtPflegeStation(station, nichtPflege))
        return null;
    if (!staff.station || staff.station === station)
        return "eigen";
    return staff.einsatzStationen.includes(station) ? "einspringen" : null;
}
export function aufStationEinsetzbar(staff: {
    station: string | null;
    einsatzStationen: string[];
    stationsdienst?: boolean;
}, stationen: Set<string>, nichtPflege?: ReadonlySet<string>): boolean {
    return [...stationen].some(st => stationsZugang(staff, st, nichtPflege) !== null);
}
export function einsatzStationenVon(row: {
    einsatz_stationen?: unknown;
} | null | undefined): string[] {
    const v = row?.einsatz_stationen;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}
export const MAX_CONSECUTIVE_DAYS = 6;
export const MAX_SHIFTS_PER_WEEK = 6;
export const MAX_CONSECUTIVE_NIGHTS = 4;
export const MAX_HOURS_PER_SHIFT = MAX_HOURS_PER_SHIFT_ARBZG;
export const MIN_REST_HOURS = MIN_REST_HOURS_ARBZG;
export const ABSOLUTE_MIN_REST_HOURS = MIN_REST_HOURS_VERKUERZT_ARBZG;
export const BURNOUT_MAX_CONSECUTIVE_NIGHTS = 4;
export const WISH_BONUS_BASE = 18;
export const WISH_FAIRNESS_DECAY = 0.5;
export const WISH_AVOID_PENALTY = 25;
export const ROTATION_PENALTY = 6;
export const ROTATION_JUMP_PENALTY = 10;
export const NIGHT_SPREAD_PENALTY = 4;
export const WEEKEND_SPREAD_PENALTY = 3;
export const HOLIDAY_SPREAD_PENALTY = 5;
export const BURNOUT_SCORE_WEIGHT = 0.1;
export const BURNOUT_SCORE_MAX_PENALTY = 20;
const FALLBACK_SHIFT_TIMES: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
function easterSunday(year: number): {
    m: number;
    d: number;
} {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { m: month, d: day };
}
const holidayCache: Record<number, Set<string>> = {};
function germanHolidays(year: number): Set<string> {
    if (holidayCache[year])
        return holidayCache[year];
    const pad = (n: number) => String(n).padStart(2, "0");
    const es = easterSunday(year);
    const base = new Date(Date.UTC(year, es.m - 1, es.d));
    const off = (n: number) => {
        const x = new Date(base);
        x.setUTCDate(x.getUTCDate() + n);
        return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
    };
    const set = new Set<string>([
        `${year}-01-01`, `${year}-05-01`, `${year}-10-03`, `${year}-12-25`, `${year}-12-26`,
        off(-2), off(0), off(1), off(39), off(49), off(50), off(60),
    ]);
    holidayCache[year] = set;
    return set;
}
function isHoliday(dateStr: string): boolean {
    return germanHolidays(parseInt(dateStr.slice(0, 4), 10)).has(dateStr);
}
export function violatesRestTransition(prevType: string | null | undefined, currType: string): boolean {
    if (!prevType)
        return false;
    if (prevType === "nacht")
        return currType === "frueh" || currType === "spaet";
    if (prevType === "spaet" && currType === "frueh")
        return true;
    return false;
}
function isoPrevDay(date: string): string { return addDaysISO(date, -1); }
export function isoWeekKey(date: string): string {
    const d = new Date(date + "T00:00:00Z");
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow - 1));
    return utcTagISO(d);
}
function isoNextDay(date: string): string { return addDaysISO(date, 1); }
function consecutiveDaysBefore(byDate: Record<string, string> | undefined, date: string): number {
    if (!byDate)
        return 0;
    let count = 0;
    let cursor = isoPrevDay(date);
    while (byDate[cursor]) {
        count++;
        cursor = isoPrevDay(cursor);
    }
    return count;
}
function consecutiveDaysAfter(byDate: Record<string, string> | undefined, date: string): number {
    if (!byDate)
        return 0;
    let count = 0;
    let cursor = isoNextDay(date);
    while (byDate[cursor]) {
        count++;
        cursor = isoNextDay(cursor);
    }
    return count;
}
function consecutiveNightsBefore(byDate: Record<string, string> | undefined, date: string): number {
    if (!byDate)
        return 0;
    let count = 0;
    let cursor = isoPrevDay(date);
    while (byDate[cursor] === "nacht") {
        count++;
        cursor = isoPrevDay(cursor);
    }
    return count;
}
function isSunday(date: string): boolean {
    return new Date(date + "T00:00:00").getDay() === 0;
}
function isWeekend(date: string): boolean {
    const dow = new Date(date + "T00:00:00").getDay();
    return dow === 0 || dow === 6;
}
export function rotationPenaltyFor(prevType: string | null | undefined, currType: string): number {
    if (!prevType || prevType === currType)
        return 0;
    if (prevType === "frueh" && currType === "nacht")
        return ROTATION_JUMP_PENALTY;
    return ROTATION_PENALTY;
}
function restHoursBetween(prevType: string | null | undefined, curr: Pick<RawShift, "start_time" | "shift_type">): number | null {
    if (!prevType)
        return null;
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    const pf = FALLBACK_SHIFT_TIMES[prevType] ?? FALLBACK_SHIFT_TIMES.frueh;
    const cf = FALLBACK_SHIFT_TIMES[curr.shift_type] ?? FALLBACK_SHIFT_TIMES.frueh;
    const pStart = toMin(pf.start), pEnd = toMin(pf.end);
    const prevEndAbs = (pEnd <= pStart ? 1440 : 0) + pEnd;
    const currStartAbs = 1440 + toMin(curr.start_time || cf.start);
    return (currStartAbs - prevEndAbs) / 60;
}
export type StaffLimits = {
    maxShiftsPerWeek: number;
    maxConsecutiveDays: number;
    maxConsecutiveNights: number;
    maxHoursPerShift: number;
    minRestHours: number;
    breakAfterMinutes: number | null;
    breakMin: number | null;
    maxHolidayShiftsPerMonth: number | null;
    minDaysOffPerWeek: number | null;
    noSundayWork: boolean;
};
type StaffMember = StaffLimits & {
    id: string;
    full_name: string;
    active: boolean;
    station: string | null;
    einsatzStationen: string[];
    stationsdienst: boolean;
    arzt: boolean;
    dienstplanung: Dienstplanung;
    max_hours_per_week: number;
    job_type: string;
    hourly_rate: number | null;
    minijob_buffer_pct: number;
};
export type RawShift = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number;
    start_time: string | null;
    end_time: string | null;
};
export type RawFacilityStaff = {
    id: string;
    full_name: string;
    active: boolean;
    station?: string | null;
    max_hours_per_week: number;
    job_type: string;
    hourly_rate: number | null;
    minijob_buffer_pct: number;
    max_shifts_per_week?: number | null;
    max_consecutive_days?: number | null;
    max_consecutive_nights?: number | null;
    max_hours_per_shift?: number | null;
    min_rest_hours?: number | null;
    break_after_minutes?: number | null;
    break_min?: number | null;
    max_holiday_shifts_per_month?: number | null;
    min_days_off_per_week?: number | null;
    no_sunday_work?: boolean | null;
    einsatz_stationen?: string[] | null;
    role?: string | null;
    dienstplanung?: string | null;
};
export type ContractDefaults = {
    default_max_shifts_per_week?: number | null;
    default_max_consecutive_days?: number | null;
    default_max_consecutive_nights?: number | null;
    default_max_hours_per_shift?: number | null;
    default_min_rest_hours?: number | null;
    default_break_after_minutes?: number | null;
    default_break_min?: number | null;
    default_max_holiday_shifts_per_month?: number | null;
    default_min_days_off_per_week?: number | null;
};
export type RawProfile = {
    id: string;
    full_name: string;
    station: string | null;
    role?: string | null;
};
function profilPlanbar(p: RawProfile, imStamm: (p: RawProfile) => boolean): boolean {
    if (!p.role || p.role === "mitarbeiter")
        return true;
    return imStamm(p);
}
export type RawWish = {
    user_id: string | null;
    full_name: string;
    date_from: string | null;
    date_to: string | null;
    shift_type: string;
    wish_type: string;
    status: string;
};
export type RawNightEntry = {
    user_id: string;
    check_in: string;
    duration_minutes: number;
    total_pause_minutes: number;
};
export type RawAvailability = {
    staff_id: string;
    day_of_week: number;
    available: boolean;
    from_time: string | null;
    to_time: string | null;
};
export type RawAbsence = {
    staff_id: string;
    from: string;
    to: string;
    kind?: string;
};
export type RawBurnoutScore = {
    staff_id: string;
    score: number;
};
export type RawWishHistory = {
    staff_id: string;
    granted: number;
};
export type Assignment = {
    shift_id: string;
    shift_date: string;
    shift_type: string;
    station: string;
    staff_id: string;
    staff_name: string;
    score: number;
    reason: string;
    is_overtime?: boolean;
    understaffing_decision?: string;
    is_springer?: boolean;
};
export type UnfilledSlot = {
    shift_id: string;
    shift_date: string;
    shift_type: string;
    station: string;
    slots_needed: number;
    slots_filled: number;
    slots_missing: number;
    overtime_candidates: Array<{
        staff_id: string;
        staff_name: string;
        score: number;
        reason: string;
        is_springer?: boolean;
    }>;
};
export type UnderstaffingLogEntry = {
    shift_id: string;
    shift_date: string;
    shift_type: string;
    station: string;
    decision: string;
    staff_name?: string;
};
export type AlgorithmInput = {
    shifts: RawShift[];
    facilityStaff: RawFacilityStaff[];
    profiles: RawProfile[];
    wishes: RawWish[];
    nightEntries: RawNightEntry[];
    availability: RawAvailability[];
    settings: ({
        pause_threshold_minutes?: number | null;
        understaffing_mode?: string | null;
        overtime_limit_pct?: number | null;
        schedule_springer_enabled?: boolean | null;
    } & ContractDefaults) | null;
    stationFilter?: string;
    nichtPflegeStationen?: string[];
    priorAssignments?: Array<{
        staff_id: string;
        date: string;
        shift_type: string;
        hours?: number | null;
    }>;
    absences?: RawAbsence[];
    burnoutScores?: RawBurnoutScore[];
    wishHistory?: RawWishHistory[];
    aerzteSoll?: Record<string, Record<string, number>> | null;
    aerzteJeTag?: Partial<Record<string, Partial<Record<string, number>>>> | null;
};
export function arztPlaetze(aerzteSoll: AlgorithmInput["aerzteSoll"], shift: Pick<RawShift, "station" | "shift_type" | "planned_staff"> & {
    date?: string;
}, aerzteJeTag?: AlgorithmInput["aerzteJeTag"]): number | null {
    const je = aerzteSoll?.[shift.station];
    if (!je)
        return null;
    const dow = shift.date ? String(new Date(`${shift.date}T12:00:00Z`).getUTCDay()) : null;
    const n = Number((dow ? aerzteJeTag?.[dow]?.[shift.shift_type] : undefined) ?? je[shift.shift_type] ?? 0);
    return Math.max(0, Math.min(shift.planned_staff ?? 0, Number.isFinite(n) ? Math.floor(n) : 0));
}
export type SpringerAssignment = {
    date: string;
    staff_id: string;
    staff_name: string;
    shift_type: string | null;
};
export type ContractWarning = {
    staff_id: string;
    staff_name: string;
    rule: string;
    detail: string;
    date?: string;
};
export type AlgorithmResult = {
    assignments: Assignment[];
    springer_assignments: SpringerAssignment[];
    unfilled_slots: UnfilledSlot[];
    understaffing_log: UnderstaffingLogEntry[];
    understaffing_mode: string;
    contract_warnings: ContractWarning[];
    stats: {
        total_slots: number;
        filled: number;
        unfilled: number;
        staff_count: number;
        wish_count: number;
        burnout_warnings: (string | undefined)[];
        wishes_fulfilled: number;
        wishes_missed: number;
        absence_blocks: number;
    };
};
export function shiftHours(shift: Pick<RawShift, "start_time" | "end_time" | "shift_type"> & {
    date?: string | null;
}): number {
    if (shift.start_time && shift.end_time) {
        const [sh, sm] = shift.start_time.split(":").map(Number);
        const [eh, em] = shift.end_time.split(":").map(Number);
        const startMins = sh * 60 + (sm ?? 0);
        let endMins = eh * 60 + (em ?? 0);
        if (endMins <= startMins)
            endMins += 24 * 60;
        endMins += zeitumstellungMinuten(shift.date, shift.start_time, shift.end_time);
        return (endMins - startMins) / 60;
    }
    return shift.shift_type === "nacht" ? 9 : 8;
}
export function withinRange(date: string, from: string | null, to: string | null): boolean {
    if (!from && !to)
        return false;
    if (from && date < from)
        return false;
    if (to && date > to)
        return false;
    return true;
}
export type AbsenceIndex = Record<string, RawAbsence[]>;
export function buildAbsenceIndex(absences: RawAbsence[] | null | undefined): AbsenceIndex {
    const idx: AbsenceIndex = {};
    for (const a of absences ?? []) {
        if (!a?.staff_id || !a.from || !a.to)
            continue;
        const from = a.from <= a.to ? a.from : a.to;
        const to = a.from <= a.to ? a.to : a.from;
        (idx[a.staff_id] ??= []).push({ ...a, from, to });
    }
    return idx;
}
export function absenceOn(idx: AbsenceIndex, staffId: string, date: string): RawAbsence | null {
    const list = idx[staffId];
    if (!list)
        return null;
    for (const a of list)
        if (date >= a.from && date <= a.to)
            return a;
    return null;
}
export function effectiveWeeklyLimit(info: {
    max_hours_per_week: number;
    job_type: string;
    hourly_rate: number | null;
    minijob_buffer_pct: number;
}, jahr?: number): number {
    if (info.job_type === "Minijob" && info.hourly_rate && info.hourly_rate > 0) {
        const maxMonthly = minijobGrenze(jahr) / info.hourly_rate;
        const withBuffer = maxMonthly * (1 - info.minijob_buffer_pct / 100);
        return Math.floor(withBuffer / 4.33);
    }
    return info.max_hours_per_week;
}
function numOrNull(v: unknown): number | null {
    if (v == null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
export function extractContractDefaults(settings: ContractDefaults | null | undefined) {
    return {
        maxShiftsPerWeek: numOrNull(settings?.default_max_shifts_per_week),
        maxConsecutiveDays: numOrNull(settings?.default_max_consecutive_days),
        maxConsecutiveNights: numOrNull(settings?.default_max_consecutive_nights),
        maxHoursPerShift: numOrNull(settings?.default_max_hours_per_shift),
        minRestHours: numOrNull(settings?.default_min_rest_hours),
        breakAfterMinutes: numOrNull(settings?.default_break_after_minutes),
        breakMin: numOrNull(settings?.default_break_min),
        maxHolidayShiftsPerMonth: numOrNull(settings?.default_max_holiday_shifts_per_month),
        minDaysOffPerWeek: numOrNull(settings?.default_min_days_off_per_week),
    };
}
export type ResolvedDefaults = ReturnType<typeof extractContractDefaults>;
export function resolveStaffLimits(raw: RawFacilityStaff | undefined, d: ResolvedDefaults): StaffLimits {
    return {
        maxShiftsPerWeek: numOrNull(raw?.max_shifts_per_week) ?? d.maxShiftsPerWeek ?? Infinity,
        maxConsecutiveNights: numOrNull(raw?.max_consecutive_nights) ?? d.maxConsecutiveNights ?? BURNOUT_MAX_CONSECUTIVE_NIGHTS,
        maxHoursPerShift: numOrNull(raw?.max_hours_per_shift) ?? d.maxHoursPerShift ?? Infinity,
        maxConsecutiveDays: numOrNull(raw?.max_consecutive_days) ?? d.maxConsecutiveDays ?? MAX_CONSECUTIVE_DAYS,
        minRestHours: Math.max(numOrNull(raw?.min_rest_hours) ?? d.minRestHours ?? MIN_REST_HOURS, ABSOLUTE_MIN_REST_HOURS),
        breakAfterMinutes: numOrNull(raw?.break_after_minutes) ?? d.breakAfterMinutes,
        breakMin: numOrNull(raw?.break_min) ?? d.breakMin,
        maxHolidayShiftsPerMonth: numOrNull(raw?.max_holiday_shifts_per_month) ?? d.maxHolidayShiftsPerMonth,
        minDaysOffPerWeek: numOrNull(raw?.min_days_off_per_week) ?? d.minDaysOffPerWeek,
        noSundayWork: raw?.no_sunday_work === true,
    };
}
export function runSchedulingAlgorithm(input: AlgorithmInput): AlgorithmResult {
    const { shifts: rawShifts, facilityStaff, profiles, wishes, nightEntries, availability, settings, stationFilter } = input;
    const planJahr = Number(rawShifts[0]?.date?.slice(0, 4)) || undefined;
    const nichtPflege = new Set(input.nichtPflegeStationen ?? []);
    const pauseThreshold: number = settings?.pause_threshold_minutes ?? 20;
    const understaffingMode: string = settings?.understaffing_mode ?? "popup";
    const overtimeLimitPct: number = settings?.overtime_limit_pct ?? 20;
    const scheduleSpringer: boolean = Boolean(settings?.schedule_springer_enabled);
    const absenceIdx = buildAbsenceIndex(input.absences);
    let absenceBlocks = 0;
    const burnoutScoreById: Record<string, number> = {};
    for (const b of input.burnoutScores ?? []) {
        const n = Number(b?.score);
        if (b?.staff_id && Number.isFinite(n) && n > 0)
            burnoutScoreById[b.staff_id] = n;
    }
    const wishesGranted: Record<string, number> = {};
    for (const h of input.wishHistory ?? []) {
        const n = Number(h?.granted);
        if (h?.staff_id && Number.isFinite(n) && n > 0)
            wishesGranted[h.staff_id] = n;
    }
    const facilityStaffById: Record<string, {
        max_hours_per_week: number;
        job_type: string;
        hourly_rate: number | null;
        minijob_buffer_pct: number;
    }> = {};
    const rawStaffById: Record<string, RawFacilityStaff> = {};
    for (const s of facilityStaff ?? []) {
        facilityStaffById[s.id] = {
            max_hours_per_week: Number(s.max_hours_per_week) || 40,
            job_type: (s.job_type as string) || "Vollzeit",
            hourly_rate: s.hourly_rate != null ? Number(s.hourly_rate) : null,
            minijob_buffer_pct: Number(s.minijob_buffer_pct) || 15,
        };
        rawStaffById[s.id] = s;
    }
    const contractDefaults = extractContractDefaults(settings);
    const stationByName: Record<string, string> = {};
    for (const p of profiles ?? []) {
        if (p.full_name && p.station)
            stationByName[p.full_name] = p.station;
    }
    const staffByName = new Map<string, StaffMember>();
    for (const p of profiles ?? []) {
        if (!p.full_name)
            continue;
        if (!profilPlanbar(p, q => !!rawStaffById[q.id] || !!facilityStaff?.some(f => f.full_name === q.full_name)))
            continue;
        const info = facilityStaffById[p.id] ?? { max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 };
        staffByName.set(p.full_name, {
            id: p.id, full_name: p.full_name, active: true,
            station: p.station ?? null,
            einsatzStationen: einsatzStationenVon(rawStaffById[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name)),
            stationsdienst: stationsdienst((rawStaffById[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name))?.role),
            arzt: istArzt((rawStaffById[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name))?.role),
            dienstplanung: dienstplanungVon(rawStaffById[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name), p.role),
            max_hours_per_week: effectiveWeeklyLimit(info, planJahr),
            job_type: info.job_type, hourly_rate: info.hourly_rate, minijob_buffer_pct: info.minijob_buffer_pct,
            ...resolveStaffLimits(rawStaffById[p.id], contractDefaults),
        });
    }
    for (const s of facilityStaff ?? []) {
        if (!s.full_name || staffByName.has(s.full_name))
            continue;
        const info = facilityStaffById[s.id] ?? { max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 };
        staffByName.set(s.full_name, {
            id: s.id, full_name: s.full_name, active: s.active ?? true,
            station: stationByName[s.full_name] ?? (s.station ?? null),
            einsatzStationen: einsatzStationenVon(s),
            stationsdienst: stationsdienst(s.role),
            arzt: istArzt(s.role),
            dienstplanung: dienstplanungVon(s),
            max_hours_per_week: effectiveWeeklyLimit(info, planJahr),
            job_type: info.job_type, hourly_rate: info.hourly_rate, minijob_buffer_pct: info.minijob_buffer_pct,
            ...resolveStaffLimits(rawStaffById[s.id], contractDefaults),
        });
    }
    const staffList: StaffMember[] = Array.from(staffByName.values());
    const availMap: Record<string, Record<number, RawAvailability>> = {};
    for (const row of availability ?? []) {
        if (!availMap[row.staff_id])
            availMap[row.staff_id] = {};
        availMap[row.staff_id][row.day_of_week] = row;
    }
    const nightCounts: Record<string, number> = {};
    const netMinutesWorked: Record<string, number> = {};
    const lowPauseShifts: Record<string, number> = {};
    for (const entry of nightEntries ?? []) {
        const uid = entry.user_id;
        const h = new Date(entry.check_in).getHours();
        if (h >= 22 || h < 6)
            nightCounts[uid] = (nightCounts[uid] ?? 0) + 1;
        const dur = entry.duration_minutes ?? 0;
        const pauseMins = entry.total_pause_minutes ?? 0;
        netMinutesWorked[uid] = (netMinutesWorked[uid] ?? 0) + Math.max(0, dur - pauseMins);
        if (dur >= 360 && pauseMins < pauseThreshold)
            lowPauseShifts[uid] = (lowPauseShifts[uid] ?? 0) + 1;
    }
    const shiftsAll: RawShift[] = (rawShifts ?? []).slice().sort((a, b) => {
        if (a.date !== b.date)
            return a.date.localeCompare(b.date);
        return (SHIFT_PRIORITY[a.shift_type] ?? 9) - (SHIFT_PRIORITY[b.shift_type] ?? 9);
    });
    const shifts = stationFilter ? shiftsAll.filter(s => s.station === stationFilter) : shiftsAll;
    const assignedByDay: Record<string, Record<string, string>> = {};
    const shiftsThisWeek: Record<string, number> = {};
    const hoursThisWeek: Record<string, number> = {};
    const wkKey = (staffId: string, date: string) => staffId + "|" + isoWeekKey(date);
    const nightsInRun: Record<string, number> = {};
    const weekendInRun: Record<string, number> = {};
    const holidayInRun: Record<string, number> = {};
    const zaehleDienst = (staffId: string, date: string, shiftType: string) => {
        if (shiftType === "nacht")
            nightsInRun[staffId] = (nightsInRun[staffId] ?? 0) + 1;
        if (isWeekend(date))
            weekendInRun[staffId] = (weekendInRun[staffId] ?? 0) + 1;
        if (isHoliday(date))
            holidayInRun[staffId] = (holidayInRun[staffId] ?? 0) + 1;
    };
    for (const pa of input.priorAssignments ?? []) {
        if (!pa.staff_id || !pa.date)
            continue;
        if (!assignedByDay[pa.staff_id])
            assignedByDay[pa.staff_id] = {};
        const existing = assignedByDay[pa.staff_id][pa.date];
        if (!existing || pa.shift_type === "nacht")
            assignedByDay[pa.staff_id][pa.date] = pa.shift_type;
        const h = pa.hours ?? (pa.shift_type === "nacht" ? 9 : 8);
        const k = wkKey(pa.staff_id, pa.date);
        hoursThisWeek[k] = (hoursThisWeek[k] ?? 0) + h;
        shiftsThisWeek[k] = (shiftsThisWeek[k] ?? 0) + 1;
        zaehleDienst(pa.staff_id, pa.date, pa.shift_type);
    }
    const assignedCountByShift: Record<string, number> = {};
    const assignedArztByShift: Record<string, number> = {};
    const freiFuer = (shift: RawShift, arzt: boolean): number => {
        const needed = shift.planned_staff ?? 1;
        const gesamt = needed - (assignedCountByShift[shift.id] ?? 0);
        const aerzte = arztPlaetze(input.aerzteSoll, shift, input.aerzteJeTag);
        if (aerzte === null)
            return gesamt;
        const davonArzt = assignedArztByShift[shift.id] ?? 0;
        const frei = arzt ? aerzte - davonArzt : (needed - aerzte) - ((assignedCountByShift[shift.id] ?? 0) - davonArzt);
        return Math.max(0, Math.min(gesamt, frei));
    };
    const assignments: Assignment[] = [];
    const einspringPaesse = !stationFilter && staffList.some(st => st.einsatzStationen.length > 0) ? [false, true] : [false];
    for (const einspringen of einspringPaesse)
        for (const shift of shifts) {
            const needed = shift.planned_staff ?? 1;
            if (needed <= 0)
                continue;
            const offen = needed - (assignedCountByShift[shift.id] ?? 0);
            if (offen <= 0)
                continue;
            const shiftH = shiftHours(shift);
            const candidates: Array<{
                staff: StaffMember;
                score: number;
                reason: string;
                fulfillsWish: boolean;
            }> = [];
            for (const staff of staffList) {
                if (assignedByDay[staff.id]?.[shift.date])
                    continue;
                if (stationsZugang(staff, shift.station, nichtPflege) !== (einspringen ? "einspringen" : "eigen"))
                    continue;
                if (freiFuer(shift, staff.arzt) <= 0)
                    continue;
                if (absenceOn(absenceIdx, staff.id, shift.date)) {
                    absenceBlocks++;
                    continue;
                }
                if (staff.noSundayWork && isSunday(shift.date))
                    continue;
                if (!passtZurDienstplanung(staff.dienstplanung, shift.date, shift.shift_type))
                    continue;
                if (shiftH > staff.maxHoursPerShift)
                    continue;
                if ((shiftsThisWeek[wkKey(staff.id, shift.date)] ?? 0) >= staff.maxShiftsPerWeek)
                    continue;
                const usedH = hoursThisWeek[wkKey(staff.id, shift.date)] ?? 0;
                if (usedH + shiftH > staff.max_hours_per_week)
                    continue;
                const shiftDow = new Date(shift.date + "T00:00:00").getDay();
                const dowKey = shiftDow === 0 ? 7 : shiftDow;
                const avail = availMap[staff.id]?.[dowKey];
                if (avail !== undefined) {
                    if (!avail.available)
                        continue;
                    if (avail.from_time && shift.start_time && shift.start_time < avail.from_time)
                        continue;
                    if (avail.to_time && shift.end_time && shift.end_time > avail.to_time)
                        continue;
                }
                const isUnavailable = (wishes ?? []).some(w => w.wish_type === "unavailable" &&
                    w.status !== "abgelehnt" &&
                    (w.user_id === staff.id || w.full_name === staff.full_name) &&
                    withinRange(shift.date, w.date_from, w.date_to) &&
                    (w.shift_type === "all" || w.shift_type === shift.shift_type));
                if (isUnavailable)
                    continue;
                const prevTypeMain = assignedByDay[staff.id]?.[isoPrevDay(shift.date)];
                if (violatesRestTransition(prevTypeMain, shift.shift_type))
                    continue;
                const restHMain = restHoursBetween(prevTypeMain, shift);
                if (restHMain !== null && restHMain < staff.minRestHours)
                    continue;
                if (consecutiveDaysBefore(assignedByDay[staff.id], shift.date) >= staff.maxConsecutiveDays)
                    continue;
                if (shift.shift_type === "nacht" && consecutiveNightsBefore(assignedByDay[staff.id], shift.date) >= staff.maxConsecutiveNights)
                    continue;
                let score = 50;
                const reasons: string[] = einspringen ? [`Springt von ${staff.station} ein`] : [];
                const hasPreference = (wishes ?? []).some(w => w.wish_type === "preference" &&
                    w.status !== "abgelehnt" &&
                    (w.user_id === staff.id || w.full_name === staff.full_name) &&
                    withinRange(shift.date, w.date_from, w.date_to) &&
                    (w.shift_type === "all" || w.shift_type === shift.shift_type));
                if (hasPreference) {
                    const bonus = WISH_BONUS_BASE / (1 + WISH_FAIRNESS_DECAY * (wishesGranted[staff.id] ?? 0));
                    score += bonus;
                    reasons.push("Wunsch");
                }
                const hasAvoid = (wishes ?? []).some(w => w.wish_type === "avoid" &&
                    w.status !== "abgelehnt" &&
                    (w.user_id === staff.id || w.full_name === staff.full_name) &&
                    withinRange(shift.date, w.date_from, w.date_to) &&
                    (w.shift_type === "all" || w.shift_type === shift.shift_type));
                if (hasAvoid) {
                    score -= WISH_AVOID_PENALTY;
                    reasons.push("Möchte vermeiden");
                }
                const rot = rotationPenaltyFor(prevTypeMain, shift.shift_type);
                if (rot > 0) {
                    score -= rot;
                    reasons.push("Schichtwechsel zum Vortag");
                }
                const nightsRun = nightsInRun[staff.id] ?? 0;
                if (shift.shift_type === "nacht" && nightsRun > 0) {
                    score -= nightsRun * NIGHT_SPREAD_PENALTY;
                    reasons.push(`${nightsRun}× Nacht im Plan`);
                }
                const weekendRun = weekendInRun[staff.id] ?? 0;
                if (isWeekend(shift.date) && weekendRun > 0) {
                    score -= weekendRun * WEEKEND_SPREAD_PENALTY;
                    reasons.push(`${weekendRun}× Wochenende im Plan`);
                }
                const holidayRun = holidayInRun[staff.id] ?? 0;
                if (isHoliday(shift.date) && holidayRun > 0) {
                    score -= holidayRun * HOLIDAY_SPREAD_PENALTY;
                    reasons.push(`${holidayRun}× Feiertag im Plan`);
                }
                const bScore = burnoutScoreById[staff.id] ?? 0;
                if (bScore > 0) {
                    const malus = Math.min(bScore * BURNOUT_SCORE_WEIGHT, BURNOUT_SCORE_MAX_PENALTY);
                    score -= malus;
                    if (malus >= 5)
                        reasons.push(`Belastungsscore ${Math.round(bScore)}`);
                }
                const nights = nightCounts[staff.id] ?? 0;
                if (nights > 0 && shift.shift_type === "nacht") {
                    score -= nights * 2;
                    if (nights >= 3)
                        reasons.push(`${nights}× Nacht letzte Wochen`);
                }
                const netHours = (netMinutesWorked[staff.id] ?? 0) / 60;
                if (netHours > 160) {
                    score -= Math.floor((netHours - 160) / 40) * 3;
                    reasons.push(`${Math.round(netHours)}h Nettostunden (4 Wo.)`);
                }
                const inadequatePauses = lowPauseShifts[staff.id] ?? 0;
                if (inadequatePauses >= 2) {
                    score -= inadequatePauses * 2;
                    reasons.push(`${inadequatePauses}× Pause <${pauseThreshold} Min`);
                }
                const usedHours = hoursThisWeek[wkKey(staff.id, shift.date)] ?? 0;
                const limitRatio = usedHours / staff.max_hours_per_week;
                if (limitRatio > 0.75) {
                    score -= Math.round((limitRatio - 0.75) * 20);
                    reasons.push(`${Math.round(usedHours)}/${staff.max_hours_per_week}h (${staff.job_type})`);
                }
                score -= (shiftsThisWeek[wkKey(staff.id, shift.date)] ?? 0) * 2;
                score += (staff.full_name.charCodeAt(0) % 10) * 0.1;
                candidates.push({ staff, score, reason: reasons.join(", ") || "Verfügbar", fulfillsWish: hasPreference });
            }
            candidates.sort((a, b) => b.score - a.score);
            for (const { staff, score, reason, fulfillsWish } of candidates) {
                if ((assignedCountByShift[shift.id] ?? 0) >= needed)
                    break;
                if (freiFuer(shift, staff.arzt) <= 0)
                    continue;
                assignments.push({
                    shift_id: shift.id, shift_date: shift.date, shift_type: shift.shift_type,
                    station: shift.station, staff_id: staff.id, staff_name: staff.full_name,
                    score: Math.round(score), reason,
                    ...(einspringen ? { is_springer: true } : {}),
                });
                if (!assignedByDay[staff.id])
                    assignedByDay[staff.id] = {};
                assignedByDay[staff.id][shift.date] = shift.shift_type;
                shiftsThisWeek[wkKey(staff.id, shift.date)] = (shiftsThisWeek[wkKey(staff.id, shift.date)] ?? 0) + 1;
                hoursThisWeek[wkKey(staff.id, shift.date)] = (hoursThisWeek[wkKey(staff.id, shift.date)] ?? 0) + shiftH;
                assignedCountByShift[shift.id] = (assignedCountByShift[shift.id] ?? 0) + 1;
                if (staff.arzt)
                    assignedArztByShift[shift.id] = (assignedArztByShift[shift.id] ?? 0) + 1;
                zaehleDienst(staff.id, shift.date, shift.shift_type);
                if (fulfillsWish)
                    wishesGranted[staff.id] = (wishesGranted[staff.id] ?? 0) + 1;
            }
        }
    const unfilledSlots: UnfilledSlot[] = [];
    const understaffingLog: UnderstaffingLogEntry[] = [];
    const overtimeLimit = overtimeLimitPct / 100;
    for (const shift of shifts) {
        const needed = shift.planned_staff ?? 1;
        if (needed <= 0)
            continue;
        const filled = assignedCountByShift[shift.id] ?? 0;
        if (filled >= needed)
            continue;
        const missing = needed - filled;
        const shiftH = shiftHours(shift);
        const overtimeCandidates: Array<{
            staff_id: string;
            staff_name: string;
            score: number;
            reason: string;
            is_springer?: boolean;
            arzt: boolean;
        }> = [];
        for (const staff of staffList) {
            if (assignedByDay[staff.id]?.[shift.date])
                continue;
            if (freiFuer(shift, staff.arzt) <= 0)
                continue;
            const zugangOt = stationsZugang(staff, shift.station, nichtPflege);
            if (!zugangOt || (zugangOt === "einspringen" && stationFilter))
                continue;
            if (!OVERTIME_ELIGIBLE_TYPES.has(staff.job_type))
                continue;
            if (absenceOn(absenceIdx, staff.id, shift.date)) {
                absenceBlocks++;
                continue;
            }
            if (staff.noSundayWork && isSunday(shift.date))
                continue;
            if (!passtZurDienstplanung(staff.dienstplanung, shift.date, shift.shift_type))
                continue;
            if (shiftH > staff.maxHoursPerShift)
                continue;
            if ((shiftsThisWeek[wkKey(staff.id, shift.date)] ?? 0) >= staff.maxShiftsPerWeek)
                continue;
            const shiftDow = new Date(shift.date + "T00:00:00").getDay();
            const dowKey = shiftDow === 0 ? 7 : shiftDow;
            const avail = availMap[staff.id]?.[dowKey];
            if (avail !== undefined) {
                if (!avail.available)
                    continue;
                if (avail.from_time && shift.start_time && shift.start_time < avail.from_time)
                    continue;
                if (avail.to_time && shift.end_time && shift.end_time > avail.to_time)
                    continue;
            }
            const isUnavailable = (wishes ?? []).some(w => w.wish_type === "unavailable" &&
                w.status !== "abgelehnt" &&
                (w.user_id === staff.id || w.full_name === staff.full_name) &&
                withinRange(shift.date, w.date_from, w.date_to) &&
                (w.shift_type === "all" || w.shift_type === shift.shift_type));
            if (isUnavailable)
                continue;
            const prevTypeOt = assignedByDay[staff.id]?.[isoPrevDay(shift.date)];
            const nextTypeOt = assignedByDay[staff.id]?.[isoNextDay(shift.date)];
            if (violatesRestTransition(prevTypeOt, shift.shift_type))
                continue;
            if (violatesRestTransition(shift.shift_type, nextTypeOt))
                continue;
            const restHOt = restHoursBetween(prevTypeOt, shift);
            if (restHOt !== null && restHOt < staff.minRestHours)
                continue;
            if (nextTypeOt) {
                const restHNext = restHoursBetween(shift.shift_type, { start_time: null, shift_type: nextTypeOt });
                if (restHNext !== null && restHNext < staff.minRestHours)
                    continue;
            }
            if (shift.shift_type === "nacht" && consecutiveNightsBefore(assignedByDay[staff.id], shift.date) >= staff.maxConsecutiveNights)
                continue;
            const runBefore = consecutiveDaysBefore(assignedByDay[staff.id], shift.date);
            const runAfter = consecutiveDaysAfter(assignedByDay[staff.id], shift.date);
            if (runBefore + 1 + runAfter > staff.maxConsecutiveDays)
                continue;
            const usedH = hoursThisWeek[wkKey(staff.id, shift.date)] ?? 0;
            if (usedH + shiftH > staff.max_hours_per_week * (1 + overtimeLimit))
                continue;
            let score = 50;
            const reasons = ["Überstunden"];
            if (zugangOt === "einspringen") {
                score -= EINSPRING_MALUS;
                reasons.push(`springt von ${staff.station} ein`);
            }
            const hasPreference = (wishes ?? []).some(w => w.wish_type === "preference" &&
                w.status !== "abgelehnt" &&
                (w.user_id === staff.id || w.full_name === staff.full_name) &&
                withinRange(shift.date, w.date_from, w.date_to) &&
                (w.shift_type === "all" || w.shift_type === shift.shift_type));
            if (hasPreference) {
                score += WISH_BONUS_BASE / (1 + WISH_FAIRNESS_DECAY * (wishesGranted[staff.id] ?? 0));
                reasons.push("Wunsch");
            }
            const hasAvoidOt = (wishes ?? []).some(w => w.wish_type === "avoid" && w.status !== "abgelehnt" &&
                (w.user_id === staff.id || w.full_name === staff.full_name) &&
                withinRange(shift.date, w.date_from, w.date_to) &&
                (w.shift_type === "all" || w.shift_type === shift.shift_type));
            if (hasAvoidOt) {
                score -= WISH_AVOID_PENALTY;
                reasons.push("Möchte vermeiden");
            }
            const rotOt = rotationPenaltyFor(prevTypeOt, shift.shift_type);
            if (rotOt > 0)
                score -= rotOt;
            if (shift.shift_type === "nacht")
                score -= (nightsInRun[staff.id] ?? 0) * NIGHT_SPREAD_PENALTY;
            if (isWeekend(shift.date))
                score -= (weekendInRun[staff.id] ?? 0) * WEEKEND_SPREAD_PENALTY;
            if (isHoliday(shift.date))
                score -= (holidayInRun[staff.id] ?? 0) * HOLIDAY_SPREAD_PENALTY;
            const bScoreOt = burnoutScoreById[staff.id] ?? 0;
            if (bScoreOt > 0)
                score -= Math.min(bScoreOt * BURNOUT_SCORE_WEIGHT, BURNOUT_SCORE_MAX_PENALTY);
            const nights = nightCounts[staff.id] ?? 0;
            if (nights > 0 && shift.shift_type === "nacht")
                score -= nights * 2;
            const netHours = (netMinutesWorked[staff.id] ?? 0) / 60;
            if (netHours > 160)
                score -= Math.floor((netHours - 160) / 40) * 3;
            score += (staff.full_name.charCodeAt(0) % 10) * 0.1;
            overtimeCandidates.push({
                staff_id: staff.id, staff_name: staff.full_name, score: Math.round(score), reason: reasons.join(", "),
                arzt: staff.arzt,
                ...(zugangOt === "einspringen" ? { is_springer: true } : {}),
            });
        }
        overtimeCandidates.sort((a, b) => b.score - a.score);
        if (understaffingMode === "auto") {
            const reihe = [...overtimeCandidates];
            for (let i = 0; i < missing; i++) {
                const idx = reihe.findIndex(c => freiFuer(shift, c.arzt) > 0);
                const candidate = idx >= 0 ? reihe.splice(idx, 1)[0] : undefined;
                if (candidate) {
                    assignments.push({
                        shift_id: shift.id, shift_date: shift.date, shift_type: shift.shift_type,
                        station: shift.station, staff_id: candidate.staff_id, staff_name: candidate.staff_name,
                        score: candidate.score, reason: candidate.reason,
                        is_overtime: true, understaffing_decision: "overtime",
                        ...(candidate.is_springer ? { is_springer: true } : {}),
                    });
                    if (!assignedByDay[candidate.staff_id])
                        assignedByDay[candidate.staff_id] = {};
                    assignedByDay[candidate.staff_id][shift.date] = shift.shift_type;
                    shiftsThisWeek[wkKey(candidate.staff_id, shift.date)] = (shiftsThisWeek[wkKey(candidate.staff_id, shift.date)] ?? 0) + 1;
                    hoursThisWeek[wkKey(candidate.staff_id, shift.date)] = (hoursThisWeek[wkKey(candidate.staff_id, shift.date)] ?? 0) + shiftH;
                    assignedCountByShift[shift.id] = (assignedCountByShift[shift.id] ?? 0) + 1;
                    if (candidate.arzt)
                        assignedArztByShift[shift.id] = (assignedArztByShift[shift.id] ?? 0) + 1;
                    zaehleDienst(candidate.staff_id, shift.date, shift.shift_type);
                    understaffingLog.push({ shift_id: shift.id, shift_date: shift.date, shift_type: shift.shift_type, station: shift.station, decision: "overtime", staff_name: candidate.staff_name });
                }
                else {
                    understaffingLog.push({ shift_id: shift.id, shift_date: shift.date, shift_type: shift.shift_type, station: shift.station, decision: "understaffed" });
                }
            }
        }
        else {
            unfilledSlots.push({
                shift_id: shift.id, shift_date: shift.date, shift_type: shift.shift_type, station: shift.station,
                slots_needed: needed, slots_filled: filled, slots_missing: missing,
                overtime_candidates: overtimeCandidates.slice(0, 5).map(c => ({
                    staff_id: c.staff_id, staff_name: c.staff_name, score: c.score, reason: c.reason,
                    ...(c.is_springer ? { is_springer: true } : {}),
                })),
            });
        }
    }
    const springerAssignments: SpringerAssignment[] = [];
    if (scheduleSpringer) {
        const springerCount: Record<string, number> = {};
        const dates = [...new Set(shifts.map(s => s.date))].sort();
        const stationenImPlan = new Set(shifts.map(s => s.station));
        for (const date of dates) {
            const shiftDow = new Date(date + "T00:00:00").getDay();
            const dowKey = shiftDow === 0 ? 7 : shiftDow;
            const eligible = staffList.filter(staff => {
                if (!aufStationEinsetzbar(staff, stationenImPlan, nichtPflege))
                    return false;
                if (assignedByDay[staff.id]?.[date])
                    return false;
                if (absenceOn(absenceIdx, staff.id, date))
                    return false;
                if (staff.noSundayWork && isSunday(date))
                    return false;
                if (!bereitschaftZurDienstplanung(staff.dienstplanung))
                    return false;
                const avail = availMap[staff.id]?.[dowKey];
                if (avail !== undefined && !avail.available)
                    return false;
                const isUnavailable = (wishes ?? []).some(w => w.wish_type === "unavailable" &&
                    w.status !== "abgelehnt" &&
                    (w.user_id === staff.id || w.full_name === staff.full_name) &&
                    withinRange(date, w.date_from, w.date_to));
                return !isUnavailable;
            });
            if (eligible.length === 0)
                continue;
            eligible.sort((a, b) => (springerCount[a.id] ?? 0) - (springerCount[b.id] ?? 0) ||
                (hoursThisWeek[wkKey(a.id, date)] ?? 0) - (hoursThisWeek[wkKey(b.id, date)] ?? 0) ||
                a.full_name.localeCompare(b.full_name));
            const pick = eligible[0];
            springerAssignments.push({ date, staff_id: pick.id, staff_name: pick.full_name, shift_type: null });
            springerCount[pick.id] = (springerCount[pick.id] ?? 0) + 1;
        }
    }
    const contractWarnings: ContractWarning[] = [];
    const shiftById: Record<string, RawShift> = {};
    for (const sh of shifts)
        shiftById[sh.id] = sh;
    const assignmentsByStaff: Record<string, Assignment[]> = {};
    for (const a of assignments)
        (assignmentsByStaff[a.staff_id] ??= []).push(a);
    for (const staff of staffList) {
        const list = assignmentsByStaff[staff.id];
        if (!list || list.length === 0)
            continue;
        if (staff.maxHolidayShiftsPerMonth != null) {
            const holidaysPerMonth: Record<string, number> = {};
            for (const a of list) {
                if (isHoliday(a.shift_date))
                    holidaysPerMonth[a.shift_date.slice(0, 7)] = (holidaysPerMonth[a.shift_date.slice(0, 7)] ?? 0) + 1;
            }
            for (const [mk, n] of Object.entries(holidaysPerMonth)) {
                if (n > staff.maxHolidayShiftsPerMonth) {
                    contractWarnings.push({ staff_id: staff.id, staff_name: staff.full_name, rule: "max_holiday_shifts_per_month",
                        detail: `${n} Feiertagsschichten im Monat ${mk} (vertraglich max. ${staff.maxHolidayShiftsPerMonth})` });
                }
            }
        }
        if (staff.minDaysOffPerWeek != null) {
            const datesPerWeek: Record<string, Set<string>> = {};
            for (const a of list)
                (datesPerWeek[isoWeekKey(a.shift_date)] ??= new Set()).add(a.shift_date);
            for (const [wk, dates] of Object.entries(datesPerWeek)) {
                const off = 7 - dates.size;
                if (off < staff.minDaysOffPerWeek) {
                    contractWarnings.push({ staff_id: staff.id, staff_name: staff.full_name, rule: "min_days_off_per_week",
                        detail: `nur ${off} freie Tage in der Woche ab ${wk} (vertraglich min. ${staff.minDaysOffPerWeek})` });
                }
            }
        }
        if (staff.breakAfterMinutes != null && (staff.breakMin == null || staff.breakMin <= 0)) {
            const hit = list.find(a => { const sh = shiftById[a.shift_id]; return sh && shiftHours(sh) * 60 >= staff.breakAfterMinutes!; });
            if (hit) {
                contractWarnings.push({ staff_id: staff.id, staff_name: staff.full_name, rule: "break", date: hit.shift_date,
                    detail: `Schicht ab ${staff.breakAfterMinutes} Min Pause fällig — keine Pausenlänge hinterlegt` });
            }
        }
        const byDate: Record<string, string> = {};
        for (const a of list)
            byDate[a.shift_date] = a.shift_type;
        let rotations = 0;
        for (const [d, t] of Object.entries(byDate)) {
            const prev = byDate[isoPrevDay(d)];
            if (prev && rotationPenaltyFor(prev, t) > 0)
                rotations++;
        }
        if (rotations >= 2) {
            contractWarnings.push({ staff_id: staff.id, staff_name: staff.full_name, rule: "rotation",
                detail: `${rotations}× Schichtart-Wechsel an aufeinanderfolgenden Tagen (Rotationsstress)` });
        }
    }
    const staffById = new Map(staffList.map(s => [s.id, s]));
    const staffByFullName = new Map(staffList.map(s => [s.full_name, s]));
    const planFrom = shifts.length ? shifts[0].date : null;
    const planTo = shifts.length ? shifts.reduce((m, s) => (s.date > m ? s.date : m), shifts[0].date) : null;
    let wishesFulfilled = 0;
    let wishesMissed = 0;
    if (planFrom && planTo) {
        for (const w of wishes ?? []) {
            if (w.wish_type !== "preference" || w.status === "abgelehnt")
                continue;
            const person = (w.user_id ? staffById.get(w.user_id) : undefined) ?? staffByFullName.get(w.full_name);
            if (!person)
                continue;
            const from = w.date_from ?? planFrom;
            const to = w.date_to ?? planTo;
            if (to < planFrom || from > planTo)
                continue;
            const getroffen = (assignmentsByStaff[person.id] ?? []).some(a => withinRange(a.shift_date, w.date_from, w.date_to) &&
                (w.shift_type === "all" || w.shift_type === a.shift_type));
            if (getroffen) {
                wishesFulfilled++;
                continue;
            }
            wishesMissed++;
            const zeitraum = w.date_from && w.date_to && w.date_from !== w.date_to
                ? `${w.date_from} bis ${w.date_to}` : (w.date_from ?? w.date_to ?? "Zeitraum offen");
            contractWarnings.push({
                staff_id: person.id, staff_name: person.full_name, rule: "wunsch_nicht_erfuellt",
                date: w.date_from ?? undefined,
                detail: `Wunsch (${w.shift_type === "all" ? "jede Schicht" : w.shift_type}) für ${zeitraum} konnte nicht erfüllt werden`,
            });
        }
    }
    const meldeHaeufung = (was: string, proPerson: Record<string, number>, mindest: number) => {
        const werte = Object.values(proPerson).filter(n => n > 0);
        if (werte.length === 0)
            return;
        if (staffList.length < 2)
            return;
        const schnitt = werte.reduce((a, b) => a + b, 0) / werte.length;
        const alleinTraeger = werte.length === 1;
        for (const [id, n] of Object.entries(proPerson)) {
            const person = staffById.get(id);
            if (!person || n < mindest)
                continue;
            if (!alleinTraeger && n <= schnitt * 1.5)
                continue;
            contractWarnings.push({ staff_id: id, staff_name: person.full_name, rule: `haeufung_${was}`,
                detail: alleinTraeger
                    ? `${n} ${was}dienste im Zeitraum — trägt sie als Einzige:r im Team`
                    : `${n} ${was}dienste im Zeitraum (Schnitt im Team: ${schnitt.toFixed(1)}) — ungleich verteilt` });
        }
    };
    const nachtGeplant: Record<string, number> = {};
    const wochenendGeplant: Record<string, number> = {};
    for (const a of assignments) {
        if (a.shift_type === "nacht")
            nachtGeplant[a.staff_id] = (nachtGeplant[a.staff_id] ?? 0) + 1;
        if (isWeekend(a.shift_date))
            wochenendGeplant[a.staff_id] = (wochenendGeplant[a.staff_id] ?? 0) + 1;
    }
    meldeHaeufung("nacht", nachtGeplant, 4);
    meldeHaeufung("wochenend", wochenendGeplant, 4);
    const totalSlots = shifts.reduce((s, sh) => s + (sh.planned_staff ?? 1), 0);
    const staffWithNightBurnout = Object.entries(nightCounts)
        .filter(([, n]) => n >= 4)
        .map(([id]) => staffList.find(s => s.id === id)?.full_name)
        .filter(Boolean);
    const staffWithOverwork = Object.entries(netMinutesWorked)
        .filter(([, mins]) => mins / 60 > 160)
        .map(([id]) => staffList.find(s => s.id === id)?.full_name)
        .filter(Boolean);
    return {
        assignments,
        springer_assignments: springerAssignments,
        unfilled_slots: unfilledSlots,
        understaffing_log: understaffingLog,
        understaffing_mode: understaffingMode,
        contract_warnings: contractWarnings,
        stats: {
            total_slots: totalSlots,
            filled: assignments.length,
            unfilled: totalSlots - assignments.length,
            staff_count: staffList.length,
            wish_count: (wishes ?? []).filter(w => w.wish_type === "preference").length,
            burnout_warnings: [...new Set([...staffWithNightBurnout, ...staffWithOverwork])],
            wishes_fulfilled: wishesFulfilled,
            wishes_missed: wishesMissed,
            absence_blocks: absenceBlocks,
        },
    };
}
export type ReplacementCandidate = {
    staff_id: string;
    staff_name: string;
    score: number;
    reason: string;
    is_overtime: boolean;
    is_springer?: boolean;
};
export type ReplacementInput = {
    shift: {
        station: string;
        date: string;
        shift_type: string;
        start_time: string | null;
        end_time: string | null;
    };
    facilityStaff: RawFacilityStaff[];
    profiles: RawProfile[];
    wishes: RawWish[];
    nightEntries: RawNightEntry[];
    availability: RawAvailability[];
    hoursThisWeekByStaffId: Record<string, number>;
    assignedByStaffAndDate: Record<string, Record<string, string>>;
    excludeNames?: string[];
    absences?: RawAbsence[];
    burnoutScores?: RawBurnoutScore[];
    overtimeLimitPct?: number | null;
    pauseThresholdMinutes?: number | null;
    facilityDefaults?: ContractDefaults | null;
    relaxSequenceRules?: boolean;
    nichtPflegeStationen?: string[];
    gruppe?: "arzt" | "team";
};
export function rankReplacementCandidates(input: ReplacementInput): ReplacementCandidate[] {
    const { shift, facilityStaff, profiles, wishes, nightEntries, availability, hoursThisWeekByStaffId, assignedByStaffAndDate, excludeNames, overtimeLimitPct, pauseThresholdMinutes, facilityDefaults, relaxSequenceRules, } = input;
    const nichtPflege = new Set(input.nichtPflegeStationen ?? []);
    const replDefaults = extractContractDefaults(facilityDefaults);
    const replAbsenceIdx = buildAbsenceIndex(input.absences);
    const replBurnoutById: Record<string, number> = {};
    for (const b of input.burnoutScores ?? []) {
        const n = Number(b?.score);
        if (b?.staff_id && Number.isFinite(n) && n > 0)
            replBurnoutById[b.staff_id] = n;
    }
    const pauseThreshold = pauseThresholdMinutes ?? 20;
    const overtimeLimit = (overtimeLimitPct ?? 20) / 100;
    const excluded = new Set((excludeNames ?? []).filter(Boolean));
    const facilityById: Record<string, {
        max_hours_per_week: number;
        job_type: string;
        hourly_rate: number | null;
        minijob_buffer_pct: number;
    }> = {};
    const rawByIdR: Record<string, RawFacilityStaff> = {};
    for (const s of facilityStaff ?? []) {
        facilityById[s.id] = {
            max_hours_per_week: Number(s.max_hours_per_week) || 40,
            job_type: (s.job_type as string) || "Vollzeit",
            hourly_rate: s.hourly_rate != null ? Number(s.hourly_rate) : null,
            minijob_buffer_pct: Number(s.minijob_buffer_pct) || 15,
        };
        rawByIdR[s.id] = s;
    }
    const stationByName: Record<string, string> = {};
    for (const p of profiles ?? [])
        if (p.full_name && p.station)
            stationByName[p.full_name] = p.station;
    const byName = new Map<string, StaffMember>();
    for (const p of profiles ?? []) {
        if (!p.full_name)
            continue;
        if (!profilPlanbar(p, q => !!rawByIdR[q.id] || !!facilityStaff?.some(f => f.full_name === q.full_name)))
            continue;
        const info = facilityById[p.id] ?? { max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 };
        byName.set(p.full_name, {
            id: p.id, full_name: p.full_name, active: true, station: p.station ?? null,
            einsatzStationen: einsatzStationenVon(rawByIdR[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name)),
            stationsdienst: stationsdienst((rawByIdR[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name))?.role),
            arzt: istArzt((rawByIdR[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name))?.role),
            dienstplanung: dienstplanungVon(rawByIdR[p.id] ?? facilityStaff?.find(f => f.full_name === p.full_name), p.role),
            max_hours_per_week: effectiveWeeklyLimit(info, Number(input.shift.date.slice(0, 4)) || undefined),
            job_type: info.job_type, hourly_rate: info.hourly_rate, minijob_buffer_pct: info.minijob_buffer_pct,
            ...resolveStaffLimits(rawByIdR[p.id], replDefaults),
        });
    }
    for (const s of facilityStaff ?? []) {
        if (!s.full_name || byName.has(s.full_name))
            continue;
        const info = facilityById[s.id] ?? { max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 };
        byName.set(s.full_name, {
            id: s.id, full_name: s.full_name, active: s.active ?? true,
            station: stationByName[s.full_name] ?? (s.station ?? null),
            einsatzStationen: einsatzStationenVon(s),
            stationsdienst: stationsdienst(s.role),
            arzt: istArzt(s.role),
            dienstplanung: dienstplanungVon(s),
            max_hours_per_week: effectiveWeeklyLimit(info, Number(input.shift.date.slice(0, 4)) || undefined),
            job_type: info.job_type, hourly_rate: info.hourly_rate, minijob_buffer_pct: info.minijob_buffer_pct,
            ...resolveStaffLimits(rawByIdR[s.id], replDefaults),
        });
    }
    const staffList = Array.from(byName.values());
    const nightCounts: Record<string, number> = {};
    const netMinutesWorked: Record<string, number> = {};
    const lowPauseShifts: Record<string, number> = {};
    for (const entry of nightEntries ?? []) {
        const uid = entry.user_id;
        const h = new Date(entry.check_in).getHours();
        if (h >= 22 || h < 6)
            nightCounts[uid] = (nightCounts[uid] ?? 0) + 1;
        const dur = entry.duration_minutes ?? 0;
        const pauseMins = entry.total_pause_minutes ?? 0;
        netMinutesWorked[uid] = (netMinutesWorked[uid] ?? 0) + Math.max(0, dur - pauseMins);
        if (dur >= 360 && pauseMins < pauseThreshold)
            lowPauseShifts[uid] = (lowPauseShifts[uid] ?? 0) + 1;
    }
    const availMap: Record<string, Record<number, RawAvailability>> = {};
    for (const row of availability ?? []) {
        if (!availMap[row.staff_id])
            availMap[row.staff_id] = {};
        availMap[row.staff_id][row.day_of_week] = row;
    }
    const shiftH = shiftHours(shift);
    const dow = new Date(shift.date + "T00:00:00").getDay();
    const dowKey = dow === 0 ? 7 : dow;
    const out: ReplacementCandidate[] = [];
    for (const staff of staffList) {
        if (excluded.has(staff.full_name))
            continue;
        if (input.gruppe && staff.arzt !== (input.gruppe === "arzt"))
            continue;
        const byDate = assignedByStaffAndDate[staff.id];
        if (byDate?.[shift.date])
            continue;
        if (absenceOn(replAbsenceIdx, staff.id, shift.date))
            continue;
        const zugangR = stationsZugang(staff, shift.station, nichtPflege);
        if (!zugangR)
            continue;
        const avail = availMap[staff.id]?.[dowKey];
        if (avail !== undefined) {
            if (!avail.available)
                continue;
            if (avail.from_time && shift.start_time && shift.start_time < avail.from_time)
                continue;
            if (avail.to_time && shift.end_time && shift.end_time > avail.to_time)
                continue;
        }
        const isUnavailable = (wishes ?? []).some(w => w.wish_type === "unavailable" && w.status !== "abgelehnt" &&
            (w.user_id === staff.id || w.full_name === staff.full_name) &&
            withinRange(shift.date, w.date_from, w.date_to) &&
            (w.shift_type === "all" || w.shift_type === shift.shift_type));
        if (isUnavailable)
            continue;
        if (staff.noSundayWork && isSunday(shift.date))
            continue;
        if (!passtZurDienstplanung(staff.dienstplanung, shift.date, shift.shift_type))
            continue;
        if (shiftH > staff.maxHoursPerShift)
            continue;
        if (!relaxSequenceRules) {
            const prevTypeR = byDate?.[isoPrevDay(shift.date)];
            if (violatesRestTransition(prevTypeR, shift.shift_type))
                continue;
            const restHR = restHoursBetween(prevTypeR, shift);
            if (restHR !== null && restHR < staff.minRestHours)
                continue;
            if (consecutiveDaysBefore(byDate, shift.date) >= staff.maxConsecutiveDays)
                continue;
            if (shift.shift_type === "nacht" && consecutiveNightsBefore(byDate, shift.date) >= staff.maxConsecutiveNights)
                continue;
        }
        const usedH = hoursThisWeekByStaffId[staff.id] ?? 0;
        let isOvertime = false;
        if (usedH + shiftH > staff.max_hours_per_week) {
            if (!OVERTIME_ELIGIBLE_TYPES.has(staff.job_type))
                continue;
            if (usedH + shiftH > staff.max_hours_per_week * (1 + overtimeLimit))
                continue;
            isOvertime = true;
        }
        let score = 50;
        const reasons: string[] = [];
        if (isOvertime)
            reasons.push("Überstunden");
        if (zugangR === "einspringen") {
            score -= EINSPRING_MALUS;
            reasons.push(`Springt von ${staff.station} ein`);
        }
        const hasPreference = (wishes ?? []).some(w => w.wish_type === "preference" &&
            w.status !== "abgelehnt" &&
            (w.user_id === staff.id || w.full_name === staff.full_name) &&
            withinRange(shift.date, w.date_from, w.date_to) &&
            (w.shift_type === "all" || w.shift_type === shift.shift_type));
        if (hasPreference) {
            score += WISH_BONUS_BASE;
            reasons.push("Wunsch");
        }
        const hasAvoid = (wishes ?? []).some(w => w.wish_type === "avoid" && w.status !== "abgelehnt" &&
            (w.user_id === staff.id || w.full_name === staff.full_name) &&
            withinRange(shift.date, w.date_from, w.date_to) &&
            (w.shift_type === "all" || w.shift_type === shift.shift_type));
        if (hasAvoid) {
            score -= WISH_AVOID_PENALTY;
            reasons.push("Möchte vermeiden");
        }
        const bScoreR = replBurnoutById[staff.id] ?? 0;
        if (bScoreR > 0) {
            const malus = Math.min(bScoreR * BURNOUT_SCORE_WEIGHT, BURNOUT_SCORE_MAX_PENALTY);
            score -= malus;
            if (malus >= 5)
                reasons.push(`Belastungsscore ${Math.round(bScoreR)}`);
        }
        const nights = nightCounts[staff.id] ?? 0;
        if (nights > 0 && shift.shift_type === "nacht") {
            score -= nights * 2;
            if (nights >= 3)
                reasons.push(`${nights}× Nacht letzte Wochen`);
        }
        const netHours = (netMinutesWorked[staff.id] ?? 0) / 60;
        if (netHours > 160) {
            score -= Math.floor((netHours - 160) / 40) * 3;
            reasons.push(`${Math.round(netHours)}h Nettostunden (4 Wo.)`);
        }
        const inadequatePauses = lowPauseShifts[staff.id] ?? 0;
        if (inadequatePauses >= 2) {
            score -= inadequatePauses * 2;
            reasons.push(`${inadequatePauses}× Pause <${pauseThreshold} Min`);
        }
        const limitRatio = usedH / staff.max_hours_per_week;
        if (limitRatio > 0.75) {
            score -= Math.round((limitRatio - 0.75) * 20);
            reasons.push(`${Math.round(usedH)}/${staff.max_hours_per_week}h (${staff.job_type})`);
        }
        score += (staff.full_name.charCodeAt(0) % 10) * 0.1;
        out.push({
            staff_id: staff.id, staff_name: staff.full_name, score: Math.round(score), reason: reasons.join(", ") || "Verfügbar", is_overtime: isOvertime,
            ...(zugangR === "einspringen" ? { is_springer: true } : {}),
        });
    }
    out.sort((a, b) => (a.is_overtime === b.is_overtime ? b.score - a.score : a.is_overtime ? 1 : -1));
    return out;
}

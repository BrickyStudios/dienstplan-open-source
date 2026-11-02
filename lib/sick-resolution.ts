import type { SupabaseClient } from "@supabase/supabase-js";
import { rankReplacementCandidates, shiftHours, type ReplacementCandidate, type ContractDefaults, } from "@/lib/scheduling/generate-plan-core";
import { maybeAutoRequestExternal } from "@/lib/external-agencies";
import { ladeNichtPflegeStationen } from "@/lib/nicht-pflege-stationen";
import { istArzt } from "@/lib/berufe";
import { notifyLeitungOfSickReport } from "@/lib/sick-report-notify";
import { notifyStaffAssigned } from "@/lib/plan-notify";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { formatWochentag } from "@/lib/datum-format";
import { isoWeekRange, utcTagISO } from "@/lib/date";
import { ersatzAmTag, ersatzSchwelle, leseBesetzung, leseReplacementMin, mindestbesetzungFuer, type TagesBesetzung } from "@/lib/scheduling/praxis-raster";
import type { Demand } from "@/lib/scheduling/shift-demand";
type Admin = SupabaseClient<any>;
export type Springer = {
    staffName: string;
    userId: string | null;
};
export type SickGapDecision = {
    action: "no_gap";
} | {
    action: "assign";
    staffName: string;
    userId: string | null;
    isOvertime: boolean;
    reason: string;
} | {
    action: "request_external";
} | {
    action: "escalate_notify";
    reason: "no_candidate" | "no_external" | "suppressed";
} | {
    action: "notify_options";
    springer: Springer[];
    candidates: ReplacementCandidate[];
    canRequestExternal: boolean;
};
export function decideSickResolution(args: {
    mode: "popup" | "auto";
    gap: number;
    springer: Springer[];
    candidates: ReplacementCandidate[];
    hasExternalAgencies: boolean;
    autoExternalEnabled: boolean;
    requestReplacement: boolean | null;
}): SickGapDecision {
    const { mode, gap, springer, candidates, hasExternalAgencies, autoExternalEnabled, requestReplacement } = args;
    if (gap <= 0)
        return { action: "no_gap" };
    const suppressed = requestReplacement === false;
    if (mode === "auto") {
        if (suppressed)
            return { action: "escalate_notify", reason: "suppressed" };
        if (springer.length > 0) {
            return { action: "assign", staffName: springer[0].staffName, userId: springer[0].userId, isOvertime: false, reason: "Bereitschaft/verfügbar" };
        }
        if (candidates.length > 0) {
            const c = candidates[0];
            return { action: "assign", staffName: c.staff_name, userId: c.staff_id, isOvertime: c.is_overtime, reason: c.reason };
        }
        if (autoExternalEnabled && hasExternalAgencies)
            return { action: "request_external" };
        return { action: "escalate_notify", reason: hasExternalAgencies ? "no_external" : "no_candidate" };
    }
    return {
        action: "notify_options",
        springer,
        candidates,
        canRequestExternal: hasExternalAgencies,
    };
}
export async function computeShiftGapExcluding(admin: Admin, shiftId: string, plannedStaff: number | null, excludeStaffId: string | null, excludeStaffName: string | null): Promise<number> {
    const { data: shiftAssignments } = await admin
        .from("shift_assignments")
        .select("staff_id, staff_name, status")
        .eq("shift_id", shiftId);
    const confirmed = (shiftAssignments ?? []).filter(a => (a.status ?? "confirmed") !== "cancelled");
    const filledExcl = confirmed.filter(a => (excludeStaffName ? a.staff_name !== excludeStaffName : true) &&
        (excludeStaffId ? a.staff_id !== excludeStaffId : true)).length;
    const planned = Number(plannedStaff) || 1;
    return planned - filledExcl;
}
export type Settings = {
    understaffing_mode: "popup" | "auto";
    overtime_limit_pct: number;
    pause_threshold_minutes: number;
    auto_request_external_agencies: boolean;
    contractDefaults: ContractDefaults;
    replacementMin?: Demand | null;
    besetzungJeTag?: TagesBesetzung | null;
};
const CONTRACT_DEFAULT_KEYS: (keyof ContractDefaults)[] = [
    "default_max_shifts_per_week", "default_max_consecutive_days", "default_max_consecutive_nights",
    "default_max_hours_per_shift", "default_min_rest_hours", "default_break_after_minutes",
    "default_break_min", "default_max_holiday_shifts_per_month", "default_min_days_off_per_week",
];
function pickContractDefaults(data: Record<string, unknown> | null | undefined): ContractDefaults {
    const out: ContractDefaults = {};
    if (!data)
        return out;
    for (const k of CONTRACT_DEFAULT_KEYS) {
        const v = data[k];
        if (v != null)
            (out as Record<string, unknown>)[k] = v;
    }
    return out;
}
export async function loadSettings(admin: Admin, facilityName: string): Promise<Settings> {
    const fallback: Settings = { understaffing_mode: "popup", overtime_limit_pct: 20, pause_threshold_minutes: 20, auto_request_external_agencies: false, contractDefaults: {} };
    let { data } = await admin
        .from("facility_settings")
        .select("*")
        .eq("facility_name", facilityName)
        .maybeSingle();
    if (!data) {
        ({ data } = await admin
            .from("facility_settings")
            .select("understaffing_mode, overtime_limit_pct, pause_threshold_minutes")
            .eq("facility_name", facilityName)
            .maybeSingle());
    }
    if (!data)
        return fallback;
    const mode = data.understaffing_mode === "auto" ? "auto" : "popup";
    return {
        understaffing_mode: mode,
        overtime_limit_pct: Number(data.overtime_limit_pct) || 20,
        pause_threshold_minutes: Number(data.pause_threshold_minutes) || 20,
        auto_request_external_agencies: Boolean((data as Record<string, unknown>).auto_request_external_agencies),
        contractDefaults: pickContractDefaults(data as Record<string, unknown>),
        replacementMin: leseReplacementMin((data as Record<string, unknown>).replacement_min),
        besetzungJeTag: leseBesetzung((data as Record<string, unknown>).day_shift_times),
    };
}
export async function resolveSickGap(admin: Admin, facilityName: string, reportId: string, opts?: {
    requestReplacement?: boolean | null;
    excludeUserId?: string;
    simulate?: boolean;
    candidateAllowlist?: Set<string>;
}): Promise<void> {
    try {
        const settings = await loadSettings(admin, facilityName);
        const { data: report } = await admin
            .from("sick_reports")
            .select("id, sick_date, shift_type, station, sick_staff_name, sick_user_id")
            .eq("id", reportId)
            .eq("facility_name", facilityName)
            .single();
        if (!report)
            return;
        const sickDate = report.sick_date as string;
        const shiftType = (report.shift_type as string | null) ?? null;
        const station = (report.station as string | null) ?? null;
        const sickName = (report.sick_staff_name as string | null) ?? null;
        const requestReplacement = opts?.requestReplacement ?? null;
        const simulate = opts?.simulate === true;
        let shiftQuery = admin
            .from("shifts")
            .select("id, station, date, shift_type, planned_staff, start_time, end_time")
            .eq("facility_name", facilityName)
            .eq("date", sickDate);
        if (shiftType)
            shiftQuery = shiftQuery.eq("shift_type", shiftType);
        if (station)
            shiftQuery = shiftQuery.eq("station", station);
        const { data: shifts } = await shiftQuery;
        const shift = shifts && shifts.length === 1 ? shifts[0] : null;
        if (!shift) {
            await fallbackBehaviour(admin, facilityName, reportId, report, requestReplacement, opts?.excludeUserId, simulate);
            return;
        }
        const schwelle = ersatzSchwelle(Number(shift.planned_staff) || 1, ersatzAmTag(settings.besetzungJeTag, String(shift.date ?? sickDate), String(shift.shift_type))
            ?? mindestbesetzungFuer(settings.replacementMin, shift.station as string | null, shift.shift_type as string | null));
        const gap = schwelle <= 0 ? 0 : await computeShiftGapExcluding(admin, shift.id as string, schwelle, (report.sick_user_id as string | null) ?? null, sickName);
        if (gap <= 0) {
            return;
        }
        const shiftMatches = (cand: string | null) => !shiftType || !cand || cand === shiftType;
        const [onCallRes, availRes, dayAssignRes] = await Promise.all([
            admin.from("on_call_entries").select("staff_name, user_id, shift_type").eq("facility_name", facilityName).eq("on_call_date", sickDate),
            admin.from("availability_entries").select("staff_name, user_id, shift_type").eq("facility_name", facilityName).eq("available_date", sickDate),
            admin.from("shift_assignments").select("staff_name, shift_id").eq("facility_name", facilityName),
        ]);
        const namesAssignedOnDate = new Set<string>();
        const { data: shiftsToday } = await admin
            .from("shifts").select("id").eq("facility_name", facilityName).eq("date", sickDate);
        const todayShiftIds = new Set((shiftsToday ?? []).map(s => s.id as string));
        for (const a of dayAssignRes.data ?? []) {
            if (todayShiftIds.has(a.shift_id as string))
                namesAssignedOnDate.add(a.staff_name as string);
        }
        const allowlist = opts?.candidateAllowlist;
        const springerSeen = new Set<string>();
        const springer: Springer[] = [];
        for (const row of [...(onCallRes.data ?? []), ...(availRes.data ?? [])]) {
            const name = row.staff_name as string;
            if (!name || name === sickName || springerSeen.has(name) || namesAssignedOnDate.has(name))
                continue;
            if (allowlist && !allowlist.has(name))
                continue;
            if (!shiftMatches((row.shift_type as string | null) ?? null))
                continue;
            springer.push({ staffName: name, userId: (row.user_id as string | null) ?? null });
            springerSeen.add(name);
        }
        const candidates = await buildOvertimeCandidates(admin, facilityName, shift, sickDate, settings, [
            ...(sickName ? [sickName] : []),
            ...namesAssignedOnDate,
            ...springer.map(s => s.staffName),
        ], allowlist, sickName);
        const decision = decideSickResolution({
            mode: settings.understaffing_mode,
            gap,
            springer,
            candidates,
            hasExternalAgencies: await hasActiveAgencies(admin, facilityName),
            autoExternalEnabled: settings.auto_request_external_agencies,
            requestReplacement,
        });
        await executeDecision(admin, facilityName, reportId, shift, sickDate, decision, settings, report, opts?.excludeUserId, simulate);
    }
    catch {
        try {
            await fallbackBehaviour(admin, facilityName, reportId, null, opts?.requestReplacement ?? null, opts?.excludeUserId, opts?.simulate === true);
        }
        catch { }
    }
}
async function hasActiveAgencies(admin: Admin, facilityName: string): Promise<boolean> {
    const { count } = await admin
        .from("external_agencies")
        .select("id", { count: "exact", head: true })
        .eq("facility_name", facilityName)
        .eq("active", true);
    return (count ?? 0) > 0;
}
export async function buildOvertimeCandidates(admin: Admin, facilityName: string, shift: {
    station: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
}, sickDate: string, settings: Settings, excludeNames: string[], candidateAllowlist?: Set<string>, ausfallName?: string | null): Promise<ReplacementCandidate[]> {
    const week = isoWeekRange(sickDate);
    const histStart = new Date(sickDate + "T00:00:00Z");
    histStart.setUTCDate(histStart.getUTCDate() - 6);
    const rangeStart = utcTagISO(histStart) < week.start ? utcTagISO(histStart) : week.start;
    const since28d = new Date(Date.now() - 28 * 86400000).toISOString();
    const [staffRes, profilesRes, wishesRes, nightRes, availRes, weekShiftsRes] = await Promise.all([
        admin.from("facility_staff").select("*").eq("facility_name", facilityName).eq("active", true),
        admin.from("user_profiles").select("id, full_name, station, role").eq("facility", facilityName),
        admin.from("staff_wishes").select("*").eq("facility_name", facilityName),
        admin.from("time_entries").select("user_id, check_in, duration_minutes, total_pause_minutes").eq("facility", facilityName).gte("check_in", since28d),
        admin.from("staff_availability").select("*").eq("facility_name", facilityName),
        admin.from("shifts").select("id, date, shift_type, start_time, end_time").eq("facility_name", facilityName).gte("date", rangeStart).lte("date", week.end),
    ]);
    const weekShifts = weekShiftsRes.data ?? [];
    const shiftById = new Map(weekShifts.map(s => [s.id as string, s]));
    const hoursThisWeekByStaffId: Record<string, number> = {};
    const assignedByStaffAndDate: Record<string, Record<string, string>> = {};
    if (weekShifts.length) {
        const { data: weekAssignments } = await admin
            .from("shift_assignments")
            .select("staff_id, shift_id, status")
            .eq("facility_name", facilityName)
            .in("shift_id", weekShifts.map(s => s.id as string));
        for (const a of weekAssignments ?? []) {
            if ((a.status ?? "confirmed") === "cancelled")
                continue;
            const sid = a.staff_id as string | null;
            if (!sid)
                continue;
            const sh = shiftById.get(a.shift_id as string);
            if (!sh)
                continue;
            const shDate = sh.date as string;
            if (!assignedByStaffAndDate[sid])
                assignedByStaffAndDate[sid] = {};
            assignedByStaffAndDate[sid][shDate] = sh.shift_type as string;
            if (shDate >= week.start && shDate <= week.end) {
                hoursThisWeekByStaffId[sid] = (hoursThisWeekByStaffId[sid] ?? 0) + shiftHours(sh as {
                    date: string;
                    start_time: string | null;
                    end_time: string | null;
                    shift_type: string;
                });
            }
        }
    }
    const staffPool = candidateAllowlist
        ? (staffRes.data ?? []).filter((s: {
            full_name?: string;
        }) => s.full_name && candidateAllowlist.has(s.full_name))
        : (staffRes.data ?? []);
    const profilesPool = candidateAllowlist
        ? (profilesRes.data ?? []).filter((p: {
            full_name?: string;
        }) => p.full_name && candidateAllowlist.has(p.full_name))
        : (profilesRes.data ?? []);
    const ausfallRolle = ausfallName
        ? ((staffRes.data ?? []) as {
            full_name?: string;
            role?: string | null;
        }[]).find(s => s.full_name === ausfallName)?.role
        : undefined;
    return rankReplacementCandidates({
        ...(ausfallRolle !== undefined ? { gruppe: istArzt(ausfallRolle) ? "arzt" as const : "team" as const } : {}),
        nichtPflegeStationen: await ladeNichtPflegeStationen(admin, facilityName),
        shift,
        facilityStaff: staffPool,
        profiles: profilesPool,
        wishes: wishesRes.data ?? [],
        nightEntries: nightRes.data ?? [],
        availability: availRes.data ?? [],
        hoursThisWeekByStaffId,
        assignedByStaffAndDate,
        excludeNames,
        overtimeLimitPct: settings.overtime_limit_pct,
        pauseThresholdMinutes: settings.pause_threshold_minutes,
        facilityDefaults: settings.contractDefaults,
    });
}
async function executeDecision(admin: Admin, facilityName: string, reportId: string, shift: {
    id: string;
    shift_type: string;
    station: string;
    start_time?: string | null;
    end_time?: string | null;
}, sickDate: string, decision: SickGapDecision, settings: Settings, report: any, excludeUserId?: string, simulate?: boolean): Promise<void> {
    switch (decision.action) {
        case "no_gap":
            return;
        case "assign": {
            await admin.from("shift_assignments").insert({
                shift_id: shift.id,
                facility_name: facilityName,
                staff_id: decision.userId,
                staff_name: decision.staffName,
                status: "confirmed",
                is_overtime: decision.isOvertime,
                understaffing_decision: "live_backfill",
            }).then(() => { }, () => { });
            await syncActualStaff(admin, facilityName, [shift.id]);
            await admin.from("sick_reports").update({ status: "covered" }).eq("id", reportId).then(() => { }, () => { });
            const zustellung = await notifyStaffAssigned(admin, {
                facilityName,
                staffName: decision.staffName,
                staffId: decision.userId,
                date: sickDate,
                shiftType: shift.shift_type,
                station: shift.station,
                startTime: shift.start_time ?? null,
                endTime: shift.end_time ?? null,
                isOvertime: decision.isOvertime,
                reason: `Kurzfristiger Ausfall auf ${shift.station}. Du wurdest eingeteilt: ${decision.reason}.`,
                simulate,
            });
            const zustellText = zustellung.email
                ? " Per App und E-Mail benachrichtigt."
                : zustellung.simulatedEmail
                    ? " Per App benachrichtigt (E-Mail in der Simulation unterdrückt)."
                    : zustellung.app
                        ? " Per App benachrichtigt (keine E-Mail hinterlegt)."
                        : " ACHTUNG: konnte nicht automatisch benachrichtigt werden — bitte persönlich informieren.";
            await insertLeitungNotice(admin, facilityName, "Ausfall automatisch besetzt", `${decision.staffName} übernimmt die offene Schicht am ${formatWochentag(sickDate)} (${shift.shift_type})${decision.isOvertime ? " — als Überstunde" : ""}.${zustellText}`, excludeUserId);
            return;
        }
        case "request_external":
            if (simulate) {
                await insertLeitungNotice(admin, facilityName, "Ausfall: externe Anfrage übersprungen (Simulation)", `Offene Schicht am ${formatWochentag(sickDate)} (${shift.shift_type}) — im echten Betrieb würde jetzt eine externe Firma angefragt. In der Simulation unterdrückt.`, excludeUserId);
                return;
            }
            await maybeAutoRequestExternal(admin, facilityName, reportId, true);
            return;
        case "escalate_notify": {
            const reasonText = decision.reason === "no_external"
                ? "Kein interner Ersatz und keine externe Firma hat (noch) zugesagt."
                : decision.reason === "suppressed"
                    ? "Für diese Meldung wurde \"kein Ersatz\" gewählt."
                    : "Kein interner Ersatz gefunden und keine externen Dienste hinterlegt.";
            await insertLeitungNotice(admin, facilityName, "Untergrenze unterschritten — bitte handeln", `Offene Schicht am ${formatWochentag(sickDate)} (${shift.shift_type}). ${reasonText}`, excludeUserId);
            return;
        }
        case "notify_options": {
            const top = decision.candidates.slice(0, 3).map(c => c.staff_name);
            const springerNames = decision.springer.map(s => s.staffName);
            const parts: string[] = [];
            if (springerNames.length)
                parts.push(`Bereitschaft/verfügbar: ${springerNames.slice(0, 3).join(", ")}`);
            if (top.length)
                parts.push(`Vorschläge: ${top.join(", ")}`);
            if (decision.canRequestExternal)
                parts.push("externe Firma kann angefragt werden");
            const detail = parts.length ? ` ${parts.join(" · ")}.` : " Keine internen Kandidaten verfügbar.";
            await insertLeitungNotice(admin, facilityName, "Ausfall: Untergrenze unterschritten", `Offene Schicht am ${formatWochentag(sickDate)} (${shift.shift_type}).${detail}`, excludeUserId);
            return;
        }
    }
}
async function insertLeitungNotice(admin: Admin, facilityName: string, title: string, message: string, excludeUserId?: string): Promise<void> {
    const { data: leitungen } = await admin
        .from("user_profiles").select("id").eq("facility", facilityName).eq("role", "leitung");
    const rows = (leitungen ?? [])
        .filter((l: {
        id: string;
    }) => l.id !== excludeUserId)
        .map((l: {
        id: string;
    }) => ({ user_id: l.id, facility_name: facilityName, title, message, read: false }));
    if (rows.length)
        await admin.from("notifications").insert(rows).then(() => { }, () => { });
}
async function fallbackBehaviour(admin: Admin, facilityName: string, reportId: string, report: any, requestReplacement: boolean | null, excludeUserId?: string, simulate?: boolean): Promise<void> {
    if (!simulate)
        await maybeAutoRequestExternal(admin, facilityName, reportId, requestReplacement);
    const rep = report ?? (await admin.from("sick_reports").select("sick_staff_name, sick_date, shift_type, station").eq("id", reportId).maybeSingle()).data;
    if (rep)
        await notifyLeitungOfSickReport(admin, facilityName, rep, { excludeUserId });
}

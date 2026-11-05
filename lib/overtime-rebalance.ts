import type { SupabaseClient } from "@supabase/supabase-js";
import { rankReplacementCandidates, shiftHours, isoWeekKey, effectiveWeeklyLimit, pickContractDefaults, type ReplacementCandidate, type ContractDefaults, type RawFacilityStaff, type RawProfile, type RawWish, type RawNightEntry, type RawAvailability, } from "@/lib/scheduling/generate-plan-core";
import { notifyLeitung } from "@/lib/notify";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
import { formatWochentag } from "@/lib/datum-format";
type Admin = SupabaseClient<any>;
type RebalanceShiftRow = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number;
    start_time: string | null;
    end_time: string | null;
};
export type RebalanceCandidateShift = {
    shiftId: string;
    date: string;
    shiftType: string;
    plannedStaff: number;
    confirmedCountExclTarget: number;
    replacementCandidates: ReplacementCandidate[];
};
export type RebalanceDecision = {
    action: "none";
} | {
    action: "escalate";
    reason: string;
} | {
    action: "remove";
    shiftId: string;
    date: string;
    shiftType: string;
    reason: string;
} | {
    action: "swap";
    shiftId: string;
    date: string;
    shiftType: string;
    replacementStaffId: string;
    replacementStaffName: string;
    reason: string;
};
export function decideRebalanceForStaff(args: {
    weekHours: number;
    limitHours: number;
    candidateShifts: RebalanceCandidateShift[];
}): RebalanceDecision {
    const { weekHours, limitHours, candidateShifts } = args;
    if (weekHours <= limitHours)
        return { action: "none" };
    const overBy = Math.round((weekHours - limitHours) * 10) / 10;
    const limitTxt = Math.round(limitHours * 10) / 10;
    const sorted = [...candidateShifts].sort((a, b) => a.date.localeCompare(b.date));
    for (const s of sorted) {
        if (s.confirmedCountExclTarget >= s.plannedStaff) {
            return {
                action: "remove", shiftId: s.shiftId, date: s.date, shiftType: s.shiftType,
                reason: `${overBy}h über der Wochengrenze (${limitTxt}h) — Schicht am ${s.date} kann ohne Unterbesetzung entfallen.`,
            };
        }
    }
    for (const s of sorted) {
        const repl = s.replacementCandidates.find(c => !c.is_overtime);
        if (repl) {
            return {
                action: "swap", shiftId: s.shiftId, date: s.date, shiftType: s.shiftType,
                replacementStaffId: repl.staff_id, replacementStaffName: repl.staff_name,
                reason: `${overBy}h über der Wochengrenze (${limitTxt}h) — Tausch mit ${repl.staff_name} (${repl.reason}).`,
            };
        }
    }
    return {
        action: "escalate",
        reason: `${overBy}h über der Wochengrenze (${limitTxt}h) — keine geeignete Vertretung gefunden.`,
    };
}
type Settings = {
    overtime_rebalance_mode: "off" | "suggest" | "auto";
    overtime_limit_pct: number;
    pause_threshold_minutes: number;
    contractDefaults: ContractDefaults;
};
async function loadSettings(admin: Admin, facilityName: string): Promise<Settings> {
    const fallback: Settings = { overtime_rebalance_mode: "off", overtime_limit_pct: 20, pause_threshold_minutes: 20, contractDefaults: {} };
    const { data } = await admin.from("facility_settings").select("*").eq("facility_name", facilityName).maybeSingle();
    if (!data)
        return fallback;
    const mode = data.overtime_rebalance_mode === "auto" || data.overtime_rebalance_mode === "suggest" ? data.overtime_rebalance_mode : "off";
    return {
        overtime_rebalance_mode: mode,
        overtime_limit_pct: Number(data.overtime_limit_pct) || 20,
        pause_threshold_minutes: Number(data.pause_threshold_minutes) || 20,
        contractDefaults: pickContractDefaults(data as Record<string, unknown>),
    };
}
function describeDecision(staffName: string, decision: RebalanceDecision & {
    action: "remove" | "swap";
}): string {
    if (decision.action === "remove") {
        return `${staffName}: Schicht am ${formatWochentag(decision.date)} (${decision.shiftType}) entfällt — ${decision.reason}`;
    }
    return `${staffName} → ${decision.replacementStaffName}: Schicht am ${formatWochentag(decision.date)} (${decision.shiftType}) — ${decision.reason}`;
}
function buildStaffLimitsById(facilityStaff: RawFacilityStaff[], profiles: RawProfile[]): Map<string, {
    id: string;
    fullName: string;
    maxHoursPerWeek: number;
}> {
    const facilityById = new Map(facilityStaff.map(s => [s.id, s]));
    const byName = new Map<string, {
        id: string;
        fullName: string;
        maxHoursPerWeek: number;
    }>();
    const toInfo = (raw: RawFacilityStaff | undefined) => ({
        max_hours_per_week: Number(raw?.max_hours_per_week) || 40,
        job_type: raw?.job_type || "Vollzeit",
        hourly_rate: raw?.hourly_rate ?? null,
        minijob_buffer_pct: Number(raw?.minijob_buffer_pct) || 15,
    });
    for (const p of profiles) {
        if (!p.full_name)
            continue;
        byName.set(p.full_name, { id: p.id, fullName: p.full_name, maxHoursPerWeek: effectiveWeeklyLimit(toInfo(facilityById.get(p.id))) });
    }
    for (const s of facilityStaff) {
        if (!s.full_name || byName.has(s.full_name))
            continue;
        byName.set(s.full_name, { id: s.id, fullName: s.full_name, maxHoursPerWeek: effectiveWeeklyLimit(toInfo(s)) });
    }
    const byId = new Map<string, {
        id: string;
        fullName: string;
        maxHoursPerWeek: number;
    }>();
    for (const v of byName.values())
        byId.set(v.id, v);
    return byId;
}
export type RebalanceRunResult = {
    mode: string;
    newSuggestions: number;
    autoApplied: number;
    escalations: number;
};
export async function runOvertimeRebalance(admin: Admin, facilityName: string): Promise<RebalanceRunResult> {
    const zero: RebalanceRunResult = { mode: "off", newSuggestions: 0, autoApplied: 0, escalations: 0 };
    try {
        const settings = await loadSettings(admin, facilityName);
        if (settings.overtime_rebalance_mode === "off")
            return zero;
        const todayStr = berlinTodayISO();
        const weekStart0 = isoWeekKey(todayStr);
        const weekKeys = [weekStart0, addDaysISO(weekStart0, 7), addDaysISO(weekStart0, 14)];
        const horizonEnd = addDaysISO(weekStart0, 20);
        const historyStart = addDaysISO(weekStart0, -6);
        const since28d = new Date(Date.now() - 28 * 86400000).toISOString();
        const [staffRes, profilesRes, wishesRes, nightRes, availRes, shiftsRes] = await Promise.all([
            admin.from("facility_staff").select("*").eq("facility_name", facilityName).eq("active", true),
            admin.from("user_profiles").select("id, full_name, station, role").eq("facility", facilityName),
            admin.from("staff_wishes").select("*").eq("facility_name", facilityName),
            admin.from("time_entries").select("user_id, check_in, duration_minutes, total_pause_minutes").eq("facility", facilityName).gte("check_in", since28d),
            admin.from("staff_availability").select("*").eq("facility_name", facilityName),
            admin.from("shifts").select("id, station, date, shift_type, planned_staff, start_time, end_time").eq("facility_name", facilityName).gte("date", historyStart).lte("date", horizonEnd),
        ]);
        const facilityStaff: RawFacilityStaff[] = staffRes.data ?? [];
        const profiles: RawProfile[] = profilesRes.data ?? [];
        const wishes: RawWish[] = wishesRes.data ?? [];
        const nightEntries: RawNightEntry[] = nightRes.data ?? [];
        const availability: RawAvailability[] = availRes.data ?? [];
        const shifts: RebalanceShiftRow[] = shiftsRes.data ?? [];
        if (!shifts.length)
            return { ...zero, mode: settings.overtime_rebalance_mode };
        const shiftById = new Map(shifts.map((s) => [s.id, s]));
        const { data: assignmentsRaw } = await admin
            .from("shift_assignments")
            .select("staff_id, shift_id, status")
            .eq("facility_name", facilityName)
            .in("shift_id", shifts.map((s: {
            id: string;
        }) => s.id));
        const assignments = (assignmentsRaw ?? []).filter((a: {
            status: string | null;
        }) => (a.status ?? "confirmed") === "confirmed");
        const confirmedCountByShiftId: Record<string, number> = {};
        const assignedByStaffAndDate: Record<string, Record<string, string>> = {};
        const hoursByStaffWeek: Record<string, Record<string, number>> = {};
        const futureShiftsByStaffWeek: Record<string, Record<string, Array<{
            shiftId: string;
            date: string;
        }>>> = {};
        for (const a of assignments) {
            const sh = shiftById.get(a.shift_id as string);
            if (!sh)
                continue;
            confirmedCountByShiftId[a.shift_id as string] = (confirmedCountByShiftId[a.shift_id as string] ?? 0) + 1;
            const sid = a.staff_id as string | null;
            if (!sid)
                continue;
            if (!assignedByStaffAndDate[sid])
                assignedByStaffAndDate[sid] = {};
            const existingType = assignedByStaffAndDate[sid][sh.date];
            if (!existingType || sh.shift_type === "nacht")
                assignedByStaffAndDate[sid][sh.date] = sh.shift_type;
            const wk = isoWeekKey(sh.date);
            const h = shiftHours(sh);
            if (!hoursByStaffWeek[sid])
                hoursByStaffWeek[sid] = {};
            hoursByStaffWeek[sid][wk] = (hoursByStaffWeek[sid][wk] ?? 0) + h;
            if (sh.date >= todayStr) {
                if (!futureShiftsByStaffWeek[sid])
                    futureShiftsByStaffWeek[sid] = {};
                if (!futureShiftsByStaffWeek[sid][wk])
                    futureShiftsByStaffWeek[sid][wk] = [];
                futureShiftsByStaffWeek[sid][wk].push({ shiftId: a.shift_id as string, date: sh.date });
            }
        }
        const staffLimitsById = buildStaffLimitsById(facilityStaff, profiles);
        let newSuggestions = 0, autoApplied = 0, escalations = 0;
        const merkeAusgefuehrt = (d: {
            action: string;
            shiftId: string;
            date: string;
            replacementStaffId?: string;
        }) => {
            const sh = shiftById.get(d.shiftId);
            if (!sh || d.action !== "swap" || !d.replacementStaffId)
                return;
            const rid = d.replacementStaffId;
            if (!assignedByStaffAndDate[rid])
                assignedByStaffAndDate[rid] = {};
            const bisher = assignedByStaffAndDate[rid][sh.date];
            if (!bisher || sh.shift_type === "nacht")
                assignedByStaffAndDate[rid][sh.date] = sh.shift_type;
            const wk = isoWeekKey(sh.date);
            if (!hoursByStaffWeek[rid])
                hoursByStaffWeek[rid] = {};
            hoursByStaffWeek[rid][wk] = (hoursByStaffWeek[rid][wk] ?? 0) + shiftHours(sh);
        };
        for (const [staffId, byWeek] of Object.entries(hoursByStaffWeek)) {
            const staffInfo = staffLimitsById.get(staffId);
            if (!staffInfo)
                continue;
            for (const wk of weekKeys) {
                const weekHours = byWeek[wk] ?? 0;
                if (weekHours <= staffInfo.maxHoursPerWeek)
                    continue;
                const future = futureShiftsByStaffWeek[staffId]?.[wk] ?? [];
                if (!future.length)
                    continue;
                const hoursThisWeekByStaffId: Record<string, number> = {};
                for (const [sid, w] of Object.entries(hoursByStaffWeek))
                    hoursThisWeekByStaffId[sid] = w[wk] ?? 0;
                const candidateShifts: RebalanceCandidateShift[] = future.map(({ shiftId, date }) => {
                    const sh = shiftById.get(shiftId)!;
                    const plannedStaff = Number(sh.planned_staff) || 1;
                    const confirmedCountExclTarget = (confirmedCountByShiftId[shiftId] ?? 1) - 1;
                    const replacementCandidates = rankReplacementCandidates({
                        shift: { station: sh.station, date: sh.date, shift_type: sh.shift_type, start_time: sh.start_time, end_time: sh.end_time },
                        facilityStaff, profiles, wishes, nightEntries, availability,
                        hoursThisWeekByStaffId, assignedByStaffAndDate,
                        excludeNames: [staffInfo.fullName],
                        overtimeLimitPct: settings.overtime_limit_pct,
                        pauseThresholdMinutes: settings.pause_threshold_minutes,
                        facilityDefaults: settings.contractDefaults,
                    });
                    return { shiftId, date, shiftType: sh.shift_type, plannedStaff, confirmedCountExclTarget, replacementCandidates };
                });
                const decision = decideRebalanceForStaff({ weekHours, limitHours: staffInfo.maxHoursPerWeek, candidateShifts });
                if (decision.action === "none")
                    continue;
                if (decision.action === "escalate") {
                    escalations++;
                    await notifyLeitung(admin, facilityName, "Überstunden-Ausgleich: keine Lösung gefunden", `${staffInfo.fullName}: ${decision.reason}`);
                    continue;
                }
                const overtimeHours = Math.round((weekHours - staffInfo.maxHoursPerWeek) * 10) / 10;
                if (settings.overtime_rebalance_mode === "auto") {
                    await executeRebalanceAction(admin, facilityName, staffId, decision);
                    autoApplied++;
                    merkeAusgefuehrt(decision);
                    await admin.from("overtime_rebalance_suggestions").insert({
                        facility_name: facilityName, staff_id: staffId, staff_name: staffInfo.fullName,
                        shift_id: decision.shiftId, shift_date: decision.date, action: decision.action,
                        replacement_staff_id: decision.action === "swap" ? decision.replacementStaffId : null,
                        replacement_staff_name: decision.action === "swap" ? decision.replacementStaffName : null,
                        reason: decision.reason, overtime_hours: overtimeHours,
                        status: "auto_applied", resolved_at: new Date().toISOString(),
                    }).then(() => { }, () => { });
                    await notifyLeitung(admin, facilityName, "Überstunden automatisch ausgeglichen", describeDecision(staffInfo.fullName, decision));
                }
                else {
                    const { error } = await admin.from("overtime_rebalance_suggestions").insert({
                        facility_name: facilityName, staff_id: staffId, staff_name: staffInfo.fullName,
                        shift_id: decision.shiftId, shift_date: decision.date, action: decision.action,
                        replacement_staff_id: decision.action === "swap" ? decision.replacementStaffId : null,
                        replacement_staff_name: decision.action === "swap" ? decision.replacementStaffName : null,
                        reason: decision.reason, overtime_hours: overtimeHours,
                        status: "pending",
                    });
                    if (!error) {
                        newSuggestions++;
                        merkeAusgefuehrt(decision);
                        await notifyLeitung(admin, facilityName, "Vorschlag: Überstunden-Ausgleich", describeDecision(staffInfo.fullName, decision));
                    }
                }
            }
        }
        return { mode: settings.overtime_rebalance_mode, newSuggestions, autoApplied, escalations };
    }
    catch {
        return zero;
    }
}
async function executeRebalanceAction(admin: Admin, facilityName: string, staffId: string, decision: Extract<RebalanceDecision, {
    action: "remove" | "swap";
}>): Promise<void> {
    await admin.from("shift_assignments").delete()
        .eq("facility_name", facilityName).eq("shift_id", decision.shiftId).eq("staff_id", staffId)
        .then(() => { }, () => { });
    if (decision.action === "swap") {
        await admin.from("shift_assignments").insert({
            shift_id: decision.shiftId, facility_name: facilityName,
            staff_id: decision.replacementStaffId, staff_name: decision.replacementStaffName,
            status: "confirmed", is_overtime: false, understaffing_decision: "overtime_rebalance",
        }).then(() => { }, () => { });
    }
    await syncActualStaff(admin, facilityName, [decision.shiftId]);
}
export async function resolveOvertimeSuggestion(admin: Admin, facilityName: string, suggestionId: string, resolution: "accept" | "dismiss"): Promise<boolean> {
    try {
        const { data: suggestion } = await admin
            .from("overtime_rebalance_suggestions")
            .select("*")
            .eq("id", suggestionId).eq("facility_name", facilityName).eq("status", "pending")
            .maybeSingle();
        if (!suggestion)
            return false;
        if (resolution === "accept") {
            const decision: Extract<RebalanceDecision, {
                action: "remove" | "swap";
            }> = suggestion.action === "swap"
                ? {
                    action: "swap", shiftId: suggestion.shift_id, date: suggestion.shift_date, shiftType: "",
                    replacementStaffId: suggestion.replacement_staff_id, replacementStaffName: suggestion.replacement_staff_name,
                    reason: suggestion.reason ?? "",
                }
                : { action: "remove", shiftId: suggestion.shift_id, date: suggestion.shift_date, shiftType: "", reason: suggestion.reason ?? "" };
            if (decision.action === "swap" && decision.replacementStaffId) {
                const { data: tagesSchichten } = await admin.from("shifts").select("id")
                    .eq("facility_name", facilityName).eq("date", suggestion.shift_date);
                const ids = (tagesSchichten ?? []).map((s: {
                    id: string;
                }) => s.id);
                if (ids.length) {
                    const { data: belegt } = await admin.from("shift_assignments").select("id")
                        .eq("staff_id", decision.replacementStaffId).in("shift_id", ids).limit(1);
                    if ((belegt ?? []).length > 0)
                        return false;
                }
            }
            await executeRebalanceAction(admin, facilityName, suggestion.staff_id, decision);
        }
        await admin.from("overtime_rebalance_suggestions")
            .update({ status: resolution === "accept" ? "accepted" : "dismissed", resolved_at: new Date().toISOString() })
            .eq("id", suggestionId);
        return true;
    }
    catch {
        return false;
    }
}

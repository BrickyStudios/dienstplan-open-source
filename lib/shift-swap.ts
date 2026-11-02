import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStaffDirectory, resolveStaffId } from "@/lib/staff-identity";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
import { funktionFehlt } from "@/lib/db-fehler";
import { zaehltAlsBesetzt } from "@/lib/scheduling/actual-staff";
type Admin = SupabaseClient<any>;
export type SwapShiftRow = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number;
    start_time: string | null;
    end_time: string | null;
};
type SwapAssignmentRow = {
    shift_id: string;
    staff_id: string;
    staff_name: string;
};
type VacationRange = {
    from: string;
    to: string;
};
type SwapContext = {
    shiftById: Map<string, SwapShiftRow>;
    assignmentsByShiftId: Map<string, SwapAssignmentRow[]>;
    assignedByStaffAndDate: Record<string, Record<string, string>>;
    vacationByStaff: Record<string, VacationRange[]>;
    profilesCount: number;
    facilityStaffCount: number;
};
type RawAssignment = {
    shift_id: string;
    staff_id: string | null;
    staff_name: string | null;
    status: string | null;
};
async function loadAssignmentsForShifts(admin: Admin, facilityName: string, shiftIds: string[]): Promise<RawAssignment[]> {
    const CHUNK = 150;
    const out: RawAssignment[] = [];
    for (let i = 0; i < shiftIds.length; i += CHUNK) {
        const batch = shiftIds.slice(i, i + CHUNK);
        const { data } = await admin.from("shift_assignments")
            .select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facilityName).in("shift_id", batch);
        if (data)
            out.push(...(data as RawAssignment[]));
    }
    return out;
}
async function loadSwapContext(admin: Admin, facilityName: string, dates: string[]): Promise<SwapContext> {
    const sorted = [...dates].sort();
    const from = addDaysISO(sorted[0], -1);
    const to = sorted[sorted.length - 1];
    const [staffRes, profilesRes, shiftsRes] = await Promise.all([
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facilityName).eq("active", true),
        admin.from("user_profiles").select("id, full_name, station, role").eq("facility", facilityName),
        admin.from("shifts").select("id, station, date, shift_type, planned_staff, start_time, end_time")
            .eq("facility_name", facilityName).gte("date", from).lte("date", to),
    ]);
    const shifts: SwapShiftRow[] = shiftsRes.data ?? [];
    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    const directory = buildStaffDirectory((staffRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[], (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
    }[]);
    const assignmentsRaw = shifts.length
        ? await loadAssignmentsForShifts(admin, facilityName, shifts.map((s) => s.id))
        : [];
    const besetzt = assignmentsRaw.filter((a) => zaehltAlsBesetzt(a.status));
    const assignmentsByShiftId = new Map<string, SwapAssignmentRow[]>();
    const assignedByStaffAndDate: Record<string, Record<string, string>> = {};
    for (const a of besetzt) {
        const sh = shiftById.get(a.shift_id as string);
        if (!sh)
            continue;
        const sid = resolveStaffId(directory, a.staff_id as string | null, a.staff_name as string | null);
        if (!sid)
            continue;
        const row: SwapAssignmentRow = { shift_id: a.shift_id as string, staff_id: sid, staff_name: a.staff_name as string };
        const list = assignmentsByShiftId.get(row.shift_id);
        if (list)
            list.push(row);
        else
            assignmentsByShiftId.set(row.shift_id, [row]);
        if (!assignedByStaffAndDate[sid])
            assignedByStaffAndDate[sid] = {};
        assignedByStaffAndDate[sid][sh.date] = sh.shift_type;
    }
    const profileIds = ((profilesRes.data ?? []) as {
        id: string;
    }[]).map((p) => p.id);
    const vacationByStaff: Record<string, VacationRange[]> = {};
    if (profileIds.length) {
        const { data: vac } = await admin
            .from("vacation_requests").select("staff_id, from_date, to_date, status")
            .in("staff_id", profileIds).eq("status", "approved")
            .lte("from_date", to).gte("to_date", from);
        for (const v of (vac ?? []) as {
            staff_id: string;
            from_date: string;
            to_date: string;
        }[]) {
            if (!v.staff_id)
                continue;
            if (!vacationByStaff[v.staff_id])
                vacationByStaff[v.staff_id] = [];
            vacationByStaff[v.staff_id].push({ from: v.from_date, to: v.to_date });
        }
    }
    return {
        shiftById,
        assignmentsByShiftId,
        assignedByStaffAndDate,
        vacationByStaff,
        profilesCount: ((profilesRes.data ?? []) as unknown[]).length,
        facilityStaffCount: ((staffRes.data ?? []) as unknown[]).length,
    };
}
type Removal = {
    staffId: string;
    date: string;
};
function assignedByStaffAndDateWithRemovals(base: Record<string, Record<string, string>>, removals: Removal[]): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [sid, byDate] of Object.entries(base))
        out[sid] = { ...byDate };
    for (const r of removals) {
        if (out[r.staffId])
            delete out[r.staffId][r.date];
    }
    return out;
}
function isOnVacation(ctx: SwapContext, staffId: string, date: string): boolean {
    const ranges = ctx.vacationByStaff[staffId];
    if (!ranges)
        return false;
    return ranges.some((r) => date >= r.from && date <= r.to);
}
function canTakeShift(ctx: SwapContext, shift: SwapShiftRow, candidateStaffId: string, assignedByStaffAndDate: Record<string, Record<string, string>>): boolean {
    if (assignedByStaffAndDate[candidateStaffId]?.[shift.date])
        return false;
    if (isOnVacation(ctx, candidateStaffId, shift.date))
        return false;
    return true;
}
export type SwapParty = {
    staffId: string;
    staffName: string;
    shift: SwapShiftRow;
};
function pickParty(ctx: SwapContext, shiftId: string, staffId?: string, staffName?: string): {
    ok: true;
    row: SwapAssignmentRow;
} | {
    ok: false;
    reason: "none" | "notThisStaff" | "ambiguous";
} {
    const list = ctx.assignmentsByShiftId.get(shiftId) ?? [];
    if (list.length === 0)
        return { ok: false, reason: "none" };
    if (staffId || staffName) {
        const row = list.find((a) => (!!staffId && a.staff_id === staffId) || (!!staffName && a.staff_name === staffName));
        return row ? { ok: true, row } : { ok: false, reason: "notThisStaff" };
    }
    if (list.length === 1)
        return { ok: true, row: list[0] };
    return { ok: false, reason: "ambiguous" };
}
export async function validateSwap(admin: Admin, facilityName: string, requesterShiftId: string, targetShiftId: string, requesterStaffId?: string, targetStaffId?: string, requesterName?: string, targetName?: string): Promise<{
    ok: true;
    requester: SwapParty;
    target: SwapParty;
} | {
    ok: false;
    reason: string;
}> {
    if (requesterShiftId === targetShiftId)
        return { ok: false, reason: "Das sind dieselben Schichten." };
    const today = berlinTodayISO();
    const { data: shiftDateRows } = await admin.from("shifts").select("id, date")
        .eq("facility_name", facilityName).in("id", [requesterShiftId, targetShiftId]);
    const shiftDates = (shiftDateRows ?? []).map((s: {
        date: string;
    }) => s.date);
    if (shiftDates.length < 2)
        return { ok: false, reason: "Eine der beiden Schichten wurde nicht gefunden." };
    const ctx = await loadSwapContext(admin, facilityName, [...shiftDates, today]);
    const requesterShift = ctx.shiftById.get(requesterShiftId);
    const targetShift = ctx.shiftById.get(targetShiftId);
    if (!requesterShift || !targetShift)
        return { ok: false, reason: "Eine der beiden Schichten wurde nicht gefunden." };
    if (requesterShift.station !== targetShift.station) {
        return { ok: false, reason: "Ein Tausch ist nur zwischen Schichten derselben Station möglich." };
    }
    const rPick = pickParty(ctx, requesterShiftId, requesterStaffId, requesterName);
    const tPick = pickParty(ctx, targetShiftId, targetStaffId, targetName);
    if (!rPick.ok) {
        return { ok: false, reason: rPick.reason === "notThisStaff"
                ? "Diese Schicht ist dir nicht (mehr) zugewiesen."
                : rPick.reason === "ambiguous" ? "Für den Tausch muss die konkrete Person angegeben werden."
                    : "Deine Schicht ist aktuell niemandem zugewiesen." };
    }
    if (!tPick.ok) {
        return { ok: false, reason: tPick.reason === "notThisStaff"
                ? "Die gewählte Tausch-Schicht ist dieser Person nicht (mehr) zugewiesen."
                : tPick.reason === "ambiguous" ? "Für den Tausch muss die konkrete Tauschperson angegeben werden."
                    : "Die gewählte Tausch-Schicht ist aktuell niemandem zugewiesen." };
    }
    const requesterAssignment = rPick.row;
    const targetAssignment = tPick.row;
    if (requesterAssignment.staff_id === targetAssignment.staff_id)
        return { ok: false, reason: "Beide Schichten gehören derselben Person." };
    const removals: Removal[] = [
        { staffId: requesterAssignment.staff_id, date: requesterShift.date },
        { staffId: targetAssignment.staff_id, date: targetShift.date },
    ];
    const assignedByStaffAndDate = assignedByStaffAndDateWithRemovals(ctx.assignedByStaffAndDate, removals);
    const targetCanTakeRequesterShift = canTakeShift(ctx, requesterShift, targetAssignment.staff_id, assignedByStaffAndDate);
    const requesterCanTakeTargetShift = canTakeShift(ctx, targetShift, requesterAssignment.staff_id, assignedByStaffAndDate);
    if (!targetCanTakeRequesterShift || !requesterCanTakeTargetShift) {
        return { ok: false, reason: "Der Tausch geht nicht: eine:r der beiden hat an dem Tag bereits eine Schicht oder ist im Urlaub." };
    }
    return {
        ok: true,
        requester: { staffId: requesterAssignment.staff_id, staffName: requesterAssignment.staff_name, shift: requesterShift },
        target: { staffId: targetAssignment.staff_id, staffName: targetAssignment.staff_name, shift: targetShift },
    };
}
export type SwapPartnerOption = {
    staffId: string;
    staffName: string;
    shiftId: string;
    shiftDate: string;
    shiftType: string;
};
export async function findEligibleSwapPartners(admin: Admin, facilityName: string, requesterStaffId: string, requesterShiftId: string, withinDays = 60, requesterName?: string): Promise<SwapPartnerOption[]> {
    const today = berlinTodayISO();
    const horizon = addDaysISO(today, withinDays);
    const ctx = await loadSwapContext(admin, facilityName, [today, horizon]);
    const requesterShift = ctx.shiftById.get(requesterShiftId);
    if (!requesterShift)
        return [];
    const requesterAssignment = (ctx.assignmentsByShiftId.get(requesterShiftId) ?? [])
        .find((a) => a.staff_id === requesterStaffId || (!!requesterName && a.staff_name === requesterName));
    if (!requesterAssignment)
        return [];
    const ownStaffId = requesterAssignment.staff_id;
    const candidateShifts = [...ctx.shiftById.values()].filter((s) => s.id !== requesterShiftId && s.station === requesterShift.station && s.date >= today && s.date <= horizon);
    const results: SwapPartnerOption[] = [];
    for (const candidateShift of candidateShifts) {
        for (const candidateAssignment of ctx.assignmentsByShiftId.get(candidateShift.id) ?? []) {
            if (candidateAssignment.staff_id === ownStaffId)
                continue;
            const removals: Removal[] = [
                { staffId: requesterAssignment.staff_id, date: requesterShift.date },
                { staffId: candidateAssignment.staff_id, date: candidateShift.date },
            ];
            const assignedByStaffAndDate = assignedByStaffAndDateWithRemovals(ctx.assignedByStaffAndDate, removals);
            if (!canTakeShift(ctx, requesterShift, candidateAssignment.staff_id, assignedByStaffAndDate))
                continue;
            if (!canTakeShift(ctx, candidateShift, requesterAssignment.staff_id, assignedByStaffAndDate))
                continue;
            results.push({
                staffId: candidateAssignment.staff_id, staffName: candidateAssignment.staff_name,
                shiftId: candidateShift.id, shiftDate: candidateShift.date, shiftType: candidateShift.shift_type,
            });
        }
    }
    return results.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate)).slice(0, 60);
}
export type AssignedShift = {
    shiftId: string;
    date: string;
    shiftType: string;
    station: string;
};
export async function listAssignedShiftsForStaff(admin: Admin, facilityName: string, staffId: string, withinDays = 60, staffName?: string): Promise<AssignedShift[]> {
    const today = berlinTodayISO();
    const horizon = addDaysISO(today, withinDays);
    const ctx = await loadSwapContext(admin, facilityName, [today, horizon]);
    const out: AssignedShift[] = [];
    for (const shift of ctx.shiftById.values()) {
        if (shift.date < today || shift.date > horizon)
            continue;
        const mine = (ctx.assignmentsByShiftId.get(shift.id) ?? [])
            .some((a) => a.staff_id === staffId || (!!staffName && a.staff_name === staffName));
        if (mine)
            out.push({ shiftId: shift.id, date: shift.date, shiftType: shift.shift_type, station: shift.station });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
export type SwapDiagnosis = {
    today: string;
    horizon: string;
    facility: string;
    staffProfiles: number;
    facilityStaffActive: number;
    windowShifts: number;
    windowAssignments: number;
    ownShiftsUpcoming: number;
    perShift: Array<{
        shiftId: string;
        date: string;
        type: string;
        station: string;
        ownResolvedStaffId: string | null;
        ownAssignmentFound: boolean;
        candidateShifts: number;
        candidateAssignments: number;
        colleaguesWhoCanTakeMyShift: number;
        upcomingShiftsICanTake: number;
        legalSwaps: number;
        samples: Array<{
            colleague: string;
            date: string;
            colleagueCanTakeMine: boolean;
            iCanTakeTheirs: boolean;
            colleagueAlreadyWorksMyDate: boolean;
            iAlreadyWorkTheirDate: boolean;
            colleagueOnVacationMyDate: boolean;
            iOnVacationTheirDate: boolean;
        }>;
    }>;
};
export async function diagnoseSwapForStaff(admin: Admin, facilityName: string, staffId: string, staffName?: string, maxShifts = 6): Promise<SwapDiagnosis> {
    const today = berlinTodayISO();
    const horizon = addDaysISO(today, 60);
    const ctx = await loadSwapContext(admin, facilityName, [today, horizon]);
    let windowAssignments = 0;
    for (const list of ctx.assignmentsByShiftId.values())
        windowAssignments += list.length;
    const matchesMe = (a: SwapAssignmentRow) => a.staff_id === staffId || (!!staffName && a.staff_name === staffName);
    const ownShifts = [...ctx.shiftById.values()]
        .filter((s) => s.date >= today && s.date <= horizon && (ctx.assignmentsByShiftId.get(s.id) ?? []).some(matchesMe))
        .sort((a, b) => a.date.localeCompare(b.date));
    const perShift = ownShifts.slice(0, maxShifts).map((shift) => {
        const own = (ctx.assignmentsByShiftId.get(shift.id) ?? []).find(matchesMe);
        const ownSid = own?.staff_id ?? null;
        const candidateShifts = [...ctx.shiftById.values()].filter((s) => s.id !== shift.id && s.station === shift.station && s.date >= today && s.date <= horizon);
        let candidateAssignments = 0, canTakeMine = 0, iCanTakeTheirs = 0, legal = 0;
        const samples: SwapDiagnosis["perShift"][number]["samples"] = [];
        if (own && ownSid) {
            for (const cs of candidateShifts) {
                for (const ca of ctx.assignmentsByShiftId.get(cs.id) ?? []) {
                    if (ca.staff_id === ownSid)
                        continue;
                    candidateAssignments++;
                    const removals: Removal[] = [
                        { staffId: ownSid, date: shift.date },
                        { staffId: ca.staff_id, date: cs.date },
                    ];
                    const abd = assignedByStaffAndDateWithRemovals(ctx.assignedByStaffAndDate, removals);
                    const colleagueCanTakeMine = canTakeShift(ctx, shift, ca.staff_id, abd);
                    const iCanTake = canTakeShift(ctx, cs, ownSid, abd);
                    if (colleagueCanTakeMine)
                        canTakeMine++;
                    if (iCanTake)
                        iCanTakeTheirs++;
                    if (colleagueCanTakeMine && iCanTake)
                        legal++;
                    else if (samples.length < 8)
                        samples.push({
                            colleague: ca.staff_name, date: cs.date,
                            colleagueCanTakeMine, iCanTakeTheirs: iCanTake,
                            colleagueAlreadyWorksMyDate: !!ctx.assignedByStaffAndDate[ca.staff_id]?.[shift.date],
                            iAlreadyWorkTheirDate: !!ctx.assignedByStaffAndDate[ownSid]?.[cs.date],
                            colleagueOnVacationMyDate: isOnVacation(ctx, ca.staff_id, shift.date),
                            iOnVacationTheirDate: isOnVacation(ctx, ownSid, cs.date),
                        });
                }
            }
        }
        return {
            shiftId: shift.id, date: shift.date, type: shift.shift_type, station: shift.station,
            ownResolvedStaffId: ownSid, ownAssignmentFound: !!own,
            candidateShifts: candidateShifts.length, candidateAssignments,
            colleaguesWhoCanTakeMyShift: canTakeMine, upcomingShiftsICanTake: iCanTakeTheirs, legalSwaps: legal,
            samples,
        };
    });
    return {
        today, horizon, facility: facilityName,
        staffProfiles: ctx.profilesCount, facilityStaffActive: ctx.facilityStaffCount,
        windowShifts: ctx.shiftById.size, windowAssignments,
        ownShiftsUpcoming: ownShifts.length,
        perShift,
    };
}
type RpcError = {
    message?: string;
    code?: string;
} | null;
function rpcMissing(error: RpcError): boolean {
    return funktionFehlt(error);
}
async function executeSwapJs(admin: Admin, facilityName: string, requesterShiftId: string, targetShiftId: string, requester: SwapParty, target: SwapParty): Promise<{
    ok: true;
} | {
    ok: false;
    reason: string;
}> {
    const { data: assignments } = await admin.from("shift_assignments").select("id, shift_id, staff_id, staff_name, status")
        .eq("facility_name", facilityName).in("shift_id", [requesterShiftId, targetShiftId]);
    const rows = ((assignments ?? []) as {
        id: string;
        shift_id: string;
        staff_id: string | null;
        staff_name: string | null;
        status?: string | null;
    }[])
        .filter((a) => zaehltAlsBesetzt(a.status));
    const rowFor = (shiftId: string, party: SwapParty) => rows.find((a) => a.shift_id === shiftId && a.staff_id != null && a.staff_id === party.staffId)
        ?? rows.find((a) => a.shift_id === shiftId && a.staff_name === party.staffName);
    const requesterRow = rowFor(requesterShiftId, requester);
    const targetRow = rowFor(targetShiftId, target);
    if (!requesterRow || !targetRow)
        return { ok: false, reason: "Eine der beiden Zuweisungen wurde in der Zwischenzeit geändert." };
    const [r1, r2] = await Promise.all([
        admin.from("shift_assignments").update({ staff_id: targetRow.staff_id, staff_name: targetRow.staff_name }).eq("id", requesterRow.id),
        admin.from("shift_assignments").update({ staff_id: requesterRow.staff_id, staff_name: requesterRow.staff_name }).eq("id", targetRow.id),
    ]);
    if (r1.error || r2.error)
        return { ok: false, reason: "Die Schichten konnten nicht getauscht werden." };
    return { ok: true };
}
export async function executeSwap(admin: Admin, facilityName: string, requesterShiftId: string, targetShiftId: string, requesterStaffId?: string, targetStaffId?: string, requesterName?: string, targetName?: string): Promise<{
    ok: true;
} | {
    ok: false;
    reason: string;
}> {
    const revalidated = await validateSwap(admin, facilityName, requesterShiftId, targetShiftId, requesterStaffId, targetStaffId, requesterName, targetName);
    if (!revalidated.ok)
        return revalidated;
    const { requester, target } = revalidated;
    const rpc = (admin as unknown as {
        rpc?: (fn: string, args: Record<string, unknown>) => Promise<{
            data: unknown;
            error: RpcError;
        }>;
    }).rpc;
    if (typeof rpc === "function") {
        const { data, error } = await rpc.call(admin, "execute_shift_swap", {
            p_facility: facilityName,
            p_requester_shift: requesterShiftId, p_target_shift: targetShiftId,
            p_requester_staff: requester.staffId, p_target_staff: target.staffId,
            p_requester_name: requester.staffName, p_target_name: target.staffName,
        });
        if (!error) {
            const res = data as {
                ok?: boolean;
                reason?: string;
            } | null;
            if (res?.ok)
                return { ok: true };
            return { ok: false, reason: "Eine der beiden Zuweisungen wurde in der Zwischenzeit geändert." };
        }
        if (!rpcMissing(error))
            return { ok: false, reason: "Die Schichten konnten nicht getauscht werden." };
    }
    return executeSwapJs(admin, facilityName, requesterShiftId, targetShiftId, requester, target);
}

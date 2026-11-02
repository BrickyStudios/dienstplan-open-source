import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyStaffByName } from "@/lib/notify";
type Admin = SupabaseClient<any>;
const BATCH = 200;
export type VacationAutoApproveResult = {
    autoApprove: boolean;
    affectedShifts: number;
    blockedShifts: number;
};
type AssignRow = {
    staff_id: string | null;
    staff_name: string | null;
    status: string | null;
};
type ShiftRow = {
    id: string;
    date: string;
    planned_staff: number | null;
};
export async function evaluateVacationAutoApprove(admin: Admin, facilityName: string, staffId: string, staffName: string | null, fromDate: string, toDate: string): Promise<VacationAutoApproveResult> {
    const FAIL: VacationAutoApproveResult = { autoApprove: false, affectedShifts: 0, blockedShifts: 0 };
    try {
        const { data: shiftsInRange, error: shiftsErr } = await admin
            .from("shifts")
            .select("id, date, planned_staff")
            .eq("facility_name", facilityName)
            .gte("date", fromDate)
            .lte("date", toDate)
            .order("id");
        if (shiftsErr)
            return FAIL;
        const shifts = (shiftsInRange ?? []) as ShiftRow[];
        if (shifts.length === 0)
            return { autoApprove: true, affectedShifts: 0, blockedShifts: 0 };
        const shiftById = new Map(shifts.map(s => [s.id, s]));
        const rangeShiftIds = shifts.map(s => s.id);
        const assignmentsByShift = new Map<string, AssignRow[]>();
        for (let i = 0; i < rangeShiftIds.length; i += BATCH) {
            const chunk = rangeShiftIds.slice(i, i + BATCH);
            const { data: assignRows, error: assignErr } = await admin
                .from("shift_assignments")
                .select("shift_id, staff_id, staff_name, status")
                .eq("facility_name", facilityName)
                .in("shift_id", chunk);
            if (assignErr)
                return FAIL;
            for (const a of (assignRows ?? []) as (AssignRow & {
                shift_id: string;
            })[]) {
                const row: AssignRow = { staff_id: a.staff_id, staff_name: a.staff_name, status: a.status };
                const list = assignmentsByShift.get(a.shift_id);
                if (list)
                    list.push(row);
                else
                    assignmentsByShift.set(a.shift_id, [row]);
            }
        }
        const notCancelled = (a: AssignRow) => (a.status ?? "confirmed") !== "cancelled";
        const matchesRequester = (a: AssignRow) => (!!staffId && a.staff_id === staffId) || (!!staffName && a.staff_name === staffName);
        const affectedShiftIds = rangeShiftIds.filter(id => (assignmentsByShift.get(id) ?? []).some(a => notCancelled(a) && matchesRequester(a)));
        if (affectedShiftIds.length === 0)
            return { autoApprove: true, affectedShifts: 0, blockedShifts: 0 };
        const otherNames = new Set<string>();
        for (const id of affectedShiftIds) {
            for (const a of assignmentsByShift.get(id) ?? []) {
                if (!notCancelled(a) || matchesRequester(a) || !a.staff_name)
                    continue;
                otherNames.add(a.staff_name);
            }
        }
        const approvedVacationByName = new Map<string, {
            from: string;
            to: string;
        }[]>();
        if (otherNames.size > 0) {
            const namesArr = [...otherNames];
            const [staffDirRes, profileDirRes] = await Promise.all([
                admin.from("facility_staff").select("id, full_name").eq("facility_name", facilityName).in("full_name", namesArr),
                admin.from("user_profiles").select("id, full_name").eq("facility", facilityName).in("full_name", namesArr),
            ]);
            if (staffDirRes.error || profileDirRes.error)
                return FAIL;
            const idsByName = new Map<string, Set<string>>();
            const addId = (name: string | null | undefined, id: string | null | undefined) => {
                if (!name || !id)
                    return;
                if (!idsByName.has(name))
                    idsByName.set(name, new Set());
                idsByName.get(name)!.add(id);
            };
            for (const s of (staffDirRes.data ?? []) as {
                id: string;
                full_name: string | null;
            }[])
                addId(s.full_name, s.id);
            for (const p of (profileDirRes.data ?? []) as {
                id: string;
                full_name: string | null;
            }[])
                addId(p.full_name, p.id);
            const nameByOtherId = new Map<string, string[]>();
            const allOtherIds: string[] = [];
            for (const [name, ids] of idsByName) {
                for (const id of ids) {
                    allOtherIds.push(id);
                    if (!nameByOtherId.has(id))
                        nameByOtherId.set(id, []);
                    nameByOtherId.get(id)!.push(name);
                }
            }
            if (allOtherIds.length > 0) {
                for (let i = 0; i < allOtherIds.length; i += BATCH) {
                    const chunk = allOtherIds.slice(i, i + BATCH);
                    const { data: vacs, error: vacErr } = await admin
                        .from("vacation_requests")
                        .select("staff_id, from_date, to_date")
                        .eq("status", "approved")
                        .in("staff_id", chunk)
                        .lte("from_date", toDate)
                        .gte("to_date", fromDate);
                    if (vacErr)
                        return FAIL;
                    for (const v of (vacs ?? []) as {
                        staff_id: string;
                        from_date: string;
                        to_date: string;
                    }[]) {
                        const names = nameByOtherId.get(v.staff_id) ?? [];
                        for (const name of names) {
                            if (!approvedVacationByName.has(name))
                                approvedVacationByName.set(name, []);
                            approvedVacationByName.get(name)!.push({ from: v.from_date, to: v.to_date });
                        }
                    }
                }
            }
        }
        const onApprovedVacation = (name: string | null, date: string): boolean => {
            if (!name)
                return false;
            const ranges = approvedVacationByName.get(name);
            if (!ranges)
                return false;
            return ranges.some(r => date >= r.from && date <= r.to);
        };
        let blocked = 0;
        for (const id of affectedShiftIds) {
            const shift = shiftById.get(id)!;
            const filled = (assignmentsByShift.get(id) ?? []).filter(a => notCancelled(a) && !matchesRequester(a) && !onApprovedVacation(a.staff_name, shift.date)).length;
            const planned = Number(shift.planned_staff) || 1;
            if (planned - filled > 0)
                blocked++;
        }
        return { autoApprove: blocked === 0, affectedShifts: affectedShiftIds.length, blockedShifts: blocked };
    }
    catch {
        return FAIL;
    }
}
export async function hasSufficientVacationEntitlement(admin: Admin, staffId: string, requestedDays: number): Promise<boolean | null> {
    const balance = await getVacationBalance(admin, staffId, ["approved"]);
    if (!balance)
        return null;
    return balance.used + requestedDays <= balance.total;
}
export type VacationBalance = {
    total: number;
    used: number;
    remaining: number;
};
export async function getVacationBalance(admin: Admin, staffId: string, countStatuses: string[] = ["approved"]): Promise<VacationBalance | null> {
    try {
        const { data: profile, error: profErr } = await admin
            .from("user_profiles")
            .select("vacation_days, vacation_bonus_days")
            .eq("id", staffId)
            .maybeSingle();
        if (profErr)
            return null;
        const p = profile as {
            vacation_days?: number | null;
            vacation_bonus_days?: number | null;
        } | null;
        const base = Number.isFinite(Number(p?.vacation_days)) ? Number(p?.vacation_days) : 30;
        const bonus = Number.isFinite(Number(p?.vacation_bonus_days)) ? Number(p?.vacation_bonus_days) : 0;
        const total = base + bonus;
        const { data: counted, error: cntErr } = await admin
            .from("vacation_requests")
            .select("days")
            .eq("staff_id", staffId)
            .in("status", countStatuses);
        if (cntErr)
            return null;
        const used = (counted ?? []).reduce((sum, r) => sum + (Number((r as {
            days: number | null;
        }).days) || 0), 0);
        return { total, used, remaining: total - used };
    }
    catch {
        return null;
    }
}
export type CreateVacationRequestResult = {
    ok: true;
    request: Record<string, unknown>;
    autoApproved: boolean;
} | {
    ok: false;
    error: string;
};
export async function createVacationRequest(admin: Admin, opts: {
    staffId: string;
    fromDate: string;
    toDate: string;
    days?: number;
    reason?: string | null;
}): Promise<CreateVacationRequestResult> {
    const { staffId, fromDate, toDate } = opts;
    const days = Number.isFinite(opts.days) ? Number(opts.days) : 0;
    const reason = opts.reason?.trim() ? opts.reason.trim() : null;
    const { data, error } = await admin
        .from("vacation_requests")
        .insert({ staff_id: staffId, from_date: fromDate, to_date: toDate, days, reason, status: "pending" })
        .select()
        .single();
    if (error)
        return { ok: false, error: error.message };
    let autoApproved = false;
    try {
        const { data: profile } = await admin
            .from("user_profiles").select("facility, full_name").eq("id", staffId).maybeSingle();
        const facilityName = (profile?.facility as string | undefined) ?? "";
        const staffName = (profile?.full_name as string | undefined) ?? null;
        if (facilityName) {
            const { data: settings } = await admin
                .from("facility_settings").select("vacation_auto_approve").eq("facility_name", facilityName).maybeSingle();
            if (settings?.vacation_auto_approve) {
                const [evalResult, entitlementOk] = await Promise.all([
                    evaluateVacationAutoApprove(admin, facilityName, staffId, staffName, fromDate, toDate),
                    hasSufficientVacationEntitlement(admin, staffId, days),
                ]);
                if (evalResult.autoApprove && entitlementOk === true) {
                    const { data: approved } = await admin
                        .from("vacation_requests").update({ status: "approved" }).eq("id", data.id).select().single();
                    if (approved) {
                        Object.assign(data, approved);
                        autoApproved = true;
                        if (staffName) {
                            await notifyStaffByName(admin, facilityName, staffName, "Urlaubsantrag automatisch genehmigt", `Dein Urlaubsantrag (${fromDate} – ${toDate}) wurde automatisch genehmigt — die Besetzung bleibt gedeckt.`);
                        }
                    }
                }
            }
        }
    }
    catch {
    }
    return { ok: true, request: data as Record<string, unknown>, autoApproved };
}

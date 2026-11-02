import type { SupabaseClient } from "@supabase/supabase-js";
import { istFachkraft } from "@/lib/qualifikation";
import { spalteFehlt } from "@/lib/db-fehler";
type Admin = SupabaseClient<any>;
const DEFAULT_QUOTE = 0.5;
type StaffZeile = {
    id: string;
    full_name: string | null;
    role: string | null;
    qualifikation?: string | null;
    qualifikation_bestaetigt?: boolean | null;
};
async function ladeBelegschaft(admin: Admin, facility: string): Promise<StaffZeile[]> {
    const mit = await admin.from("facility_staff")
        .select("id, full_name, role, qualifikation, qualifikation_bestaetigt")
        .eq("facility_name", facility);
    if (!mit.error)
        return (mit.data ?? []) as StaffZeile[];
    if (!spalteFehlt(mit.error))
        return [];
    const ohne = await admin.from("facility_staff")
        .select("id, full_name, role")
        .eq("facility_name", facility);
    return (ohne.data ?? []) as StaffZeile[];
}
export type SwapPpbvParams = {
    requesterShiftId: string;
    targetShiftId: string;
    requesterStaffId?: string | null;
    targetStaffId?: string | null;
    requesterName?: string | null;
    targetName?: string | null;
};
export type PpbvViolation = {
    shiftId: string;
    date: string;
    station: string;
    shiftType: string;
    qualifiedBefore: number;
    qualifiedAfter: number;
    required: number;
};
export type SwapPpbvResult = {
    ok: boolean;
    reason: string;
    violations: PpbvViolation[];
    quote: number;
};
type ShiftRow = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number;
};
type AssignRow = {
    shift_id: string;
    staff_id: string | null;
    staff_name: string | null;
    status: string | null;
};
export async function assessSwapPpbv(admin: Admin, facility: string, p: SwapPpbvParams): Promise<SwapPpbvResult> {
    let quote = DEFAULT_QUOTE;
    try {
        const { data } = await admin.from("facility_settings").select("fachkraft_quote").eq("facility_name", facility).maybeSingle();
        const q = Number((data as {
            fachkraft_quote?: number;
        } | null)?.fachkraft_quote);
        if (Number.isFinite(q) && q > 0 && q <= 1)
            quote = q;
    }
    catch { }
    const [shiftsRes, exemptRes, assignRes, staffRes] = await Promise.all([
        admin.from("shifts").select("id, station, date, shift_type, planned_staff")
            .eq("facility_name", facility).in("id", [p.requesterShiftId, p.targetShiftId]),
        admin.from("stations").select("name, ppbv_exempt").eq("facility_name", facility),
        admin.from("shift_assignments").select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facility).in("shift_id", [p.requesterShiftId, p.targetShiftId]),
        ladeBelegschaft(admin, facility),
    ]);
    const shifts = (shiftsRes.data ?? []) as ShiftRow[];
    const reqShift = shifts.find(s => s.id === p.requesterShiftId);
    const tgtShift = shifts.find(s => s.id === p.targetShiftId);
    if (!reqShift || !tgtShift)
        return { ok: true, reason: "", violations: [], quote };
    const exempt = new Set(((exemptRes.data ?? []) as {
        name: string;
        ppbv_exempt?: boolean;
    }[])
        .filter(r => r.ppbv_exempt).map(r => r.name));
    const assignments = ((assignRes.data ?? []) as AssignRow[]).filter(a => (a.status ?? "confirmed") === "confirmed");
    type StaffRow = {
        id: string;
        full_name: string | null;
        role: string | null;
        qualifikation?: string | null;
        qualifikation_bestaetigt?: boolean | null;
    };
    const personById = new Map<string, StaffRow>();
    const personByName = new Map<string, StaffRow>();
    for (const s of staffRes) {
        if (s.id)
            personById.set(s.id, s);
        if (s.full_name)
            personByName.set(s.full_name, s);
    }
    const lookupPerson = (id?: string | null, name?: string | null): StaffRow | null => (id ? personById.get(id) : undefined) ?? (name ? personByName.get(name) : undefined) ?? null;
    const isQualified = (person: StaffRow | null) => (person ? istFachkraft(person) : false);
    const qualifiedOf = (a: AssignRow) => isQualified(lookupPerson(a.staff_id, a.staff_name));
    const requesterQualified = isQualified(lookupPerson(p.requesterStaffId, p.requesterName));
    const targetQualified = isQualified(lookupPerson(p.targetStaffId, p.targetName));
    if (requesterQualified === targetQualified)
        return { ok: true, reason: "", violations: [], quote };
    const violations: PpbvViolation[] = [];
    const check = (shift: ShiftRow, incomingQualified: boolean, outId?: string | null, outName?: string | null) => {
        if (exempt.has(shift.station))
            return;
        const onShift = assignments.filter(a => a.shift_id === shift.id);
        const assignedCount = onShift.length;
        if (assignedCount === 0)
            return;
        const qualifiedBefore = onShift.filter(qualifiedOf).length;
        const outgoingQualified = onShift.some(a => ((!!outId && a.staff_id === outId) || (!!outName && a.staff_name === outName)) && qualifiedOf(a));
        const qualifiedAfter = qualifiedBefore - (outgoingQualified ? 1 : 0) + (incomingQualified ? 1 : 0);
        const required = Math.ceil(assignedCount * quote);
        if (qualifiedAfter < required && qualifiedAfter < qualifiedBefore) {
            violations.push({ shiftId: shift.id, date: shift.date, station: shift.station, shiftType: shift.shift_type, qualifiedBefore, qualifiedAfter, required });
        }
    };
    check(reqShift, targetQualified, p.requesterStaffId, p.requesterName);
    check(tgtShift, requesterQualified, p.targetStaffId, p.targetName);
    if (violations.length === 0)
        return { ok: true, reason: "", violations: [], quote };
    const v = violations[0];
    const pct = Math.round(quote * 100);
    return {
        ok: false,
        reason: `Der Tausch würde die Fachkraftquote (${pct} %) unterschreiten: Die Schicht am ${v.date} (${v.station}) hätte danach nur ${v.qualifiedAfter} statt ${v.required} nötige Pflegefachkräfte.`,
        violations, quote,
    };
}
export type ReplacementPpbvParams = {
    shiftId: string;
    outgoingStaffId?: string | null;
    outgoingName?: string | null;
    incomingStaffId?: string | null;
    incomingName?: string | null;
};
export async function assessReplacementPpbv(admin: Admin, facility: string, p: ReplacementPpbvParams): Promise<SwapPpbvResult> {
    let quote = DEFAULT_QUOTE;
    try {
        const { data } = await admin.from("facility_settings").select("fachkraft_quote").eq("facility_name", facility).maybeSingle();
        const q = Number((data as {
            fachkraft_quote?: number;
        } | null)?.fachkraft_quote);
        if (Number.isFinite(q) && q > 0 && q <= 1)
            quote = q;
    }
    catch { }
    const [shiftRes, exemptRes, assignRes, staffRes] = await Promise.all([
        admin.from("shifts").select("id, station, date, shift_type, planned_staff")
            .eq("facility_name", facility).eq("id", p.shiftId).maybeSingle(),
        admin.from("stations").select("name, ppbv_exempt").eq("facility_name", facility),
        admin.from("shift_assignments").select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facility).eq("shift_id", p.shiftId),
        ladeBelegschaft(admin, facility),
    ]);
    const shift = shiftRes.data as ShiftRow | null;
    if (!shift)
        return { ok: true, reason: "", violations: [], quote };
    const exempt = new Set(((exemptRes.data ?? []) as {
        name: string;
        ppbv_exempt?: boolean;
    }[])
        .filter(r => r.ppbv_exempt).map(r => r.name));
    if (exempt.has(shift.station))
        return { ok: true, reason: "", violations: [], quote };
    const onShift = ((assignRes.data ?? []) as AssignRow[]).filter(a => (a.status ?? "confirmed") === "confirmed");
    if (onShift.length === 0)
        return { ok: true, reason: "", violations: [], quote };
    type StaffRow2 = {
        id: string;
        full_name: string | null;
        role: string | null;
        qualifikation?: string | null;
        qualifikation_bestaetigt?: boolean | null;
    };
    const personById = new Map<string, StaffRow2>();
    const personByName = new Map<string, StaffRow2>();
    for (const s of staffRes) {
        if (s.id)
            personById.set(s.id, s);
        if (s.full_name)
            personByName.set(s.full_name, s);
    }
    const fachkraft = (id?: string | null, name?: string | null) => {
        const person = (id ? personById.get(id) : undefined) ?? (name ? personByName.get(name) : undefined);
        return person ? istFachkraft(person) : false;
    };
    const qualifiedBefore = onShift.filter(a => fachkraft(a.staff_id, a.staff_name)).length;
    const outgoingQualified = onShift.some(a => ((!!p.outgoingStaffId && a.staff_id === p.outgoingStaffId) || (!!p.outgoingName && a.staff_name === p.outgoingName))
        && fachkraft(a.staff_id, a.staff_name));
    const hatNachfolge = !!(p.incomingStaffId || p.incomingName);
    const incomingQualified = hatNachfolge && fachkraft(p.incomingStaffId, p.incomingName);
    const besetztNachher = onShift.length - 1 + (hatNachfolge ? 1 : 0);
    const qualifiedAfter = qualifiedBefore - (outgoingQualified ? 1 : 0) + (incomingQualified ? 1 : 0);
    const required = Math.ceil(Math.max(0, besetztNachher) * quote);
    if (qualifiedAfter >= required || qualifiedAfter >= qualifiedBefore) {
        return { ok: true, reason: "", violations: [], quote };
    }
    const pct = Math.round(quote * 100);
    const violation: PpbvViolation = {
        shiftId: shift.id, date: shift.date, station: shift.station, shiftType: shift.shift_type,
        qualifiedBefore, qualifiedAfter, required,
    };
    return {
        ok: false,
        reason: hatNachfolge
            ? `Die Übernahme würde die Fachkraftquote (${pct} %) unterschreiten: Die Schicht am ${shift.date} (${shift.station}) hätte danach nur ${qualifiedAfter} statt ${required} nötige Pflegefachkräfte.`
            : `Ohne Ersatz würde die Fachkraftquote (${pct} %) unterschritten: Die Schicht am ${shift.date} (${shift.station}) hätte danach nur ${qualifiedAfter} statt ${required} nötige Pflegefachkräfte.`,
        violations: [violation], quote,
    };
}

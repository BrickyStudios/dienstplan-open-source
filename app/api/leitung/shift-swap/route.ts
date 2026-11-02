import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { findEligibleSwapPartners, listAssignedShiftsForStaff, validateSwap, executeSwap } from "@/lib/shift-swap";
import { assessSwapRuhezeit } from "@/lib/swap-ruhezeit";
import { notifyLeitung, notifyStaffByName } from "@/lib/notify";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const facility = ctx.facilityName;
    const action = req.nextUrl.searchParams.get("action") ?? "staff";
    const staffId = req.nextUrl.searchParams.get("staff_id");
    const shiftId = req.nextUrl.searchParams.get("shift_id");
    if (action === "staff") {
        const { data } = await admin
            .from("user_profiles").select("id, full_name, station")
            .eq("facility", facility).eq("role", "mitarbeiter").order("full_name");
        return NextResponse.json({ staff: data ?? [] });
    }
    if (action === "shifts") {
        if (!staffId)
            return NextResponse.json({ error: "staff_id erforderlich" }, { status: 400 });
        const { data: sp } = await admin.from("user_profiles").select("full_name").eq("id", staffId).maybeSingle();
        const shifts = await listAssignedShiftsForStaff(admin, facility, staffId, 60, sp?.full_name ?? undefined);
        return NextResponse.json({ shifts });
    }
    if (action === "partners") {
        if (!staffId || !shiftId)
            return NextResponse.json({ error: "staff_id und shift_id erforderlich" }, { status: 400 });
        const { data: sp } = await admin.from("user_profiles").select("full_name").eq("id", staffId).maybeSingle();
        const options = await findEligibleSwapPartners(admin, facility, staffId, shiftId, 60, sp?.full_name ?? undefined);
        return NextResponse.json({ options });
    }
    return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const requesterStaffId = typeof body.requester_staff_id === "string" ? body.requester_staff_id : null;
    const requesterShiftId = typeof body.requester_shift_id === "string" ? body.requester_shift_id : null;
    const targetStaffId = typeof body.target_staff_id === "string" ? body.target_staff_id : null;
    const targetShiftId = typeof body.target_shift_id === "string" ? body.target_shift_id : null;
    const reason = (typeof body.reason === "string" && body.reason.trim()) || "Von der Leitung durchgeführt.";
    if (!requesterStaffId || !requesterShiftId || !targetStaffId || !targetShiftId) {
        return NextResponse.json({ error: "Beide Personen und beide Schichten sind erforderlich" }, { status: 400 });
    }
    const admin = createAdminClient();
    const facility = ctx.facilityName;
    const [{ data: rp }, { data: tp }] = await Promise.all([
        admin.from("user_profiles").select("full_name").eq("id", requesterStaffId).maybeSingle(),
        admin.from("user_profiles").select("full_name").eq("id", targetStaffId).maybeSingle(),
    ]);
    const reqName = rp?.full_name ?? undefined;
    const tgtName = tp?.full_name ?? undefined;
    const validation = await validateSwap(admin, facility, requesterShiftId, targetShiftId, requesterStaffId, targetStaffId, reqName, tgtName);
    if (!validation.ok)
        return NextResponse.json({ error: validation.reason }, { status: 400 });
    const result = await executeSwap(admin, facility, requesterShiftId, targetShiftId, requesterStaffId, targetStaffId, reqName, tgtName);
    if (!result.ok)
        return NextResponse.json({ error: result.reason }, { status: 409 });
    const { requester, target } = validation;
    const now = new Date().toISOString();
    await admin.from("shift_swap_requests").insert({
        facility_name: facility,
        requester_staff_id: requester.staffId, requester_staff_name: requester.staffName,
        requester_shift_id: requesterShiftId, requester_shift_date: requester.shift.date, requester_shift_type: requester.shift.shift_type,
        target_staff_id: target.staffId, target_staff_name: target.staffName,
        target_shift_id: targetShiftId, target_shift_date: target.shift.date, target_shift_type: target.shift.shift_type,
        reason, mode: "leitung_only", status: "approved",
        leitung_decided_at: now, colleague_decided_at: now, resolved_at: now,
    }).then(() => { }, () => { });
    await notifyStaffByName(admin, facility, requester.staffName, "Schichttausch durchgeführt", `Die Leitung hat deine Schicht am ${requester.shift.date} (${requester.shift.shift_type}) gegen die von ${target.staffName} am ${target.shift.date} (${target.shift.shift_type}) getauscht.`);
    await notifyStaffByName(admin, facility, target.staffName, "Schichttausch durchgeführt", `Die Leitung hat deine Schicht am ${target.shift.date} (${target.shift.shift_type}) gegen die von ${requester.staffName} am ${requester.shift.date} (${requester.shift.shift_type}) getauscht.`);
    const ruhezeit = await assessSwapRuhezeit(admin, facility, {
        requesterShiftId, targetShiftId,
        requesterStaffId: requester.staffId, targetStaffId: target.staffId,
        requesterName: requester.staffName, targetName: target.staffName,
    }).catch(() => null);
    if (ruhezeit?.warn) {
        await notifyLeitung(admin, facility, "Schichttausch: Ruhezeit unter 11 h", `${requester.staffName} ↔ ${target.staffName}: ${ruhezeit.reason}`);
    }
    return NextResponse.json({
        ok: true, requester: requester.staffName, target: target.staffName,
        ruhezeitWarnung: ruhezeit?.warn ? ruhezeit.reason : null,
    });
}

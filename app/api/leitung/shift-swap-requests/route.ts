import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { validateSwap } from "@/lib/shift-swap";
import { notifyStaffByName } from "@/lib/notify";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("shift_swap_requests").select("*")
        .eq("facility_name", ctx.facilityName)
        .order("created_at", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ requests: data ?? [] });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    const status = body.status === "approved" || body.status === "declined" ? body.status : null;
    if (!id || !status)
        return NextResponse.json({ error: "ID und Status erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: reqRow } = await admin.from("shift_swap_requests")
        .update({ leitung_decided_at: now })
        .eq("id", id).eq("facility_name", ctx.facilityName).eq("status", "pending_leitung")
        .is("leitung_decided_at", null)
        .select("*").maybeSingle();
    if (!reqRow)
        return NextResponse.json({ error: "Anfrage nicht gefunden oder nicht mehr offen" }, { status: 404 });
    if (status === "declined") {
        await admin.from("shift_swap_requests").update({ status: "declined_by_leitung", leitung_decided_at: now, resolved_at: now }).eq("id", id);
        await notifyStaffByName(admin, ctx.facilityName, reqRow.requester_staff_name, "Schichttausch abgelehnt", `Die Leitung hat deine Tausch-Anfrage mit ${reqRow.target_staff_name} abgelehnt.`);
        return NextResponse.json({ ok: true, status: "declined_by_leitung" });
    }
    const revalidated = await validateSwap(admin, ctx.facilityName, reqRow.requester_shift_id, reqRow.target_shift_id, reqRow.requester_staff_id, reqRow.target_staff_id, reqRow.requester_staff_name, reqRow.target_staff_name);
    if (!revalidated.ok) {
        await admin.from("shift_swap_requests").update({ status: "failed", leitung_decided_at: now, resolved_at: now }).eq("id", id);
        await notifyStaffByName(admin, ctx.facilityName, reqRow.requester_staff_name, "Schichttausch nicht mehr möglich", revalidated.reason);
        return NextResponse.json({ error: revalidated.reason }, { status: 409 });
    }
    await admin.from("shift_swap_requests").update({ status: "pending_colleague", leitung_decided_at: now }).eq("id", id);
    await notifyStaffByName(admin, ctx.facilityName, reqRow.target_staff_name, "Schichttausch-Anfrage", `${reqRow.requester_staff_name} möchte deine Schicht am ${reqRow.target_shift_date} (${reqRow.target_shift_type}) gegen die eigene am ${reqRow.requester_shift_date} (${reqRow.requester_shift_type}) tauschen. Grund: ${reqRow.reason}. Die Leitung hat bereits zugestimmt.`);
    return NextResponse.json({ ok: true, status: "pending_colleague" });
}

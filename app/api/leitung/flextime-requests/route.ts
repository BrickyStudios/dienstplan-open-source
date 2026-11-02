import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
const ALLOWED_STATUS = ["pending", "approved", "declined"];
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("flextime_requests")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .order("submitted_at", { ascending: false });
    if (tabelleFehlt(error))
        return NextResponse.json({ requests: [], tableMissing: true });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    const staffIds = [...new Set((data ?? []).map((r: {
            staff_id: string;
        }) => r.staff_id))];
    const nameById: Record<string, string> = {};
    const balanceById: Record<string, number> = {};
    if (staffIds.length > 0) {
        const { data: profs } = await admin
            .from("user_profiles")
            .select("id, full_name, flextime_hours")
            .in("id", staffIds);
        for (const p of profs ?? []) {
            nameById[p.id] = p.full_name ?? "Mitarbeiter";
            balanceById[p.id] = Number(p.flextime_hours) || 0;
        }
    }
    const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        staffName: nameById[r.staff_id as string] ?? "Mitarbeiter",
        staffBalanceHours: balanceById[r.staff_id as string] ?? 0,
    }));
    return NextResponse.json({ requests: enriched });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, status, review_note } = await req.json().catch(() => ({}));
    if (!id || !status)
        return NextResponse.json({ error: "ID und Status erforderlich" }, { status: 400 });
    if (!ALLOWED_STATUS.includes(status)) {
        return NextResponse.json({ error: "Unbekannter Status" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: request, error: reqErr } = await admin
        .from("flextime_requests")
        .select("id, staff_id, status, hours")
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .maybeSingle();
    if (tabelleFehlt(reqErr)) {
        return NextResponse.json({ error: "Gleitzeit ist noch nicht eingerichtet", tableMissing: true }, { status: 503 });
    }
    if (!request)
        return NextResponse.json({ error: "Antrag nicht gefunden" }, { status: 404 });
    const wasApproved = request.status === "approved";
    const willBeApproved = status === "approved";
    const hours = Number(request.hours) || 0;
    if (!wasApproved && willBeApproved) {
        const { data: prof } = await admin
            .from("user_profiles").select("id, flextime_hours").eq("id", request.staff_id).maybeSingle();
        if (!prof)
            return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
        const balance = Number(prof.flextime_hours) || 0;
        if (hours > balance) {
            return NextResponse.json({
                error: `Nicht genug Gleitzeitguthaben: ${round2(balance)} h vorhanden, ${round2(hours)} h nötig`,
            }, { status: 400 });
        }
        const { error: balErr } = await admin
            .from("user_profiles")
            .update({ flextime_hours: round2(balance - hours) })
            .eq("id", request.staff_id);
        if (balErr)
            return NextResponse.json({ error: balErr.message }, { status: 500 });
    }
    else if (wasApproved && !willBeApproved) {
        const { data: prof } = await admin
            .from("user_profiles").select("id, flextime_hours").eq("id", request.staff_id).maybeSingle();
        if (prof) {
            await admin
                .from("user_profiles")
                .update({ flextime_hours: round2((Number(prof.flextime_hours) || 0) + hours) })
                .eq("id", request.staff_id);
        }
    }
    const { error } = await admin
        .from("flextime_requests")
        .update({
        status,
        review_note: typeof review_note === "string" && review_note.trim() ? review_note.trim() : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: ctx.userId,
    })
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

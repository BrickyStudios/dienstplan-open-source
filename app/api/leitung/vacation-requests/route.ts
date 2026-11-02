import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
const ALLOWED_STATUS = ["pending", "approved", "declined"];
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data: staffList } = await admin
        .from("user_profiles")
        .select("id, full_name")
        .eq("facility", ctx.facilityName)
        .in("role", ["mitarbeiter", "demo"]);
    if (!staffList || staffList.length === 0) {
        return NextResponse.json({ requests: [] });
    }
    const staffIds = staffList.map((s: {
        id: string;
    }) => s.id);
    const profileMap: Record<string, string> = Object.fromEntries(staffList.map((s: {
        id: string;
        full_name: string;
    }) => [s.id, s.full_name]));
    const { data, error } = await admin
        .from("vacation_requests")
        .select("*")
        .in("staff_id", staffIds)
        .order("submitted_at", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    const enriched = (data ?? []).map((r: Record<string, string>) => ({
        ...r,
        staffName: profileMap[r.staff_id] ?? "Mitarbeiter",
    }));
    return NextResponse.json({ requests: enriched });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, status } = await req.json().catch(() => ({}));
    if (!id || !status)
        return NextResponse.json({ error: "ID und Status erforderlich" }, { status: 400 });
    if (!ALLOWED_STATUS.includes(status)) {
        return NextResponse.json({ error: "Unbekannter Status" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: request } = await admin
        .from("vacation_requests")
        .select("staff_id")
        .eq("id", id)
        .maybeSingle();
    if (!request)
        return NextResponse.json({ error: "Antrag nicht gefunden" }, { status: 404 });
    const { data: staff } = await admin
        .from("user_profiles")
        .select("id")
        .eq("id", request.staff_id)
        .eq("facility", ctx.facilityName)
        .maybeSingle();
    if (!staff)
        return NextResponse.json({ error: "Antrag nicht gefunden" }, { status: 404 });
    const { error } = await admin.from("vacation_requests").update({ status }).eq("id", id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const facility = ctx.facilityName;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staff_wishes")
        .select("*")
        .eq("facility_name", facility)
        .order("created_at", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ wishes: data ?? [] });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, status } = await req.json();
    if (!id || !status)
        return NextResponse.json({ error: "ID und Status erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin.from("staff_wishes").update({ status }).eq("id", id).eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

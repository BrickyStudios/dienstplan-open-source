import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { user_id, archived } = await req.json();
    if (!user_id || typeof archived !== "boolean") {
        return NextResponse.json({ error: "Ungültige Parameter" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: target } = await admin
        .from("user_profiles")
        .select("facility, role")
        .eq("id", user_id)
        .single();
    if (!target || !sameFacility(target.facility, ctx.facilityName) || target.role !== "mitarbeiter") {
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }
    const { error } = await admin
        .from("user_profiles")
        .update({ archived })
        .eq("id", user_id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

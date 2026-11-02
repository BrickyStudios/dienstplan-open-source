import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { runOvertimeRebalance, resolveOvertimeSuggestion } from "@/lib/overtime-rebalance";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    await runOvertimeRebalance(admin, ctx.facilityName);
    const { data, error } = await admin
        .from("overtime_rebalance_suggestions")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .eq("status", "pending")
        .order("shift_date", { ascending: true });
    if (error) {
        return NextResponse.json({ suggestions: [] });
    }
    return NextResponse.json({ suggestions: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, resolution } = await req.json();
    if (!id || (resolution !== "accept" && resolution !== "dismiss")) {
        return NextResponse.json({ error: "id und resolution (accept|dismiss) erforderlich" }, { status: 400 });
    }
    const admin = createAdminClient();
    const ok = await resolveOvertimeSuggestion(admin, ctx.facilityName, id, resolution);
    if (!ok)
        return NextResponse.json({ error: "Vorschlag nicht gefunden" }, { status: 404 });
    return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { fehlzeitenImPlan } from "@/lib/nichterscheinen";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    if (!ISO.test(from) || !ISO.test(to))
        return NextResponse.json({ error: "Zeitraum fehlt" }, { status: 400 });
    const byShift = await fehlzeitenImPlan(createAdmin(), ctx.facilityName, from, to);
    return NextResponse.json({ byShift });
}

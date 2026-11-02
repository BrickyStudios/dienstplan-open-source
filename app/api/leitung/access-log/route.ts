import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const facility = new URL(req.url).searchParams.get("facility") ?? undefined;
    const ctx = await resolveLeitung(req, facility);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    if (!ctx.facilityName)
        return NextResponse.json({ logs: [] });
    const { data, error } = await createAdminClient()
        .from("admin_access_log")
        .select("id, admin_email, reason, accessed_at")
        .eq("facility_name", ctx.facilityName)
        .order("accessed_at", { ascending: false })
        .limit(50);
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ logs: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ logs: data ?? [] });
}

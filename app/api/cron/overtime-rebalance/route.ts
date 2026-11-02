import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { runOvertimeRebalance } from "@/lib/overtime-rebalance";
import { cronAuthorized } from "@/lib/cron-auth";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    if (!cronAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: facilities, error } = await admin
        .from("facility_settings")
        .select("facility_name, overtime_rebalance_mode")
        .in("overtime_rebalance_mode", ["suggest", "auto"]);
    if (spalteFehlt(error) || tabelleFehlt(error)) {
        return NextResponse.json({ processed: 0, notMigrated: true });
    }
    const results: Record<string, unknown>[] = [];
    for (const f of facilities ?? []) {
        const result = await runOvertimeRebalance(admin, f.facility_name as string);
        results.push({ facility: f.facility_name, ...result });
    }
    return NextResponse.json({ processed: results.length, results });
}

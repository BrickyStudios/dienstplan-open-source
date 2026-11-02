import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO, berlinTagISO } from "@/lib/date";
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ctx = await resolveLeitung(req, searchParams.get("facility") ?? undefined);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const from = searchParams.get("from") ?? berlinTodayISO();
    const to = searchParams.get("to") ?? berlinTagISO(30);
    const admin = createAdminClient();
    const [onCallRes, availRes] = await Promise.all([
        admin.from("on_call_entries")
            .select("on_call_date, staff_name, shift_type")
            .eq("facility_name", ctx.facilityName).gte("on_call_date", from).lte("on_call_date", to)
            .order("on_call_date"),
        admin.from("availability_entries")
            .select("available_date, staff_name, shift_type")
            .eq("facility_name", ctx.facilityName).gte("available_date", from).lte("available_date", to)
            .order("available_date"),
    ]);
    if (tabelleFehlt(onCallRes.error) && tabelleFehlt(availRes.error)) {
        return NextResponse.json({ entries: [], tableMissing: true });
    }
    type Entry = {
        on_call_date: string;
        staff_name: string;
        shift_type: string | null;
        source: string;
    };
    const merged: Entry[] = [];
    const seen = new Set<string>();
    const push = (date: string, name: string, shift: string | null, source: string) => {
        if (!date || !name)
            return;
        const key = `${date}|${name}`;
        if (seen.has(key))
            return;
        seen.add(key);
        merged.push({ on_call_date: date, staff_name: name, shift_type: shift ?? null, source });
    };
    for (const e of onCallRes.data ?? [])
        push(e.on_call_date as string, e.staff_name as string, (e.shift_type as string | null) ?? null, "oncall");
    for (const e of availRes.data ?? [])
        push(e.available_date as string, e.staff_name as string, (e.shift_type as string | null) ?? null, "available");
    return NextResponse.json({ entries: merged });
}

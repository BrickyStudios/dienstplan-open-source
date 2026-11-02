import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { spalteFehlt } from "@/lib/db-fehler";
const MIGRATION_MSG = "DB-Migration erforderlich:\nALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vacation_days integer NOT NULL DEFAULT 30;\nALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vacation_bonus_days integer NOT NULL DEFAULT 0;";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    let migrationNeeded = false;
    let staffRows: {
        id: string;
        full_name: string;
        vacation_days?: number;
        vacation_bonus_days?: number;
    }[] = [];
    const withCols = await admin
        .from("user_profiles")
        .select("id, full_name, vacation_days, vacation_bonus_days")
        .eq("facility", ctx.facilityName)
        .eq("role", "mitarbeiter")
        .order("full_name");
    if (withCols.error) {
        migrationNeeded = true;
        const fallback = await admin
            .from("user_profiles")
            .select("id, full_name")
            .eq("facility", ctx.facilityName)
            .eq("role", "mitarbeiter")
            .order("full_name");
        if (fallback.error)
            return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        staffRows = (fallback.data ?? []) as typeof staffRows;
    }
    else {
        staffRows = (withCols.data ?? []) as typeof staffRows;
    }
    const ids = staffRows.map(s => s.id);
    const usedById: Record<string, number> = {};
    if (ids.length > 0) {
        const { data: reqs } = await admin
            .from("vacation_requests")
            .select("staff_id, days, status")
            .in("staff_id", ids)
            .eq("status", "approved");
        for (const r of reqs ?? []) {
            usedById[r.staff_id as string] = (usedById[r.staff_id as string] ?? 0) + (Number(r.days) || 0);
        }
    }
    const balances = staffRows.map(s => {
        const entitlement = Number.isFinite(Number(s.vacation_days)) ? Number(s.vacation_days) : 30;
        const bonus = Number.isFinite(Number(s.vacation_bonus_days)) ? Number(s.vacation_bonus_days) : 0;
        const used = usedById[s.id] ?? 0;
        return {
            staff_id: s.id,
            full_name: s.full_name,
            entitlement,
            bonus,
            total: entitlement + bonus,
            used,
            remaining: entitlement + bonus - used,
        };
    });
    return NextResponse.json({ balances, migrationNeeded });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { staff_id, vacation_days, vacation_bonus_days } = await req.json().catch(() => ({}));
    if (!staff_id)
        return NextResponse.json({ error: "staff_id erforderlich" }, { status: 400 });
    const updates: Record<string, number> = {};
    if (vacation_days != null)
        updates.vacation_days = Math.max(0, Math.min(365, Math.round(Number(vacation_days)) || 0));
    if (vacation_bonus_days != null)
        updates.vacation_bonus_days = Math.max(0, Math.min(365, Math.round(Number(vacation_bonus_days)) || 0));
    if (Object.keys(updates).length === 0)
        return NextResponse.json({ error: "Nichts zu speichern" }, { status: 400 });
    const admin = createAdminClient();
    const { data: target } = await admin
        .from("user_profiles")
        .select("id")
        .eq("id", staff_id)
        .eq("facility", ctx.facilityName)
        .eq("role", "mitarbeiter")
        .maybeSingle();
    if (!target)
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    const { error } = await admin
        .from("user_profiles")
        .update(updates)
        .eq("id", staff_id)
        .eq("facility", ctx.facilityName);
    if (error) {
        if (spalteFehlt(error)) {
            return NextResponse.json({ error: MIGRATION_MSG }, { status: 500 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...updates });
}

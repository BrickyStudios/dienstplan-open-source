import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { generateInviteCode, inviteCodeExpiry } from "@/lib/invite-code";
import { errMsg } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const adminClient = createAdminClient();
        const { data: codes, error: codesError } = await adminClient
            .from("invite_codes")
            .select("id, code, used, used_by, created_at, used_at, created_by, preset_name, expires_at")
            .eq("facility_name", ctx.facilityName)
            .eq("role", "mitarbeiter")
            .order("created_at", { ascending: false });
        if (codesError)
            throw codesError;
        const usedByIds = (codes ?? []).filter(c => c.used_by).map(c => c.used_by as string);
        let profileMap: Record<string, string> = {};
        if (usedByIds.length > 0) {
            const { data: profiles } = await adminClient
                .from("user_profiles")
                .select("id, full_name")
                .in("id", usedByIds);
            profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name ?? "—"]));
        }
        const result = (codes ?? []).map(c => ({
            ...c,
            employee_name: c.used_by ? (profileMap[c.used_by] ?? "—") : null,
        }));
        return NextResponse.json({ codes: result });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const { code } = await req.json();
        if (!code)
            return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
        const adminClient = createAdminClient();
        const { data: existing } = await adminClient
            .from("invite_codes")
            .select("facility_name, used")
            .eq("code", code)
            .single();
        if (!existing)
            return NextResponse.json({ error: "Code nicht gefunden" }, { status: 404 });
        if (!sameFacility(existing.facility_name, ctx.facilityName)) {
            return NextResponse.json({ error: "Keine Berechtigung für diesen Code" }, { status: 403 });
        }
        const { error } = await adminClient.from("invite_codes").delete().eq("code", code);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const { count } = await req.json();
        const n = Math.min(Math.max(parseInt(count) || 1, 1), 20);
        const adminClient = createAdminClient();
        const { data: facilityRow } = await adminClient
            .from("facilities")
            .select("id")
            .eq("name", ctx.facilityName)
            .single();
        const expiresAt = inviteCodeExpiry();
        const codes = Array.from({ length: n }, () => ({
            code: generateInviteCode("NRV-M"),
            role: "mitarbeiter",
            facility_id: facilityRow?.id ?? null,
            facility_name: ctx.facilityName,
            created_by: ctx.createdBy,
            used: false,
            expires_at: expiresAt,
        }));
        const { data, error } = await adminClient.from("invite_codes").insert(codes).select();
        if (error)
            throw error;
        return NextResponse.json({ codes: data?.map(c => c.code) ?? [] });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/notify";
import { generateRecoveryPhrase, hashPhrase } from "@/lib/recovery-phrase";
import { checkRateLimit } from "@/lib/rate-limit";
import { presetsLeeren } from "@/lib/invite-presets";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
import { admin as createServiceClient } from "@/lib/admin-client";
async function bestEffortUpdate(admin: any, table: string, idCol: string, idVal: string, fields: Record<string, unknown>) {
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
    if (Object.keys(clean).length === 0)
        return;
    try {
        await admin.from(table).update(clean).eq(idCol, idVal);
    }
    catch { }
}
export async function POST(req: NextRequest) {
    const gesperrt = await checkRateLimit(req, "invite-redeem", {
        limit: 10,
        windowMs: 15 * 60 * 1000,
        message: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
    });
    if (gesperrt)
        return gesperrt;
    const supabaseAdmin = createServiceClient();
    const { code, user_id, full_name } = await req.json();
    if (!code || !user_id)
        return NextResponse.json({ error: "Fehlende Parameter" }, { status: 400 });
    const codeUpper = String(code).toUpperCase().trim();
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
    const { user: sessionUser } = await nutzerMitStufe(sb);
    const hasValidSession = sessionUser?.id === user_id;
    if (!hasValidSession) {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user_id);
        if (!authData?.user) {
            return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
        }
    }
    const nowIso = new Date().toISOString();
    const { data: claimedRows } = await supabaseAdmin
        .from("invite_codes")
        .update({ used: true, used_by: user_id, used_at: nowIso })
        .eq("code", codeUpper)
        .eq("used", false)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .select("*");
    const codeRow = claimedRows?.[0];
    if (!codeRow) {
        const { data: existing } = await supabaseAdmin
            .from("invite_codes")
            .select("used_by, expires_at")
            .eq("code", codeUpper)
            .maybeSingle();
        if (existing?.used_by === user_id)
            return NextResponse.json({ success: true });
        if (existing?.expires_at && new Date(existing.expires_at) < new Date()) {
            return NextResponse.json({ error: "Dieser Einladungscode ist abgelaufen" }, { status: 410 });
        }
        return NextResponse.json({ error: "Ungültiger oder bereits verwendeter Einladungscode" }, { status: 400 });
    }
    const role: string = codeRow.role ?? "";
    const facilityName: string = codeRow.facility_name ?? "";
    let recoveryPhrase: string | null = null;
    if (full_name && role && role !== "admin") {
        const profileRow: Record<string, unknown> = {
            id: user_id,
            full_name,
            role: role === "demo" ? "leitung" : role,
            facility: facilityName,
        };
        if (codeRow.preset_station)
            profileRow.station = codeRow.preset_station;
        if (codeRow.preset_station_secondary)
            profileRow.station_secondary = codeRow.preset_station_secondary;
        const { error: profileError } = await supabaseAdmin.from("user_profiles").upsert(profileRow, { onConflict: "id" });
        if (profileError) {
            await supabaseAdmin.from("invite_codes")
                .update({ used: false, used_by: null, used_at: null })
                .eq("code", codeUpper).eq("used_by", user_id)
                .then(() => { }, () => { });
            console.error("[redeem] user_profiles upsert failed:", profileError.message);
            return NextResponse.json({ error: "Profil konnte nicht erstellt werden: " + profileError.message }, { status: 500 });
        }
        const candidatePhrase = generateRecoveryPhrase();
        const { error: rpErr } = await supabaseAdmin
            .from("user_profiles")
            .update({
            recovery_phrase_hash: hashPhrase(candidatePhrase),
            recovery_phrase_set_at: new Date().toISOString(),
            recovery_phrase_updated_by: "self",
        })
            .eq("id", user_id);
        recoveryPhrase = rpErr ? null : candidatePhrase;
        if (rpErr)
            console.warn("[redeem] recovery phrase not stored (Migration 20260701?):", rpErr.message);
        let registeredEmail: string | null = null;
        try {
            const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user_id);
            registeredEmail = authData?.user?.email ?? null;
        }
        catch { }
        await bestEffortUpdate(supabaseAdmin, "user_profiles", "id", user_id, {
            email: registeredEmail,
            phone: codeRow.preset_phone ?? null,
            vacation_days: codeRow.preset_vacation_days ?? null,
        });
        if (role === "mitarbeiter" && facilityName) {
            const staffRow: Record<string, unknown> = {
                id: user_id,
                facility_name: facilityName,
                full_name,
                role: codeRow.preset_role || "Pflegekraft",
                job_type: codeRow.preset_job_type ?? "Vollzeit",
                max_hours_per_week: codeRow.preset_max_hours ?? 40,
                active: true,
            };
            if (codeRow.preset_station)
                staffRow.station = codeRow.preset_station;
            if (codeRow.preset_hourly_rate)
                staffRow.hourly_rate = codeRow.preset_hourly_rate;
            if (codeRow.preset_minijob_buffer != null)
                staffRow.minijob_buffer_pct = codeRow.preset_minijob_buffer;
            await supabaseAdmin.from("facility_staff").upsert(staffRow, { onConflict: "id", ignoreDuplicates: true });
            await bestEffortUpdate(supabaseAdmin, "facility_staff", "id", user_id, {
                email: registeredEmail,
                phone: codeRow.preset_phone ?? null,
                weekend_pct: codeRow.preset_weekend_pct ?? null,
                holiday_pct: codeRow.preset_holiday_pct ?? null,
                break_min: codeRow.preset_break_min ?? null,
            });
            const presetCerts = Array.isArray(codeRow.preset_certificates) ? codeRow.preset_certificates : [];
            const certRows = presetCerts
                .filter((c: {
                cert_name?: string;
            }) => c?.cert_name)
                .map((c: {
                cert_name: string;
                expiry_date?: string | null;
            }) => ({
                user_id, facility: facilityName, full_name,
                cert_name: c.cert_name, cert_type: "leitung",
                issued_date: null, expiry_date: c.expiry_date || null,
            }));
            if (certRows.length > 0) {
                try {
                    await supabaseAdmin.from("staff_certificates").insert(certRows);
                }
                catch { }
                await createNotification(supabaseAdmin, {
                    userId: user_id, facility: facilityName,
                    title: "Zertifikate hinterlegt",
                    message: `Deine Leitung hat ${certRows.length} Zertifikat(e) für dich hinterlegt.`,
                });
            }
        }
    }
    await presetsLeeren(supabaseAdmin, user_id);
    return NextResponse.json({ success: true, recovery_phrase: recoveryPhrase });
}

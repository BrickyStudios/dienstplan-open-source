import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendInviteEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { BULK_MAX_ZEILEN, versandAbsage, type VersandZeile } from "@/lib/invite-staff";
import { errMsg } from "@/lib/db-fehler";
type CodeZeile = VersandZeile & {
    preset_name: string | null;
};
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ error: "Kein E-Mail-Versand eingerichtet (RESEND_API_KEY fehlt). Die Codes lassen sich weiterhin kopieren oder als CSV herunterladen." }, { status: 503 });
        }
        const gesperrt = await checkRateLimit(req, "invite-versenden", {
            limit: 5,
            windowMs: 60 * 60 * 1000,
            message: "Zu viele Versand-Laeufe in kurzer Zeit. Bitte in einer Stunde erneut versuchen.",
        });
        if (gesperrt)
            return gesperrt;
        const body = await req.json();
        const codes: string[] = Array.isArray(body?.codes)
            ? body.codes.map((c: unknown) => String(c).toUpperCase().trim()).filter(Boolean)
            : [];
        if (codes.length === 0)
            return NextResponse.json({ error: "Keine Codes uebergeben" }, { status: 400 });
        if (codes.length > BULK_MAX_ZEILEN) {
            return NextResponse.json({ error: `Hoechstens ${BULK_MAX_ZEILEN} auf einmal.` }, { status: 400 });
        }
        const admin = createAdminClient();
        const { data, error } = await admin
            .from("invite_codes")
            .select("code, facility_name, used, expires_at, preset_name, preset_email")
            .in("code", codes);
        if (error)
            throw error;
        const gefunden = new Map((data ?? []).map(z => [(z as CodeZeile).code, z as CodeZeile]));
        const basis = siteUrl();
        const verschickt: {
            code: string;
            name: string;
        }[] = [];
        const uebersprungen: {
            code: string;
            grund: string;
        }[] = [];
        for (const code of codes) {
            const z = gefunden.get(code);
            const absage = versandAbsage(z, !!z && sameFacility(z.facility_name, ctx.facilityName));
            if (absage || !z || !z.preset_email) {
                uebersprungen.push({ code, grund: absage ?? "Code nicht gefunden" });
                continue;
            }
            try {
                await sendInviteEmail({
                    to: z.preset_email,
                    staffName: z.preset_name ?? "",
                    facilityName: ctx.facilityName,
                    code: z.code,
                    siteUrl: basis,
                });
                verschickt.push({ code: z.code, name: z.preset_name ?? "" });
            }
            catch (e) {
                uebersprungen.push({ code, grund: errMsg(e).slice(0, 120) });
            }
        }
        return NextResponse.json({ ok: true, verschickt, uebersprungen });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { errMsg } from "@/lib/db-fehler";
import { baueInviteZeile, BULK_INVITE_TTL_DAYS, BULK_MAX_ZEILEN, istFehlendeSpalte, ohnePresetRole, ohneErweiterteSpalten, type InviteEingabe, } from "@/lib/invite-staff";
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const gesperrt = await checkRateLimit(req, "invite-bulk", {
            limit: 10,
            windowMs: 60 * 60 * 1000,
            message: "Zu viele Masseneinträge in kurzer Zeit. Bitte in einer Stunde erneut versuchen.",
        });
        if (gesperrt)
            return gesperrt;
        const body = await req.json();
        const eingaben: InviteEingabe[] = Array.isArray(body?.zeilen) ? body.zeilen : [];
        if (eingaben.length === 0) {
            return NextResponse.json({ error: "Keine Zeilen übergeben" }, { status: 400 });
        }
        if (eingaben.length > BULK_MAX_ZEILEN) {
            return NextResponse.json({ error: `Höchstens ${BULK_MAX_ZEILEN} Zeilen auf einmal — die Liste hat ${eingaben.length}.` }, { status: 400 });
        }
        const admin = createAdminClient();
        const { data: facilityRow } = await admin
            .from("facilities").select("id").eq("name", ctx.facilityName).single();
        const kontext = {
            facilityName: ctx.facilityName,
            facilityId: facilityRow?.id ?? null,
            createdBy: ctx.createdBy,
        };
        const zeilen: Record<string, unknown>[] = [];
        const angelegt: {
            name: string;
            code: string;
        }[] = [];
        const abgelehnt: {
            zeile: number;
            name: string;
            grund: string;
        }[] = [];
        eingaben.forEach((e, i) => {
            const gebaut = baueInviteZeile(e, kontext, { ttlTage: BULK_INVITE_TTL_DAYS });
            if ("fehler" in gebaut) {
                abgelehnt.push({ zeile: i + 1, name: String(e.name ?? ""), grund: gebaut.fehler });
                return;
            }
            zeilen.push(gebaut.zeile);
            angelegt.push({ name: gebaut.name, code: gebaut.code });
        });
        if (zeilen.length === 0) {
            return NextResponse.json({ ok: false, angelegt: [], abgelehnt }, { status: 400 });
        }
        let { error } = await admin.from("invite_codes").insert(zeilen);
        if (error && istFehlendeSpalte(error) && zeilen.some(z => "preset_role" in z)) {
            ({ error } = await admin.from("invite_codes").insert(ohnePresetRole(zeilen)));
        }
        if (error && istFehlendeSpalte(error)) {
            ({ error } = await admin.from("invite_codes").insert(ohneErweiterteSpalten(zeilen)));
        }
        if (error)
            throw error;
        return NextResponse.json({
            ok: true,
            angelegt,
            abgelehnt,
            gueltigBis: new Date(Date.now() + BULK_INVITE_TTL_DAYS * 86400000).toISOString(),
        });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}

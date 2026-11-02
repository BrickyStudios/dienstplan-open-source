import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, "invite-validate", {
        limit: 20,
        windowMs: 15 * 60 * 1000,
        message: "Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.",
    });
    if (limited)
        return limited;
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            console.error("validate route: Supabase-Konfiguration unvollstaendig", { url: url ? "ok" : "FEHLT", key: key ? "ok" : "FEHLT" });
            return NextResponse.json({ error: "Interner Fehler — bitte erneut versuchen" }, { status: 500 });
        }
        const body = await req.json();
        const code = body?.code;
        if (!code) {
            return NextResponse.json({ error: "Kein Code angegeben" }, { status: 400 });
        }
        const supabaseAdmin = createClient(url, key);
        const { data, error } = await supabaseAdmin
            .from("invite_codes")
            .select("*")
            .eq("code", code.toUpperCase().trim())
            .single();
        if (error || !data) {
            return NextResponse.json({ error: "Ungültiger Code — bitte prüfen Sie die Eingabe" }, { status: 404 });
        }
        if (data.used) {
            return NextResponse.json({ error: "Dieser Code wurde bereits verwendet" }, { status: 409 });
        }
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            return NextResponse.json({ error: "Dieser Code ist abgelaufen" }, { status: 410 });
        }
        const response: Record<string, unknown> = {
            valid: true,
            role: data.role,
            facility_id: data.facility_id,
            facility_name: data.facility_name,
            code: data.code,
        };
        if (data.preset_name)
            response.preset_name = data.preset_name;
        if (data.preset_email)
            response.preset_email = data.preset_email;
        if (data.preset_first_name)
            response.preset_first_name = data.preset_first_name;
        if (data.preset_last_name)
            response.preset_last_name = data.preset_last_name;
        return NextResponse.json(response);
    }
    catch (err) {
        console.error("validate route error:", err);
        return NextResponse.json({ error: "Interner Fehler — bitte erneut versuchen" }, { status: 500 });
    }
}

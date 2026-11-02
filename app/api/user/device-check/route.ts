import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendNewDeviceEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { tabelleFehlt } from "@/lib/db-fehler";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
function parseDeviceName(ua: string): string {
    let os = "Unbekanntes Gerät";
    if (/Windows/i.test(ua))
        os = "Windows";
    else if (/iPhone/i.test(ua))
        os = "iPhone";
    else if (/iPad/i.test(ua))
        os = "iPad";
    else if (/Android/i.test(ua))
        os = "Android";
    else if (/Mac OS X/i.test(ua))
        os = "Mac";
    else if (/Linux/i.test(ua))
        os = "Linux";
    let browser = "";
    if (/Edg\//i.test(ua))
        browser = "Edge";
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua))
        browser = "Opera";
    else if (/Chrome/i.test(ua))
        browser = "Chrome";
    else if (/Firefox/i.test(ua))
        browser = "Firefox";
    else if (/Safari/i.test(ua))
        browser = "Safari";
    return browser ? `${os} · ${browser}` : os;
}
export async function POST(req: NextRequest) {
    const rateLimitResponse = await checkRateLimit(req, "device-check", { limit: 10, windowMs: 60000 });
    if (rateLimitResponse)
        return rateLimitResponse;
    try {
        const { device_id } = await req.json();
        if (!device_id || typeof device_id !== "string" || device_id.length > 128) {
            return NextResponse.json({ error: "invalid" }, { status: 400 });
        }
        const supabase = await createClient();
        const { user } = await nutzerMitStufe(supabase);
        if (!user)
            return NextResponse.json({ error: "unauth" }, { status: 401 });
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("role, full_name, facility")
            .eq("id", user.id)
            .maybeSingle();
        if (profile?.role === "demo") {
            return NextResponse.json({ isNew: false });
        }
        const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        const { data: existing, error: selectError } = await service
            .from("user_devices")
            .select("id")
            .eq("user_id", user.id)
            .eq("device_id", device_id)
            .maybeSingle();
        if (tabelleFehlt(selectError))
            return NextResponse.json({ isNew: false });
        if (existing) {
            await service
                .from("user_devices")
                .update({ last_seen: new Date().toISOString() })
                .eq("id", existing.id);
            return NextResponse.json({ isNew: false });
        }
        const { count: countBefore } = await service
            .from("user_devices")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);
        const ua = req.headers.get("user-agent") ?? "";
        const deviceName = parseDeviceName(ua);
        const { error: insertError } = await service
            .from("user_devices")
            .insert({
            user_id: user.id,
            device_id,
            device_name: deviceName,
        });
        if (insertError && insertError.code === "23505") {
            return NextResponse.json({ isNew: false });
        }
        if (insertError)
            throw insertError;
        if ((countBefore ?? 0) === 0) {
            return NextResponse.json({ isNew: false });
        }
        const userName = profile?.full_name ?? user.user_metadata?.full_name ?? "Nutzer";
        const facility = profile?.facility ?? "Nurvo";
        const email = user.email;
        if (email) {
            try {
                await sendNewDeviceEmail({ to: email, userName, deviceName, facility });
            }
            catch (err) {
                console.error("[device-check] failed to send new-device email:", err);
            }
        }
        return NextResponse.json({ isNew: true, deviceName });
    }
    catch {
        return NextResponse.json({ error: "internal" }, { status: 500 });
    }
}

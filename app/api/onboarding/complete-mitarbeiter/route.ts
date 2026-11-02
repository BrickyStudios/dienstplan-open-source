import { admin as createAdminClient } from "@/lib/admin-client";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
export async function POST(req: NextRequest) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
    const { user } = await nutzerMitStufe(supabase);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin.from("user_profiles").update({ onboarding_completed_at: now }).eq("id", user.id);
    const res = new NextResponse(JSON.stringify({ ok: true }), { status: 200 });
    res.cookies.set(`nurvo_onboarding_done_${user.id}`, "1", {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
    });
    return res;
}

import { admin } from "@/lib/admin-client";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
const DEFAULT_SESSION_HOURS = 48;
export async function GET(req: NextRequest) {
    try {
        const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
        const { user } = await nutzerMitStufe(supabase);
        if (!user?.email)
            return NextResponse.json({ isAdmin: false, role: null });
        const db = admin();
        const [istAdmin, { data: profile }] = await Promise.all([
            istNurvoAdmin(user.email),
            db.from("user_profiles").select("role").eq("id", user.id).maybeSingle(),
        ]);
        const response = NextResponse.json({
            isAdmin: istAdmin,
            role: profile?.role ?? null,
        });
        if (!istAdmin && profile?.role === "demo" && !req.cookies.get("nurvo_demo_expires")) {
            const { data: codeRow } = await db
                .from("invite_codes")
                .select("session_hours")
                .eq("used_by", user.id)
                .eq("role", "demo")
                .maybeSingle();
            const sessionHours: number = typeof codeRow?.session_hours === "number" && codeRow.session_hours > 0
                ? codeRow.session_hours
                : DEFAULT_SESSION_HOURS;
            response.cookies.set("nurvo_demo_expires", String(Date.now() + sessionHours * 3600000), {
                path: "/",
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                maxAge: sessionHours * 3600,
            });
        }
        return response;
    }
    catch {
        return NextResponse.json({ isAdmin: false, role: null });
    }
}

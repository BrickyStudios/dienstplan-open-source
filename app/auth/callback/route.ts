import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { sicheresZiel } from "@/lib/safe-redirect";
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = sicheresZiel(searchParams.get("next"), request.url);
    if (code) {
        const response = NextResponse.redirect(`${origin}${next}`);
        const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        });
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error)
            return response;
    }
    return NextResponse.redirect(`${origin}/login`);
}

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { nutzerMitStufe, stufeFehlt } from "@/lib/zweite-stufe";
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export type RequestAuth = {
    user: User;
    supabase: SupabaseClient;
    viaBearer: boolean;
};
export async function resolveRequestAuth(req: NextRequest): Promise<RequestAuth | null> {
    const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (authz && authz.startsWith("Bearer ")) {
        const token = authz.slice(7).trim();
        if (!token)
            return null;
        const supabase = createClient(BASE, ANON, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user)
            return null;
        if (stufeFehlt(data.user, token))
            return null;
        return { user: data.user, supabase, viaBearer: true };
    }
    const supabase = createServerClient(BASE, ANON, {
        cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } },
    });
    const { user } = await nutzerMitStufe(supabase);
    if (!user)
        return null;
    return { user, supabase, viaBearer: false };
}

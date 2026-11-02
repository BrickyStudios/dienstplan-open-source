import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
export const getServerStufe = cache(async () => {
    const supabase = await createClient();
    return nutzerMitStufe(supabase);
});
export const getServerUser = cache(async () => {
    const { user } = await getServerStufe();
    return user;
});
export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                }
                catch { }
            },
        },
    });
}

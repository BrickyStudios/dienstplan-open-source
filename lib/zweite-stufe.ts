import type { SupabaseClient, User } from "@supabase/supabase-js";
export function stufeAusToken(token: string | null | undefined): string | null {
    if (!token)
        return null;
    const teil = token.split(".")[1];
    if (!teil)
        return null;
    try {
        const json = Buffer.from(teil.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const nutz = JSON.parse(json) as {
            aal?: unknown;
        };
        return typeof nutz.aal === "string" ? nutz.aal : null;
    }
    catch {
        return null;
    }
}
export function hatBestaetigtenFaktor(user: Pick<User, "factors"> | null | undefined): boolean {
    return (user?.factors ?? []).some((f) => f.status === "verified");
}
export function stufeFehlt(user: Pick<User, "factors"> | null | undefined, accessToken: string | null | undefined): boolean {
    if (!hatBestaetigtenFaktor(user))
        return false;
    return stufeAusToken(accessToken) !== "aal2";
}
export async function nutzerMitStufe(sb: Pick<SupabaseClient, "auth">): Promise<{
    user: User | null;
    stufeFehlt: boolean;
}> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user)
        return { user: null, stufeFehlt: false };
    if (!hatBestaetigtenFaktor(user))
        return { user, stufeFehlt: false };
    const { data: { session } } = await sb.auth.getSession();
    if (stufeFehlt(user, session?.access_token))
        return { user: null, stufeFehlt: true };
    return { user, stufeFehlt: false };
}

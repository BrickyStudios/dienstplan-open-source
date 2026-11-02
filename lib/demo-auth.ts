import { admin } from "@/lib/admin-client";
import { hasDebugAccess } from "@/lib/debug-auth";
import { istNurvoAdmin } from "@/lib/admin-auth";
export async function isDemoCodeUser(user: {
    id: string;
    user_metadata?: Record<string, unknown> | null;
} | null): Promise<boolean> {
    if (!user || user.user_metadata?.role !== "demo")
        return false;
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
        return false;
    const { data } = await admin()
        .from("invite_codes")
        .select("id")
        .eq("used_by", user.id)
        .eq("role", "demo")
        .limit(1)
        .maybeSingle();
    return !!data;
}
type ViewerUser = {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
} | null;
export async function viewerStatus(user: ViewerUser): Promise<{
    admin: boolean;
    demo: boolean;
    dev: boolean;
}> {
    if (!user || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return { admin: false, demo: false, dev: false };
    const db = admin();
    let isAdmin = false;
    let isDemo = false;
    if (user.email) {
        if (await istNurvoAdmin(user.email))
            isAdmin = true;
        const demoEmails = [process.env.DEMO_LEITUNG_EMAIL, process.env.DEMO_MITARBEITER_EMAIL].filter(Boolean);
        if (demoEmails.includes(user.email))
            isDemo = true;
    }
    if (!isDemo && user.user_metadata?.role === "demo") {
        const { data } = await db.from("invite_codes").select("id").eq("used_by", user.id).eq("role", "demo").limit(1).maybeSingle();
        if (data)
            isDemo = true;
    }
    const isDev = isAdmin || (await hasDebugAccess(user));
    return { admin: isAdmin, demo: isDemo, dev: isDev };
}
export async function isPrivilegedViewer(user: ViewerUser): Promise<boolean> {
    const { admin, demo, dev } = await viewerStatus(user);
    return admin || demo || dev;
}

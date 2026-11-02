import { istNurvoAdmin } from "@/lib/admin-auth";
export async function adminAccessFacility(user: {
    email?: string | null;
} | null | undefined, cookie: string | null | undefined): Promise<string | null> {
    const wanted = cookie?.trim();
    if (!wanted || !user?.email || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return null;
    return (await istNurvoAdmin(user.email)) ? wanted : null;
}

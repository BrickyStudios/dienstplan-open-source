import { admin as createAdmin } from "@/lib/admin-client";
import type { NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
export type AdminKontext = {
    name: string;
    email: string;
    userId: string;
};
export async function resolveNurvoAdmin(req: NextRequest): Promise<AdminKontext | null> {
    const user = await resolveRequestUser(req);
    if (!user?.email)
        return null;
    const name = await nurvoAdminName(user.email);
    if (name === null)
        return null;
    return { name, email: user.email, userId: user.id };
}
export async function istNurvoAdmin(email: string | null | undefined): Promise<boolean> {
    return (await nurvoAdminName(email)) !== null;
}
export async function nurvoAdminName(email: string | null | undefined): Promise<string | null> {
    if (!email)
        return null;
    const { data } = await createAdmin()
        .from("nurvo_admins")
        .select("name")
        .eq("email", email)
        .maybeSingle();
    if (!data)
        return null;
    return (data.name as string | null) ?? email;
}
export async function adminEinrichtung(user: {
    id: string;
    user_metadata?: Record<string, unknown> | null;
}, cookie: string | null | undefined, override?: string): Promise<string> {
    const gewaehlt = (override ?? cookie ?? "").trim();
    if (gewaehlt)
        return gewaehlt;
    const { data } = await createAdmin().from("user_profiles").select("facility").eq("id", user.id).maybeSingle();
    const ausProfil = ((data?.facility as string | null) ?? "").trim();
    if (ausProfil)
        return ausProfil;
    return typeof user.user_metadata?.facility === "string" ? user.user_metadata.facility.trim() : "";
}

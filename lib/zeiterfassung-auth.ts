import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import type { User } from "@supabase/supabase-js";
import { adminEinrichtung, istNurvoAdmin } from "@/lib/admin-auth";
import { ladeMitarbeiterRechte } from "@/lib/rechte";
export type ZeiterfassungContext = {
    user: User;
    role: "leitung" | "mitarbeiter" | "demo";
    facility: string;
    name: string;
};
export async function resolveZeiterfassungUser(req: NextRequest): Promise<ZeiterfassungContext | null> {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    if (await istNurvoAdmin(user.email)) {
        const fac = await adminEinrichtung(user, req.cookies.get("nurvo_access_facility")?.value);
        const previewRole = req.cookies.get("nurvo_preview_role")?.value;
        if (previewRole === "mitarbeiter") {
            return { user, role: "mitarbeiter" as const, facility: fac, name: user.email! };
        }
        return { user, role: "leitung" as const, facility: fac, name: user.email! };
    }
    const { data: profile } = await admin.from("user_profiles").select("role, facility, full_name").eq("id", user.id).single();
    if (!profile)
        return null;
    let rolle = profile.role as "leitung" | "mitarbeiter" | "demo";
    if (rolle === "mitarbeiter" && req.method === "GET" && profile.facility) {
        const { rechte } = await ladeMitarbeiterRechte(admin, profile.facility, user.id);
        if (rechte.includes("zeiten"))
            rolle = "leitung";
    }
    return {
        user,
        role: rolle,
        facility: profile.facility ?? "",
        name: profile.full_name ?? "",
    };
}
export function istLeitung(role: string): boolean {
    return role === "leitung" || role === "demo";
}

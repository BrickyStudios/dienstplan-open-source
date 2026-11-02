import { admin as createAdmin } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { adminEinrichtung, nurvoAdminName } from "@/lib/admin-auth";
import { NextRequest } from "next/server";
import { darfSchnittstelle, ladeMitarbeiterRechte, type Recht } from "@/lib/rechte";
export function sameFacility(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = (a ?? "").trim();
    const right = (b ?? "").trim();
    if (!left || !right)
        return false;
    return left === right;
}
export type LeitungContext = {
    facilityName: string;
    createdBy: string;
    leitungName: string;
    name: string;
    userId: string;
    role: string;
    isDemo: boolean;
    isAdmin: boolean;
    delegiert?: boolean;
    rechte?: Recht[];
};
export async function resolveLeitung(req: NextRequest, facilityOverride?: string): Promise<LeitungContext | null> {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdmin();
    const adminName = await nurvoAdminName(user.email);
    if (adminName !== null) {
        const facilityName = await adminEinrichtung(user, req.cookies.get("nurvo_access_facility")?.value, facilityOverride);
        const displayName = adminName;
        return { facilityName, createdBy: displayName, leitungName: displayName, name: displayName, userId: user.id, role: "leitung", isDemo: false, isAdmin: true };
    }
    let { data: profile } = await admin
        .from("user_profiles")
        .select("role, facility")
        .eq("id", user.id)
        .single();
    if (!profile || (profile.role !== "leitung" && profile.role !== "demo")) {
        const { data: redemption } = await admin
            .from("invite_codes")
            .select("role, facility_name")
            .eq("used_by", user.id)
            .in("role", ["leitung", "demo"])
            .order("used_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (redemption) {
            const healRole = redemption.role === "demo" ? "leitung" : (redemption.role as string);
            const healFacility = profile?.facility || redemption.facility_name || "";
            const upsertRow: Record<string, unknown> = { id: user.id, role: healRole, facility: healFacility };
            if (!profile)
                upsertRow.full_name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "";
            const { error } = await admin.from("user_profiles").upsert(upsertRow, { onConflict: "id" });
            if (!error) {
                profile = { role: healRole, facility: healFacility };
            }
        }
    }
    if (profile?.role !== "leitung" && profile?.role !== "demo") {
        if (profile?.role !== "mitarbeiter" || !profile.facility)
            return null;
        const { rechte } = await ladeMitarbeiterRechte(admin, profile.facility, user.id);
        if (!rechte.length)
            return null;
        const pfad = req.nextUrl?.pathname ?? new URL(req.url).pathname;
        if (!darfSchnittstelle(rechte, pfad, req.method))
            return null;
        const name = user.email ?? "";
        return {
            facilityName: profile.facility, createdBy: name, leitungName: name, name,
            userId: user.id, role: "mitarbeiter", isDemo: false, isAdmin: false, delegiert: true, rechte,
        };
    }
    const displayName = user.email!;
    return {
        facilityName: profile.facility ?? "",
        createdBy: displayName,
        leitungName: displayName,
        name: displayName,
        userId: user.id,
        role: profile.role,
        isDemo: profile.role === "demo",
        isAdmin: false,
    };
}

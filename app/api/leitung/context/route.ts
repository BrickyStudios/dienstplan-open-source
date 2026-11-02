import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { planAusZeile, planFuerNeueEinrichtung, type Plan } from "@/lib/plan";
import { resolveNurvoAdmin } from "@/lib/admin-auth";
import { ladeMitarbeiterRechte } from "@/lib/rechte";
async function loadFacilityAutomationInfo(admin: any, facilityName: string): Promise<{
    plan: Plan;
    autoSchedulingEnabled: boolean;
    firstPlanGeneratedAt: string | null;
}> {
    if (!facilityName)
        return { plan: planFuerNeueEinrichtung(), autoSchedulingEnabled: false, firstPlanGeneratedAt: null };
    const { data } = await admin
        .from("facility_settings")
        .select("plan, auto_scheduling_enabled, first_plan_generated_at")
        .eq("facility_name", facilityName)
        .maybeSingle();
    return {
        plan: planAusZeile(data),
        autoSchedulingEnabled: Boolean(data?.auto_scheduling_enabled),
        firstPlanGeneratedAt: data?.first_plan_generated_at ?? null,
    };
}
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const adminKontext = await resolveNurvoAdmin(req);
    if (adminKontext) {
        const adminName = adminKontext.name || (user.user_metadata?.full_name as string) || "";
        const { data: codes } = await admin
            .from("invite_codes")
            .select("facility_name")
            .not("facility_name", "is", null)
            .neq("facility_name", "");
        const facilities = [...new Set((codes ?? []).map(c => c.facility_name as string).filter(Boolean))].sort();
        const accessFacility = req.cookies.get("nurvo_access_facility")?.value;
        const facilityName = accessFacility || (user.user_metadata?.facility as string) || facilities[0] || "";
        return NextResponse.json({
            isAdmin: true,
            role: "leitung",
            facilityName,
            facilities,
            userName: adminName,
            ...await loadFacilityAutomationInfo(admin, facilityName),
        });
    }
    const { data: profile } = await admin
        .from("user_profiles").select("role, facility, full_name").eq("id", user.id).single();
    if (profile?.role !== "leitung" && profile?.role !== "demo") {
        const { rechte } = profile?.role === "mitarbeiter" && profile.facility
            ? await ladeMitarbeiterRechte(admin, profile.facility, user.id) : { rechte: [] };
        if (!rechte.length)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        return NextResponse.json({
            isAdmin: false, role: "leitung", delegiert: true, rechte,
            facilityName: profile!.facility, facilities: [], userName: profile!.full_name ?? "",
            ...await loadFacilityAutomationInfo(admin, profile!.facility ?? ""),
        });
    }
    const facilityName = profile.facility ?? "";
    return NextResponse.json({
        isAdmin: false,
        role: profile.role,
        facilityName,
        facilities: [],
        userName: profile.full_name ?? "",
        ...await loadFacilityAutomationInfo(admin, facilityName),
    });
}

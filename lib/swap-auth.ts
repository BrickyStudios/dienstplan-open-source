import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { istNurvoAdmin } from "@/lib/admin-auth";
export type SwapActor = {
    userId: string;
    staffId: string;
    fullName: string;
    facility: string;
};
async function getAuthUser(req: NextRequest) {
    return resolveRequestUser(req);
}
export async function resolveSwapActor(req: NextRequest): Promise<SwapActor | null> {
    const user = await getAuthUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const demoStaffId = req.cookies.get("nurvo_demo_staff_id")?.value || "";
    const demoStaffName = req.cookies.get("nurvo_demo_staff_name")?.value || "";
    const istAdmin = await istNurvoAdmin(user.email);
    const { data: profile } = await admin
        .from("user_profiles").select("role, facility, full_name").eq("id", user.id).maybeSingle();
    const accessFacility = istAdmin ? (req.cookies.get("nurvo_access_facility")?.value || "") : "";
    const role = profile?.role ?? (istAdmin ? "leitung" : "mitarbeiter");
    const facility = accessFacility || profile?.facility || "";
    const ownName = profile?.full_name ?? user.email ?? "";
    const privileged = istAdmin || role === "leitung" || role === "demo";
    if (demoStaffId && privileged) {
        const { data: target } = await admin
            .from("user_profiles").select("full_name, facility").eq("id", demoStaffId).maybeSingle();
        if (target && (target.facility === facility || !!accessFacility)) {
            return {
                userId: user.id, staffId: demoStaffId,
                fullName: target.full_name || demoStaffName, facility: target.facility || facility,
            };
        }
        if (!target && demoStaffName && facility) {
            return { userId: user.id, staffId: demoStaffId, fullName: demoStaffName, facility };
        }
    }
    return { userId: user.id, staffId: user.id, fullName: ownName, facility };
}

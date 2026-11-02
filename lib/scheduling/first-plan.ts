import { admin as createAdminClient } from "@/lib/admin-client";
type AdminClient = ReturnType<typeof createAdminClient>;
export async function markFirstPlanGenerated(admin: AdminClient, facilityName: string, insertedAssignmentCount: number): Promise<void> {
    if (!facilityName || insertedAssignmentCount <= 0)
        return;
    try {
        await admin
            .from("facility_settings")
            .update({ first_plan_generated_at: new Date().toISOString() })
            .eq("facility_name", facilityName)
            .is("first_plan_generated_at", null);
    }
    catch {
    }
}

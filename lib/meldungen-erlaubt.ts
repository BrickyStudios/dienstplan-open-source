import { admin as createAdminClient } from "@/lib/admin-client";
export type MeldungenErlaubt = {
    krank: boolean;
    verspaetung: boolean;
};
export async function meldungenErlaubt(facility: string): Promise<MeldungenErlaubt> {
    const admin = createAdminClient();
    const [krankRes, spaetRes] = await Promise.all([
        admin.from("facility_settings").select("employee_sick_reporting_enabled").eq("facility_name", facility).maybeSingle(),
        admin.from("facility_settings").select("employee_late_reporting_enabled").eq("facility_name", facility).maybeSingle(),
    ]);
    const krank = (krankRes.data as {
        employee_sick_reporting_enabled?: boolean | null;
    } | null)?.employee_sick_reporting_enabled;
    const spaet = (spaetRes.data as {
        employee_late_reporting_enabled?: boolean | null;
    } | null)?.employee_late_reporting_enabled;
    return { krank: krank !== false, verspaetung: spaet !== false };
}

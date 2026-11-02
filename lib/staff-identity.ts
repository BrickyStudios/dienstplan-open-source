import type { SupabaseClient } from "@supabase/supabase-js";
type Admin = SupabaseClient<any>;
type NamedRow = {
    id: string;
    full_name: string | null;
};
export type StaffDirectory = {
    idByName: Map<string, string>;
    nameById: Map<string, string>;
};
export function buildStaffDirectory(facilityStaff: NamedRow[] | null | undefined, profiles: NamedRow[] | null | undefined): StaffDirectory {
    const idByName = new Map<string, string>();
    for (const s of facilityStaff ?? [])
        if (s.full_name)
            idByName.set(s.full_name, s.id);
    for (const p of profiles ?? [])
        if (p.full_name)
            idByName.set(p.full_name, p.id);
    const nameById = new Map<string, string>();
    for (const [name, id] of idByName)
        nameById.set(id, name);
    return { idByName, nameById };
}
export function resolveStaffId(dir: StaffDirectory, staffId: string | null | undefined, staffName: string | null | undefined): string | null {
    if (staffId)
        return staffId;
    if (staffName)
        return dir.idByName.get(staffName) ?? null;
    return null;
}
export async function loadStaffDirectory(admin: Admin, facilityName: string): Promise<StaffDirectory> {
    const [staffRes, profilesRes] = await Promise.all([
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facilityName),
        admin.from("user_profiles").select("id, full_name").eq("facility", facilityName),
    ]);
    return buildStaffDirectory(staffRes.data as NamedRow[] | null, profilesRes.data as NamedRow[] | null);
}

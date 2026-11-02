export async function ladeNichtPflegeStationen(db: any, facilityName: string): Promise<string[]> {
    try {
        const { data, error } = await db.from("stations").select("name, ppbv_exempt").eq("facility_name", facilityName);
        if (error)
            return [];
        return ((data ?? []) as {
            name: string;
            ppbv_exempt?: boolean;
        }[]).filter(r => r.ppbv_exempt).map(r => r.name);
    }
    catch {
        return [];
    }
}

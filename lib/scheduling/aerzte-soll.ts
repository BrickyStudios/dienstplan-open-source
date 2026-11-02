import { planAusZeile } from "@/lib/plan";
import { leseBesetzung, leseReplacementMin } from "@/lib/scheduling/praxis-raster";
type AerzteSoll = {
    aerzteSoll: Record<string, Record<string, number>> | null;
    aerzteJeTag: Record<string, Record<string, number>> | null;
};
export async function ladeAerzteSoll(db: any, facilityName: string): Promise<AerzteSoll> {
    const leer = { aerzteSoll: null, aerzteJeTag: null };
    try {
        const { data, error } = await db.from("facility_settings")
            .select("plan, doctor_demand, day_shift_times").eq("facility_name", facilityName).maybeSingle();
        if (error || planAusZeile(data) !== "praxis")
            return leer;
        const tage = leseBesetzung(data?.day_shift_times);
        return {
            aerzteSoll: leseReplacementMin(data?.doctor_demand),
            aerzteJeTag: tage ? Object.fromEntries(Object.entries(tage).map(([tag, arten]) => [tag, Object.fromEntries(Object.entries(arten ?? {}).map(([art, b]) => [art, b!.aerzte]))])) : null,
        };
    }
    catch {
        return leer;
    }
}

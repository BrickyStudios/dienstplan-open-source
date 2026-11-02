export const PRESET_SPALTEN = [
    "preset_name",
    "preset_first_name",
    "preset_last_name",
    "preset_email",
    "preset_phone",
    "preset_password",
    "preset_hourly_rate",
    "preset_vacation_days",
    "preset_max_hours",
    "preset_job_type",
    "preset_station",
    "preset_station_secondary",
    "preset_minijob_buffer",
    "preset_weekend_pct",
    "preset_holiday_pct",
    "preset_break_min",
    "preset_certificates",
    "preset_role",
] as const;
const JUENGERE_SPALTEN = new Set<string>(["preset_role"]);
export function leerePresets(): Record<string, null> {
    return Object.fromEntries(PRESET_SPALTEN.map(s => [s, null]));
}
type MinimalerClient = {
    from: (t: string) => {
        update: (v: Record<string, null>) => {
            eq: (c: string, v: string) => PromiseLike<{
                error: {
                    message: string;
                } | null;
            }>;
        };
    };
};
export async function presetsLeeren(db: MinimalerClient, usedBy: string): Promise<void> {
    try {
        let { error } = await db.from("invite_codes").update(leerePresets()).eq("used_by", usedBy);
        if (error) {
            const ohneJuengere = Object.fromEntries(Object.entries(leerePresets()).filter(([k]) => !JUENGERE_SPALTEN.has(k)));
            ({ error } = await db.from("invite_codes").update(ohneJuengere).eq("used_by", usedBy));
        }
        if (error)
            console.error("[invite-presets] Leeren fehlgeschlagen:", error.message);
    }
    catch (err) {
        console.error("[invite-presets] Leeren fehlgeschlagen:", err);
    }
}

import type { SupabaseClient } from "@supabase/supabase-js";
type Admin = SupabaseClient<any>;
export type SwapMode = "manual" | "automatic" | "leitung_only";
export type SwapScopeSource = "station" | "bereich" | "einrichtung";
export type SwapScope = {
    enabled: boolean;
    source: SwapScopeSource;
    mode: SwapMode;
    staffMayInitiate: boolean;
    reason: string;
};
function toTriState(v: unknown): boolean | null {
    return v === true ? true : v === false ? false : null;
}
export async function loadSwapMode(admin: Admin, facility: string): Promise<SwapMode> {
    try {
        const { data, error } = await admin
            .from("facility_settings").select("shift_swap_mode").eq("facility_name", facility).maybeSingle();
        if (error)
            return "manual";
        const raw = (data as {
            shift_swap_mode?: string;
        } | null)?.shift_swap_mode;
        return raw === "automatic" || raw === "leitung_only" ? raw : "manual";
    }
    catch {
        return "manual";
    }
}
export async function loadStationOverrides(admin: Admin, facility: string): Promise<Map<string, boolean | null>> {
    const out = new Map<string, boolean | null>();
    try {
        const { data, error } = await admin
            .from("stations").select("name, shift_swap_enabled").eq("facility_name", facility);
        if (error)
            return out;
        for (const r of (data ?? []) as {
            name: string;
            shift_swap_enabled?: unknown;
        }[]) {
            out.set(r.name, toTriState(r.shift_swap_enabled));
        }
    }
    catch { }
    return out;
}
export async function loadBereichOverridesForStaff(admin: Admin, facility: string, userId: string): Promise<(boolean | null)[]> {
    try {
        const { data: members, error: e1 } = await admin
            .from("bereich_members").select("bereich_id").eq("facility_name", facility).eq("user_id", userId);
        if (e1 || !members || members.length === 0)
            return [];
        const ids = (members as {
            bereich_id: string;
        }[]).map(m => m.bereich_id);
        const { data, error } = await admin
            .from("bereiche").select("id, shift_swap_enabled").in("id", ids);
        if (error)
            return [];
        return ((data ?? []) as {
            shift_swap_enabled?: unknown;
        }[]).map(r => toTriState(r.shift_swap_enabled));
    }
    catch {
        return [];
    }
}
export function decideSwapScope(args: {
    mode: SwapMode;
    stationOverride: boolean | null;
    bereichOverrides: (boolean | null)[];
}): SwapScope {
    const { mode, stationOverride, bereichOverrides } = args;
    const staffMay = (enabled: boolean) => enabled && mode !== "leitung_only";
    if (stationOverride === false) {
        return {
            enabled: false, source: "station", mode, staffMayInitiate: false,
            reason: "Auf dieser Station ist der Schichttausch nicht freigegeben. Bitte die Leitung ansprechen.",
        };
    }
    if (bereichOverrides.some(v => v === false)) {
        return {
            enabled: false, source: "bereich", mode, staffMayInitiate: false,
            reason: "In deinem Bereich ist der Schichttausch nicht freigegeben. Bitte die Leitung ansprechen.",
        };
    }
    if (stationOverride === true) {
        return { enabled: true, source: "station", mode, staffMayInitiate: staffMay(true), reason: leitungOnlyHinweis(mode) };
    }
    if (bereichOverrides.some(v => v === true)) {
        return { enabled: true, source: "bereich", mode, staffMayInitiate: staffMay(true), reason: leitungOnlyHinweis(mode) };
    }
    return { enabled: true, source: "einrichtung", mode, staffMayInitiate: staffMay(true), reason: leitungOnlyHinweis(mode) };
}
function leitungOnlyHinweis(mode: SwapMode): string {
    return mode === "leitung_only"
        ? "In dieser Einrichtung werden Tausche ausschließlich über die Leitung durchgeführt."
        : "";
}
export async function resolveSwapScope(admin: Admin, facility: string, station: string | null | undefined, userId?: string | null): Promise<SwapScope> {
    const [mode, stationMap, bereichOverrides] = await Promise.all([
        loadSwapMode(admin, facility),
        station ? loadStationOverrides(admin, facility) : Promise.resolve(new Map<string, boolean | null>()),
        userId ? loadBereichOverridesForStaff(admin, facility, userId) : Promise.resolve([] as (boolean | null)[]),
    ]);
    return decideSwapScope({
        mode,
        stationOverride: station ? (stationMap.get(station) ?? null) : null,
        bereichOverrides,
    });
}
export async function resolveSwapScopeForStations(admin: Admin, facility: string, userId?: string | null): Promise<{
    mode: SwapMode;
    stations: {
        name: string;
        enabled: boolean;
        staffMayInitiate: boolean;
        source: SwapScopeSource;
    }[];
}> {
    const [mode, stationMap, bereichOverrides] = await Promise.all([
        loadSwapMode(admin, facility),
        loadStationOverrides(admin, facility),
        userId ? loadBereichOverridesForStaff(admin, facility, userId) : Promise.resolve([] as (boolean | null)[]),
    ]);
    const stations = [...stationMap.entries()].map(([name, override]) => {
        const scope = decideSwapScope({ mode, stationOverride: override, bereichOverrides });
        return { name, enabled: scope.enabled, staffMayInitiate: scope.staffMayInitiate, source: scope.source };
    });
    return { mode, stations };
}

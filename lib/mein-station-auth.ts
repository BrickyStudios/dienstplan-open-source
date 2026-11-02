import { NextRequest } from "next/server";
import { viewerStatus } from "@/lib/demo-auth";
import { admin } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
export type StationStaffCtx = {
    userId: string;
    facility: string;
    name: string;
    demoStaffName: string | null;
    stations: string[];
    isDemo: boolean;
};
export const stationAdmin = admin;
export async function resolveStationStaff(req: NextRequest): Promise<StationStaffCtx | null> {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const db = stationAdmin();
    const { data: profile } = await db
        .from("user_profiles")
        .select("full_name, facility, station, station_secondary")
        .eq("id", user.id)
        .maybeSingle();
    const { admin: isAdmin, demo: isDemo, dev: isDev } = await viewerStatus(user);
    const privileged = isAdmin || isDemo || isDev;
    const accessFacility = isAdmin ? req.cookies.get("nurvo_access_facility")?.value : undefined;
    const demoStaffId = privileged ? (req.cookies.get("nurvo_demo_staff_id")?.value || null) : null;
    const demoStaffName = privileged ? (req.cookies.get("nurvo_demo_staff_name")?.value || null) : null;
    let userId = user.id;
    let name = profile?.full_name || "";
    let stationSrc: {
        station?: string | null;
        station_secondary?: string | null;
    } = profile ?? {};
    if (demoStaffId) {
        const { data: ds } = await db
            .from("user_profiles")
            .select("full_name, station, station_secondary")
            .eq("id", demoStaffId)
            .maybeSingle();
        if (ds) {
            userId = demoStaffId;
            name = demoStaffName || ds.full_name || name;
            stationSrc = ds;
        }
    }
    const facility = accessFacility || profile?.facility || "";
    if (!facility)
        return null;
    const stations = [stationSrc.station, stationSrc.station_secondary]
        .map(s => (s ?? "").trim())
        .filter(s => s.length > 0);
    return { userId, facility, name, demoStaffName, stations: Array.from(new Set(stations)), isDemo };
}
export async function leaderStations(ctx: StationStaffCtx): Promise<string[]> {
    if (ctx.stations.length === 0)
        return [];
    if (ctx.isDemo)
        return ctx.stations;
    const { data, error } = await stationAdmin()
        .from("station_leaders")
        .select("station_name, user_id, staff_name")
        .eq("facility_name", ctx.facility)
        .in("station_name", ctx.stations);
    if (error)
        return [];
    return (data ?? [])
        .filter(l => l.user_id === ctx.userId || (ctx.demoStaffName && l.staff_name === ctx.demoStaffName))
        .map(l => l.station_name as string);
}

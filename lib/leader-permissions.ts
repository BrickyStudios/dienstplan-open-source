import { admin } from "@/lib/admin-client";
export type LeaderPermissions = {
    vacation: boolean;
    wishes: boolean;
};
export type LeaderVacationRequest = {
    id: string;
    staff_id: string;
    staffName: string;
    from_date: string;
    to_date: string;
    days: number;
    reason: string | null;
    status: string;
    submitted_at: string;
};
export type LeaderWish = {
    id: string;
    user_id: string;
    full_name: string;
    date_from: string | null;
    date_to: string | null;
    shift_type: string;
    wish_type: string;
    message: string;
    status: string;
    created_at: string;
};
export const VACATION_DECISIONS = ["approved", "declined"] as const;
export const WISH_DECISIONS = ["berücksichtigt", "abgelehnt"] as const;
export async function getLeaderPermissions(facility: string): Promise<LeaderPermissions> {
    if (!facility)
        return { vacation: false, wishes: false };
    const { data, error } = await admin()
        .from("facility_settings")
        .select("leaders_manage_vacation, leaders_manage_wishes")
        .eq("facility_name", facility)
        .maybeSingle();
    if (error || !data)
        return { vacation: false, wishes: false };
    return {
        vacation: data.leaders_manage_vacation === true,
        wishes: data.leaders_manage_wishes === true,
    };
}
export async function pendingVacationFor(memberIds: string[], nameById: Record<string, string>): Promise<LeaderVacationRequest[]> {
    if (memberIds.length === 0)
        return [];
    const { data, error } = await admin()
        .from("vacation_requests")
        .select("*")
        .in("staff_id", memberIds)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });
    if (error)
        return [];
    return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: nameById[r.staff_id as string] ?? "Mitarbeiter",
        from_date: r.from_date as string,
        to_date: r.to_date as string,
        days: (r.days as number) ?? 0,
        reason: (r.reason as string | null) ?? null,
        status: r.status as string,
        submitted_at: r.submitted_at as string,
    }));
}
export async function openWishesFor(memberIds: string[]): Promise<LeaderWish[]> {
    if (memberIds.length === 0)
        return [];
    const { data, error } = await admin()
        .from("staff_wishes")
        .select("*")
        .in("user_id", memberIds)
        .eq("status", "offen")
        .order("created_at", { ascending: false });
    if (error)
        return [];
    return (data ?? []) as LeaderWish[];
}

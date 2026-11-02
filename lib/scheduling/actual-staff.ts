import { admin as createAdminClient } from "@/lib/admin-client";
type AdminClient = ReturnType<typeof createAdminClient>;
const SHIFT_ID_BATCH = 200;
export function zaehltAlsBesetzt(status: string | null | undefined): boolean {
    return (status ?? "confirmed") !== "cancelled";
}
export function countAssignmentsByShift(shiftIds: string[], rows: Array<{
    shift_id: string | null;
    status?: string | null;
}>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of shiftIds)
        counts.set(id, 0);
    for (const r of rows) {
        if (!r.shift_id || !counts.has(r.shift_id))
            continue;
        if (!zaehltAlsBesetzt(r.status))
            continue;
        counts.set(r.shift_id, (counts.get(r.shift_id) ?? 0) + 1);
    }
    return counts;
}
export function groupShiftIdsByCount(counts: Map<string, number>): Map<number, string[]> {
    const byCount = new Map<number, string[]>();
    for (const [shiftId, count] of counts) {
        const list = byCount.get(count);
        if (list)
            list.push(shiftId);
        else
            byCount.set(count, [shiftId]);
    }
    return byCount;
}
export async function syncActualStaff(admin: AdminClient, facilityName: string, shiftIds: string[]): Promise<{
    updated: number;
    error: string | null;
}> {
    const ids = [...new Set(shiftIds.filter(Boolean))];
    if (!facilityName || ids.length === 0)
        return { updated: 0, error: null };
    try {
        const rows: Array<{
            shift_id: string | null;
            status: string | null;
        }> = [];
        for (let i = 0; i < ids.length; i += SHIFT_ID_BATCH) {
            const chunk = ids.slice(i, i + SHIFT_ID_BATCH);
            const { data, error } = await admin
                .from("shift_assignments")
                .select("shift_id, status")
                .eq("facility_name", facilityName)
                .in("shift_id", chunk);
            if (error)
                return { updated: 0, error: error.message };
            rows.push(...((data ?? []) as Array<{
                shift_id: string | null;
                status: string | null;
            }>));
        }
        const byCount = groupShiftIdsByCount(countAssignmentsByShift(ids, rows));
        let updated = 0;
        let firstError: string | null = null;
        for (const [count, group] of byCount) {
            for (let i = 0; i < group.length; i += SHIFT_ID_BATCH) {
                const chunk = group.slice(i, i + SHIFT_ID_BATCH);
                const { error } = await admin
                    .from("shifts")
                    .update({ actual_staff: count })
                    .eq("facility_name", facilityName)
                    .in("id", chunk);
                if (error)
                    firstError ??= error.message;
                else
                    updated += chunk.length;
            }
        }
        return { updated, error: firstError };
    }
    catch (e) {
        return { updated: 0, error: e instanceof Error ? e.message : String(e) };
    }
}

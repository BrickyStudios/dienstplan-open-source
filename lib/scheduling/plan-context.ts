import { admin as createAdminClient } from "@/lib/admin-client";
import type { RawAbsence, RawBurnoutScore, RawWishHistory, RawWish } from "@/lib/scheduling/generate-plan-core";
import { withinRange, shiftHours } from "@/lib/scheduling/generate-plan-core";
import { ladeAkteAbwesenheiten } from "@/lib/personalakte/fehlzeiten";
import { utcTagISO } from "@/lib/date";
type AdminClient = ReturnType<typeof createAdminClient>;
export async function ladeGenehmigteAbwesenheiten(admin: AdminClient, opts: {
    facilityName: string;
    staffIds: string[];
    von: string;
    bis: string;
}): Promise<RawAbsence[]> {
    const { facilityName, staffIds, von, bis } = opts;
    const out: RawAbsence[] = [];
    if (staffIds.length > 0) {
        try {
            const { data } = await admin
                .from("vacation_requests")
                .select("staff_id, from_date, to_date, status")
                .eq("status", "approved")
                .in("staff_id", staffIds)
                .lte("from_date", bis)
                .gte("to_date", von);
            for (const v of (data ?? []) as Array<{
                staff_id: string | null;
                from_date: string | null;
                to_date: string | null;
            }>) {
                if (!v.staff_id || !v.from_date || !v.to_date)
                    continue;
                out.push({ staff_id: v.staff_id, from: v.from_date, to: v.to_date, kind: "urlaub" });
            }
        }
        catch { }
    }
    try {
        const { data } = await admin
            .from("sick_reports")
            .select("sick_user_id, sick_date, status")
            .eq("facility_name", facilityName)
            .gte("sick_date", von)
            .lte("sick_date", bis);
        for (const s of (data ?? []) as Array<{
            sick_user_id: string | null;
            sick_date: string | null;
            status: string | null;
        }>) {
            if (!s.sick_user_id || !s.sick_date || s.status === "cancelled")
                continue;
            out.push({ staff_id: s.sick_user_id, from: s.sick_date, to: s.sick_date, kind: "krank" });
        }
    }
    catch { }
    const ids = new Set(staffIds);
    for (const a of await ladeAkteAbwesenheiten(admin, facilityName, von, bis)) {
        if (ids.size && !ids.has(a.staff_id))
            continue;
        out.push({ staff_id: a.staff_id, from: a.von, to: a.bis, kind: a.krank ? "krank" : a.label });
    }
    return out;
}
export async function ladeBurnoutScores(admin: AdminClient, opts: {
    facilityName: string;
    staffIds: string[];
}): Promise<RawBurnoutScore[]> {
    const { facilityName, staffIds } = opts;
    if (staffIds.length === 0)
        return [];
    try {
        const { data, error } = await admin
            .from("burnout_scores")
            .select("staff_id, score")
            .eq("facility_name", facilityName)
            .in("staff_id", staffIds);
        if (error)
            return [];
        return (data ?? [])
            .map((r: {
            staff_id: string | null;
            score: number | string | null;
        }) => ({
            staff_id: String(r.staff_id ?? ""),
            score: Number(r.score ?? 0),
        }))
            .filter((r: RawBurnoutScore) => r.staff_id !== "" && Number.isFinite(r.score) && r.score > 0);
    }
    catch {
        return [];
    }
}
export function berechneWunschHistorie(wishes: RawWish[] | null | undefined, vergangeneZuteilungen: Array<{
    staff_id: string;
    date: string;
    shift_type: string;
}>, fenster: {
    von: string;
    bis: string;
}, idByName?: Map<string, string>): RawWishHistory[] {
    const zuteilungenProPerson: Record<string, Array<{
        date: string;
        shift_type: string;
    }>> = {};
    for (const a of vergangeneZuteilungen) {
        if (!a.staff_id)
            continue;
        (zuteilungenProPerson[a.staff_id] ??= []).push({ date: a.date, shift_type: a.shift_type });
    }
    const granted: Record<string, number> = {};
    for (const w of wishes ?? []) {
        if (w.wish_type !== "preference" || w.status === "abgelehnt")
            continue;
        const staffId = w.user_id ?? idByName?.get(w.full_name) ?? null;
        if (!staffId)
            continue;
        const von = w.date_from ?? fenster.von;
        const bis = w.date_to ?? fenster.bis;
        if (bis < fenster.von || von > fenster.bis)
            continue;
        const erfuellt = (zuteilungenProPerson[staffId] ?? []).some(a => withinRange(a.date, w.date_from, w.date_to) &&
            (w.shift_type === "all" || w.shift_type === a.shift_type));
        if (erfuellt)
            granted[staffId] = (granted[staffId] ?? 0) + 1;
    }
    return Object.entries(granted).map(([staff_id, n]) => ({ staff_id, granted: n }));
}
export type PriorAssignment = {
    staff_id: string;
    date: string;
    shift_type: string;
    hours: number;
};
export const RUECKBLICK_TAGE = 56;
const PRIOR_TAGE = 7;
type ShiftZeile = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
};
export async function ladeVorgeschichte(admin: AdminClient, opts: {
    facilityName: string;
    planStart: string;
    wishes: RawWish[] | null | undefined;
    profiles: Array<{
        id: string;
        full_name: string | null;
    }> | null | undefined;
}): Promise<{
    priorAssignments: PriorAssignment[];
    wishHistory: RawWishHistory[];
}> {
    const leer = { priorAssignments: [] as PriorAssignment[], wishHistory: [] as RawWishHistory[] };
    try {
        const start = new Date(opts.planStart + "T00:00:00Z");
        const tagVersetzt = (n: number) => {
            const d = new Date(start);
            d.setUTCDate(start.getUTCDate() - n);
            return utcTagISO(d);
        };
        const priorToIso = tagVersetzt(1);
        const priorFromIso = tagVersetzt(PRIOR_TAGE);
        const rueckblickFromIso = tagVersetzt(RUECKBLICK_TAGE);
        const { data: priorShifts } = await admin
            .from("shifts")
            .select("id, date, shift_type, start_time, end_time")
            .eq("facility_name", opts.facilityName)
            .gte("date", rueckblickFromIso)
            .lte("date", priorToIso);
        const priorShiftIds = ((priorShifts ?? []) as ShiftZeile[]).map(s => s.id);
        if (priorShiftIds.length === 0)
            return leer;
        const { data: priorAssigns } = await admin
            .from("shift_assignments")
            .select("shift_id, staff_id, status")
            .eq("facility_name", opts.facilityName)
            .in("shift_id", priorShiftIds);
        const byId = new Map(((priorShifts ?? []) as ShiftZeile[]).map(s => [s.id, s]));
        const alleZuteilungen: PriorAssignment[] = ((priorAssigns ?? []) as Array<{
            shift_id: string;
            staff_id: string | null;
            status?: string | null;
        }>)
            .filter(a => a.staff_id && (a.status ?? "confirmed") !== "cancelled")
            .map(a => {
            const sh = byId.get(a.shift_id)!;
            return { staff_id: a.staff_id as string, date: sh.date, shift_type: sh.shift_type, hours: shiftHours(sh) };
        });
        const idByName = new Map((opts.profiles ?? []).filter(p => p.full_name).map(p => [p.full_name as string, p.id]));
        return {
            priorAssignments: alleZuteilungen.filter(a => a.date >= priorFromIso),
            wishHistory: berechneWunschHistorie(opts.wishes, alleZuteilungen, { von: rueckblickFromIso, bis: priorToIso }, idByName),
        };
    }
    catch {
        return leer;
    }
}

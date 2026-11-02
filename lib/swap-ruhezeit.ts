import type { SupabaseClient } from "@supabase/supabase-js";
import { ARBZG_MIN_REST_MINUTES, checkRuhezeiten } from "@/lib/arbzg";
import { addDaysISO } from "@/lib/date";
import { MIN_REST_HOURS_VERKUERZT_ARBZG } from "@/lib/legal-limits";
type Admin = SupabaseClient<any>;
export const ARBZG_REDUCED_REST_MINUTES = MIN_REST_HOURS_VERKUERZT_ARBZG * 60;
export type RuhezeitVerstoss = {
    staffName: string;
    restMinutes: number;
    unterAbsatz2: boolean;
};
export type SwapRuhezeitResult = {
    warn: boolean;
    reason: string;
    verstoesse: RuhezeitVerstoss[];
};
const OK: SwapRuhezeitResult = { warn: false, reason: "", verstoesse: [] };
export type SwapRuhezeitParams = {
    requesterShiftId: string;
    targetShiftId: string;
    requesterStaffId?: string | null;
    targetStaffId?: string | null;
    requesterName?: string | null;
    targetName?: string | null;
};
type ShiftRow = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
};
type AssignRow = {
    shift_id: string;
    staff_id: string | null;
    staff_name: string | null;
    status: string | null;
};
const stunden = (min: number) => (min / 60).toFixed(1).replace(".", ",").replace(",0", "");
const key = (staff: string, prev: string, next: string) => `${staff}|${prev}|${next}`;
export async function assessSwapRuhezeit(admin: Admin, facility: string, p: SwapRuhezeitParams): Promise<SwapRuhezeitResult> {
    const { data: pair } = await admin.from("shifts")
        .select("id, station, date, shift_type, start_time, end_time")
        .eq("facility_name", facility).in("id", [p.requesterShiftId, p.targetShiftId]);
    const reqShift = (pair as ShiftRow[] | null)?.find(s => s.id === p.requesterShiftId);
    const tgtShift = (pair as ShiftRow[] | null)?.find(s => s.id === p.targetShiftId);
    if (!reqShift || !tgtShift)
        return OK;
    const dates = [reqShift.date, tgtShift.date].sort();
    const from = addDaysISO(dates[0], -1);
    const to = addDaysISO(dates[1], 1);
    const { data: windowShifts } = await admin.from("shifts")
        .select("id, station, date, shift_type, start_time, end_time")
        .eq("facility_name", facility).gte("date", from).lte("date", to);
    const shifts = (windowShifts ?? []) as ShiftRow[];
    if (!shifts.length)
        return OK;
    const { data: assignData } = await admin.from("shift_assignments")
        .select("shift_id, staff_id, staff_name, status")
        .eq("facility_name", facility).in("shift_id", shifts.map(s => s.id));
    const assignments = ((assignData ?? []) as AssignRow[])
        .filter(a => (a.status ?? "confirmed") === "confirmed");
    const nameOf = (id?: string | null, fallback?: string | null) => assignments.find(a => id && a.staff_id === id)?.staff_name ?? fallback ?? null;
    const reqName = nameOf(p.requesterStaffId, p.requesterName);
    const tgtName = nameOf(p.targetStaffId, p.targetName);
    if (!reqName || !tgtName || reqName === tgtName)
        return OK;
    const belegung = (vertauscht: boolean): Record<string, string[]> => {
        const out: Record<string, string[]> = {};
        for (const a of assignments) {
            let name = a.staff_name;
            if (vertauscht && name) {
                if (a.shift_id === reqShift.id && name === reqName)
                    name = tgtName;
                else if (a.shift_id === tgtShift.id && name === tgtName)
                    name = reqName;
            }
            if (!name)
                continue;
            (out[a.shift_id] ??= []).push(name);
        }
        return out;
    };
    const betroffen = new Set([reqName, tgtName]);
    const vorher = new Set(checkRuhezeiten(shifts, belegung(false))
        .filter(v => betroffen.has(v.staffName))
        .map(v => key(v.staffName, v.prevShiftId, v.nextShiftId)));
    const verstoesse: RuhezeitVerstoss[] = [];
    for (const v of checkRuhezeiten(shifts, belegung(true))) {
        if (!betroffen.has(v.staffName))
            continue;
        if (vorher.has(key(v.staffName, v.prevShiftId, v.nextShiftId)))
            continue;
        verstoesse.push({
            staffName: v.staffName,
            restMinutes: v.restMinutes,
            unterAbsatz2: v.restMinutes < ARBZG_REDUCED_REST_MINUTES,
        });
    }
    if (!verstoesse.length)
        return OK;
    verstoesse.sort((a, b) => a.restMinutes - b.restMinutes);
    const v = verstoesse[0];
    const kern = `${v.staffName} kaeme durch diesen Tausch auf nur ${stunden(v.restMinutes)} h Ruhezeit `
        + `(§ 5 ArbZG: ${stunden(ARBZG_MIN_REST_MINUTES)} h).`;
    const zusatz = v.unterAbsatz2
        ? " Das liegt auch unter den 10 h, die § 5 Abs. 2 ArbZG fuer Kliniken und Pflegeeinrichtungen "
            + "als kuerzeste Ruhezeit zulaesst."
        : " In Kliniken und Pflegeeinrichtungen ist das nach § 5 Abs. 2 ArbZG zulaessig, wenn die "
            + "Verkuerzung innerhalb eines Kalendermonats durch eine Ruhezeit von mindestens 12 h "
            + "ausgeglichen wird. Der Ausgleich ist zu dokumentieren.";
    return { warn: true, reason: kern + zusatz, verstoesse };
}

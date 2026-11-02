import { MIN_REST_HOURS_ARBZG } from "@/lib/legal-limits";
export const ARBZG_MIN_REST_MINUTES = MIN_REST_HOURS_ARBZG * 60;
export type ArbZGViolation = {
    type: "ruhezeit";
    staffName: string;
    prevShiftId: string;
    nextShiftId: string;
    prevEnd: Date;
    nextStart: Date;
    restMinutes: number;
};
type ShiftRef = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null | undefined;
    end_time: string | null | undefined;
};
const FALLBACK_TIMES: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
function parseShiftDatetimes(shift: ShiftRef): {
    startDt: Date;
    endDt: Date;
} | null {
    const fallback = FALLBACK_TIMES[shift.shift_type] ?? FALLBACK_TIMES.frueh;
    const st = shift.start_time || fallback.start;
    const et = shift.end_time || fallback.end;
    const startH = parseInt(st.split(":")[0], 10);
    const endH = parseInt(et.split(":")[0], 10);
    const startDt = new Date(`${shift.date}T${st}:00`);
    const endDt = new Date(`${shift.date}T${et}:00`);
    if (endH <= startH) {
        endDt.setDate(endDt.getDate() + 1);
    }
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()))
        return null;
    return { startDt, endDt };
}
export function checkRuhezeiten(shifts: ShiftRef[], assignmentsByShift: Record<string, string[]>): ArbZGViolation[] {
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    const byStaff = new Map<string, Array<{
        shiftId: string;
        startDt: Date;
        endDt: Date;
    }>>();
    for (const [shiftId, staffNames] of Object.entries(assignmentsByShift)) {
        const shift = shiftMap.get(shiftId);
        if (!shift)
            continue;
        const times = parseShiftDatetimes(shift);
        if (!times)
            continue;
        for (const name of staffNames) {
            if (!byStaff.has(name))
                byStaff.set(name, []);
            byStaff.get(name)!.push({ shiftId, ...times });
        }
    }
    const violations: ArbZGViolation[] = [];
    for (const [staffName, entries] of byStaff.entries()) {
        entries.sort((a, b) => a.startDt.getTime() - b.startDt.getTime());
        for (let i = 0; i < entries.length - 1; i++) {
            const prev = entries[i];
            const next = entries[i + 1];
            const restMinutes = Math.floor((next.startDt.getTime() - prev.endDt.getTime()) / 60000);
            if (restMinutes < ARBZG_MIN_REST_MINUTES) {
                violations.push({
                    type: "ruhezeit",
                    staffName,
                    prevShiftId: prev.shiftId,
                    nextShiftId: next.shiftId,
                    prevEnd: prev.endDt,
                    nextStart: next.startDt,
                    restMinutes,
                });
            }
        }
    }
    return violations;
}

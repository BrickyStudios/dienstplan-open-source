import { einsatzStationenVon, extractContractDefaults, resolveStaffLimits, type ContractDefaults, type RawAbsence, type RawFacilityStaff, } from "@/lib/scheduling/generate-plan-core";
import { dienstplanungVon } from "@/lib/scheduling/dienstplanung";
import type { Belegung, EignungsPerson, EignungsSchicht, PersonGrenzen } from "@/lib/scheduling/eignung";
import { addDaysISO } from "@/lib/date";
export type PlanSchicht = EignungsSchicht & {
    planned_staff: number;
};
export type PlanPerson = EignungsPerson & {
    station: string | null;
    rolle: string | null;
    einsatzStationen: string[];
};
export type Stationsplanung = {
    station: string;
    stationsSchichten: PlanSchicht[];
    schichten: EignungsSchicht[];
    belegung: Belegung[];
    namenJeSchicht: Record<string, string[]>;
    springerJeSchicht: Record<string, string[]>;
    personen: PlanPerson[];
};
type ShiftRow = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    planned_staff: number | null;
    start_time: string | null;
    end_time: string | null;
};
type AssignRow = {
    shift_id: string;
    staff_id: string | null;
    staff_name: string;
    status?: string | null;
    is_springer?: boolean | null;
};
type ProfileRow = {
    id: string;
    full_name: string | null;
    station: string | null;
};
type StaffRow = RawFacilityStaff & {
    role?: string | null;
};
const KEINE_GRENZE = (n: number) => (Number.isFinite(n) ? n : null);
function addTage(iso: string, n: number): string { return addDaysISO(iso, n); }
export function baueStationsplanung(input: {
    station: string;
    von: string;
    bis: string;
    shifts: ShiftRow[];
    assignments: AssignRow[];
    facilityStaff: StaffRow[];
    profiles: ProfileRow[];
    settings: ContractDefaults | null;
    absences: RawAbsence[];
}): Stationsplanung {
    const { station, von, bis } = input;
    const defaults = extractContractDefaults(input.settings);
    const stammById = new Map(input.facilityStaff.map(s => [s.id, s]));
    const personen = new Map<string, PlanPerson>();
    const neu = (id: string, name: string, stationName: string | null, stamm: StaffRow | undefined): PlanPerson => {
        const l = resolveStaffLimits(stamm, defaults);
        const grenzen: PersonGrenzen = {
            maxConsecutiveNights: KEINE_GRENZE(l.maxConsecutiveNights),
            maxConsecutiveDays: KEINE_GRENZE(l.maxConsecutiveDays),
            maxShiftsPerWeek: KEINE_GRENZE(l.maxShiftsPerWeek),
            maxHoursPerShift: KEINE_GRENZE(l.maxHoursPerShift),
            minRestHours: l.minRestHours,
            noSundayWork: l.noSundayWork,
            dienstplanung: dienstplanungVon(stamm),
        };
        return {
            id, name, station: stationName, rolle: stamm?.role ?? null,
            einsatzStationen: einsatzStationenVon(stamm),
            vertragsMinutenWoche: Math.round((Number(stamm?.max_hours_per_week) || 40) * 60),
            grenzen, abwesendeTage: {},
        };
    };
    const stationNachName = new Map<string, string>();
    for (const p of input.profiles)
        if (p.full_name && p.station)
            stationNachName.set(p.full_name, p.station);
    for (const p of input.profiles) {
        if (!p.full_name || personen.has(p.full_name))
            continue;
        personen.set(p.full_name, neu(p.id, p.full_name, p.station ?? null, stammById.get(p.id) ?? input.facilityStaff.find(f => f.full_name === p.full_name)));
    }
    for (const s of input.facilityStaff) {
        if (!s.full_name || personen.has(s.full_name) || s.active === false)
            continue;
        personen.set(s.full_name, neu(s.id, s.full_name, stationNachName.get(s.full_name) ?? s.station ?? null, s));
    }
    const nachId = new Map([...personen.values()].map(p => [p.id, p]));
    for (const a of input.absences) {
        const p = nachId.get(a.staff_id);
        if (!p || !a.from || !a.to)
            continue;
        let tag = a.from < von ? von : a.from;
        const ende = a.to > bis ? bis : a.to;
        for (let i = 0; tag <= ende && i < 400; i++) {
            const grund = a.kind === "krank" ? "Krankmeldung" : !a.kind || a.kind === "urlaub" ? "Urlaub" : a.kind;
            if (p.abwesendeTage[tag] !== "Krankmeldung")
                p.abwesendeTage[tag] = grund;
            tag = addTage(tag, 1);
        }
    }
    const schichten: EignungsSchicht[] = input.shifts.map(s => ({
        id: s.id, date: s.date, shift_type: s.shift_type,
        start_time: s.start_time, end_time: s.end_time, station: s.station,
    }));
    const stationsSchichten: PlanSchicht[] = input.shifts
        .filter(s => s.station === station && s.date >= von && s.date <= bis)
        .map(s => ({
        id: s.id, date: s.date, shift_type: s.shift_type, start_time: s.start_time,
        end_time: s.end_time, station: s.station, planned_staff: Number(s.planned_staff) || 0,
    }))
        .sort((a, b) => a.date.localeCompare(b.date) || REIHENFOLGE(a.shift_type) - REIHENFOLGE(b.shift_type));
    const belegung: Belegung[] = [];
    const namenJeSchicht: Record<string, string[]> = {};
    const springerJeSchicht: Record<string, string[]> = {};
    for (const a of input.assignments) {
        if ((a.status ?? "confirmed") === "cancelled")
            continue;
        (namenJeSchicht[a.shift_id] ??= []).push(a.staff_name);
        if (a.is_springer)
            (springerJeSchicht[a.shift_id] ??= []).push(a.staff_name);
        const p = (a.staff_id && nachId.get(a.staff_id)) || personen.get(a.staff_name);
        if (p)
            belegung.push({ shiftId: a.shift_id, staffId: p.id });
    }
    const sortiert = [...personen.values()].sort((a, b) => {
        const aHier = a.station === station ? 0 : 1;
        const bHier = b.station === station ? 0 : 1;
        return aHier - bHier || a.name.localeCompare(b.name, "de");
    });
    return { station, stationsSchichten, schichten, belegung, namenJeSchicht, springerJeSchicht, personen: sortiert };
}
function REIHENFOLGE(t: string): number {
    return t === "frueh" ? 0 : t === "spaet" ? 1 : t === "nacht" ? 2 : 3;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardAssignment, GuardShift, GuardStaff } from "@/lib/ai-guardrails";
import { addDaysISO } from "@/lib/date";
import { ladeAkteAbwesenheiten } from "@/lib/personalakte/fehlzeiten";
type Admin = SupabaseClient<any>;
export const SHIFT_LABEL: Record<string, string> = {
    frueh: "Frühdienst",
    spaet: "Spätdienst",
    nacht: "Nachtdienst",
};
export const FALLBACK_TIME: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
export { addDaysISO as addDays } from "@/lib/date";
import { isoWeekRange } from "@/lib/date";
export { isoWeekRange };
export function shiftMinutesLocal(s: {
    start_time: string | null;
    end_time: string | null;
    shift_type: string;
}): number {
    const fb = FALLBACK_TIME[s.shift_type] ?? FALLBACK_TIME.frueh;
    const [sh, sm] = (s.start_time || fb.start).split(":").map(Number);
    const [eh, em] = (s.end_time || fb.end).split(":").map(Number);
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end <= start)
        end += 24 * 60;
    return end - start;
}
export type GuardDaten = {
    shifts: GuardShift[];
    staff: GuardStaff[];
    bestehend: GuardAssignment[];
};
export function abwesenheitenNachTag(input: {
    urlaube: Array<{
        staff_id: string;
        from_date: string;
        to_date: string;
    }>;
    krankmeldungen: Array<{
        sick_staff_name: string | null;
        sick_date: string;
    }>;
    akte?: Array<{
        staff_id: string;
        von: string;
        bis: string;
        label: string;
        krank: boolean;
    }>;
    nameByStaffId: Map<string, string>;
    von: string;
    bis: string;
}): Map<string, Record<string, string>> {
    const { urlaube, krankmeldungen, akte = [], nameByStaffId, von, bis } = input;
    const nachName = new Map<string, Record<string, string>>();
    const setze = (name: string, tag: string, grund: string) => {
        const bisher = nachName.get(name) ?? {};
        if (bisher[tag] !== "Krankmeldung")
            bisher[tag] = grund;
        nachName.set(name, bisher);
    };
    for (const u of urlaube) {
        const name = nameByStaffId.get(u.staff_id);
        if (!name || !u.from_date || !u.to_date)
            continue;
        let tag = u.from_date < von ? von : u.from_date;
        const ende = u.to_date > bis ? bis : u.to_date;
        for (let i = 0; tag <= ende && i < 400; i++) {
            setze(name, tag, "Urlaub");
            tag = addDaysISO(tag, 1);
        }
    }
    for (const a of akte) {
        const name = nameByStaffId.get(a.staff_id);
        if (!name)
            continue;
        let tag = a.von < von ? von : a.von;
        const ende = a.bis > bis ? bis : a.bis;
        for (let i = 0; tag <= ende && i < 400; i++) {
            setze(name, tag, a.krank ? "Krankmeldung" : a.label);
            tag = addDaysISO(tag, 1);
        }
    }
    for (const k of krankmeldungen) {
        if (k.sick_staff_name && k.sick_date)
            setze(k.sick_staff_name, k.sick_date, "Krankmeldung");
    }
    return nachName;
}
export async function ladeEinrichtungsKlartexte(admin: Admin, facilityName: string): Promise<{
    einrichtung: string[];
    stationen: string[];
}> {
    const [settingsRes, stationsRes] = await Promise.all([
        admin.from("facility_settings").select("ort").eq("facility_name", facilityName).maybeSingle(),
        admin.from("stations").select("name").eq("facility_name", facilityName),
    ]);
    const ort = (settingsRes.data as {
        ort?: string | null;
    } | null)?.ort ?? null;
    return {
        einrichtung: [facilityName, ort].filter((x): x is string => !!x && !!x.trim()),
        stationen: ((stationsRes.data ?? []) as Array<{
            name: string | null;
        }>).map(r => r.name ?? "").filter(Boolean),
    };
}
export async function ladePersonenNamen(admin: Admin, facilityName: string): Promise<{
    id: string;
    name: string;
}[]> {
    const [staffRes, profilesRes] = await Promise.all([
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facilityName),
        admin.from("user_profiles").select("id, full_name").eq("facility", facilityName),
    ]);
    const rows = [
        ...((profilesRes.data ?? []) as Array<{
            id: string;
            full_name: string | null;
        }>),
        ...((staffRes.data ?? []) as Array<{
            id: string;
            full_name: string | null;
        }>),
    ];
    const gesehen = new Set<string>();
    return rows
        .filter(r => r.full_name && !gesehen.has(r.full_name) && gesehen.add(r.full_name))
        .map(r => ({ id: r.id, name: r.full_name! }));
}
export async function ladeGuardDaten(admin: Admin, facilityName: string, zielVon: string, zielBis: string): Promise<GuardDaten> {
    const woche = isoWeekRange(zielVon);
    const fensterVon = addDaysISO(zielVon, -7) < woche.start ? addDaysISO(zielVon, -7) : woche.start;
    const [shiftsRes, staffRes, profilesRes, vacRes, sickRes] = await Promise.all([
        admin.from("shifts")
            .select("id, station, date, shift_type, planned_staff, start_time, end_time")
            .eq("facility_name", facilityName)
            .gte("date", fensterVon).lte("date", zielBis),
        admin.from("facility_staff")
            .select("id, full_name, role, max_hours_per_week, active")
            .eq("facility_name", facilityName)
            .or("active.neq.false,active.is.null"),
        admin.from("user_profiles")
            .select("id, full_name")
            .eq("facility", facilityName).eq("role", "mitarbeiter"),
        admin.from("vacation_requests")
            .select("staff_id, from_date, to_date, status")
            .eq("status", "approved")
            .lte("from_date", zielBis).gte("to_date", zielVon),
        admin.from("sick_reports")
            .select("sick_staff_name, sick_date")
            .eq("facility_name", facilityName)
            .gte("sick_date", zielVon).lte("sick_date", zielBis),
    ]);
    type ShiftRow = {
        id: string;
        station: string;
        date: string;
        shift_type: string;
        planned_staff: number;
        start_time: string | null;
        end_time: string | null;
    };
    const shiftRows = (shiftsRes.data ?? []) as ShiftRow[];
    const shiftIds = shiftRows.map(s => s.id);
    type AssignRow = {
        shift_id: string;
        staff_id: string | null;
        staff_name: string;
        status?: string | null;
    };
    const assignRes = shiftIds.length
        ? await admin.from("shift_assignments")
            .select("shift_id, staff_id, staff_name, status")
            .eq("facility_name", facilityName)
            .in("shift_id", shiftIds)
        : { data: [] as AssignRow[] };
    const confirmed = ((assignRes.data ?? []) as AssignRow[])
        .filter(a => (a.status ?? "confirmed") !== "cancelled");
    type FacilityStaffRow = {
        id: string;
        full_name: string;
        role: string;
        max_hours_per_week: number;
        active: boolean | null;
    };
    const facilityStaffById = new Map(((staffRes.data ?? []) as FacilityStaffRow[]).map(s => [s.id, s]));
    const staffByName = new Map<string, {
        id: string;
        name: string;
        role: string;
        maxHoursPerWeek: number;
    }>();
    for (const p of (profilesRes.data ?? []) as Array<{
        id: string;
        full_name: string;
    }>) {
        if (!p.full_name)
            continue;
        const raw = facilityStaffById.get(p.id);
        staffByName.set(p.full_name, {
            id: p.id,
            name: p.full_name,
            role: raw?.role || "Pflegekraft",
            maxHoursPerWeek: Number(raw?.max_hours_per_week) || 40,
        });
    }
    for (const s of (staffRes.data ?? []) as FacilityStaffRow[]) {
        if (!s.full_name || s.active === false || staffByName.has(s.full_name))
            continue;
        staffByName.set(s.full_name, {
            id: s.id, name: s.full_name,
            role: s.role || "Pflegekraft",
            maxHoursPerWeek: Number(s.max_hours_per_week) || 40,
        });
    }
    const shiftById = new Map(shiftRows.map(s => [s.id, s]));
    const minutenProStaffWoche = new Map<string, number>();
    for (const a of confirmed) {
        if (!a.staff_id)
            continue;
        const sh = shiftById.get(a.shift_id);
        if (!sh || sh.date < woche.start || sh.date > woche.end)
            continue;
        minutenProStaffWoche.set(a.staff_id, (minutenProStaffWoche.get(a.staff_id) ?? 0) + shiftMinutesLocal(sh));
    }
    const nameByStaffId = new Map([...staffByName.values()].map(p => [p.id, p.name]));
    const abwesendeTageByName = abwesenheitenNachTag({
        urlaube: (vacRes.data ?? []) as Array<{
            staff_id: string;
            from_date: string;
            to_date: string;
        }>,
        krankmeldungen: (sickRes.data ?? []) as Array<{
            sick_staff_name: string | null;
            sick_date: string;
        }>,
        akte: await ladeAkteAbwesenheiten(admin, facilityName, zielVon, zielBis),
        nameByStaffId,
        von: fensterVon,
        bis: zielBis,
    });
    const staff: GuardStaff[] = [...staffByName.values()].map(p => ({
        id: p.id,
        name: p.name,
        qualifikationen: [p.role],
        verplanteMinutenWoche: minutenProStaffWoche.get(p.id) ?? 0,
        vertragsMinutenWoche: p.maxHoursPerWeek * 60,
        abwesend: abwesendeTageByName.has(p.name),
        abwesendeTage: abwesendeTageByName.get(p.name) ?? {},
    }));
    const shifts: GuardShift[] = shiftRows.map(s => ({
        id: s.id, date: s.date, shift_type: s.shift_type,
        start_time: s.start_time, end_time: s.end_time, station: s.station,
        benoetigteQualifikation: null,
        sollBesetzung: Number(s.planned_staff) || 0,
    }));
    const bestehend: GuardAssignment[] = confirmed
        .filter(a => a.staff_id)
        .map(a => ({ shiftId: a.shift_id, staffId: a.staff_id! }));
    return { shifts, staff, bestehend };
}

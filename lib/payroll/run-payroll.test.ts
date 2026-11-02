import { describe, it, expect, beforeEach, vi } from "vitest";
type Zeile = Record<string, any>;
let tabellen: Record<string, Zeile[]> = {};
const SPALTEN: Record<string, string[]> = {
    facility_staff: ["id", "facility_name", "full_name", "job_type", "hourly_rate", "max_hours_per_week",
        "tax_class", "church_tax", "children_count", "overtime_compensation", "overtime_hours_per_day", "active"],
    user_profiles: ["id", "full_name", "facility"],
    facility_settings: ["facility_name", "default_overtime_compensation", "overtime_hours_per_day",
        "oncall_pay_enabled", "oncall_standby_pct", "oncall_hours_per_day", "oncall_work_pct"],
    vacation_requests: ["staff_id", "from_date", "to_date", "status"],
    flextime_requests: ["staff_id", "from_date", "to_date", "status"],
    shifts: ["id", "facility_name", "date", "start_time", "end_time", "shift_type"],
    bereich_shifts: ["id", "facility_name", "bereich_id", "date", "start_time", "end_time", "label"],
    bereich_shift_assignments: ["id", "facility_name", "shift_id", "user_id", "staff_name"],
    shift_assignments: ["shift_id", "staff_id", "staff_name", "facility_name", "status"],
    time_entries: ["user_id", "user_name", "facility", "station", "check_in", "check_out",
        "duration_minutes", "total_pause_minutes"],
    trainings: ["id", "facility_name", "date", "paid", "start_time", "end_time"],
    training_attendees: ["training_id", "facility_name", "staff_name"],
    on_call_entries: ["facility_name", "staff_name", "on_call_date"],
    payroll_runs: ["id", "facility_name", "month", "year", "status", "generated_by"],
    payroll_entries: ["*"],
};
const MAX_ROWS = 1000;
function fakeAdmin() {
    const hole = (t: string): Zeile[] => (tabellen[t] ??= []);
    return {
        from(table: string) {
            let op = "select";
            let spalten = "*";
            let einzeln = false;
            let payload: Zeile | Zeile[] | null = null;
            let von = 0, bis = MAX_ROWS - 1;
            const filter: ((r: Zeile) => boolean)[] = [];
            const lauf = () => {
                const rows = hole(table);
                if (op === "select" && spalten !== "*" && SPALTEN[table] && !SPALTEN[table].includes("*")) {
                    const gewuenscht = spalten.split(",").map(c => c.trim()).filter(c => c && !c.includes("("));
                    const unbekannt = gewuenscht.find(c => !SPALTEN[table].includes(c));
                    if (unbekannt) {
                        return { data: null, error: { code: "42703", message: `column ${table}.${unbekannt} does not exist` } };
                    }
                }
                if (op === "insert" || op === "upsert") {
                    const neu = (Array.isArray(payload) ? payload : [payload]) as Zeile[];
                    for (const r of neu) {
                        const i = rows.findIndex(x => x.id !== undefined && x.id === r.id);
                        if (i >= 0)
                            rows[i] = { ...rows[i], ...r };
                        else
                            rows.push({ id: r.id ?? `id-${table}-${rows.length}`, ...r });
                    }
                    const raus = rows.slice(-neu.length);
                    return { data: einzeln ? raus[0] ?? null : raus, error: null };
                }
                const treffer = rows.filter(r => filter.every(f => f(r)));
                if (op === "delete") {
                    for (const r of treffer)
                        rows.splice(rows.indexOf(r), 1);
                    return { data: treffer, error: null };
                }
                const seite = treffer.slice(von, bis + 1);
                if (einzeln) {
                    const eine = seite[0] ? { ...seite[0] } : null;
                    if (eine && spalten.includes("payroll_entries(")) {
                        eine.payroll_entries = hole("payroll_entries").filter(e => e.run_id === eine.id);
                    }
                    return { data: eine, error: null };
                }
                return { data: seite, error: null };
            };
            const q: any = {
                select: (c?: string) => { if (c)
                    spalten = c; return q; },
                insert: (r: Zeile | Zeile[]) => { op = "insert"; payload = r; return q; },
                upsert: (r: Zeile | Zeile[]) => { op = "upsert"; payload = r; return q; },
                update: (v: Zeile) => { op = "update"; payload = v; return q; },
                delete: () => { op = "delete"; return q; },
                eq: (c: string, v: unknown) => { filter.push(r => r[c] === v); return q; },
                in: (c: string, v: unknown[]) => { filter.push(r => v.includes(r[c])); return q; },
                gte: (c: string, v: string) => { filter.push(r => String(r[c]) >= v); return q; },
                lte: (c: string, v: string) => { filter.push(r => String(r[c]) <= v); return q; },
                not: (c: string) => { filter.push(r => r[c] != null); return q; },
                order: () => q,
                limit: () => q,
                range: (a: number, b: number) => { von = a; bis = b; return q; },
                maybeSingle: () => { einzeln = true; return q; },
                single: () => { einzeln = true; return q; },
                then: (ok: any, err?: any) => Promise.resolve().then(lauf).then(ok, err),
            };
            return q;
        },
    };
}
vi.mock("@/lib/admin-client", () => ({ admin: () => fakeAdmin() }));
import { generatePayrollRun } from "./run-payroll";
const EINRICHTUNG = "Testklinik";
const admin = () => fakeAdmin() as any;
function person(id: string, name: string, rate = 20, stunden = 40) {
    return {
        id, facility_name: EINRICHTUNG, full_name: name, job_type: "Vollzeit", hourly_rate: rate,
        max_hours_per_week: stunden, tax_class: 1, church_tax: false, children_count: 0,
        overtime_compensation: "payout", overtime_hours_per_day: 8, active: true,
    };
}
function schicht(id: string, datum: string, start = "06:00", ende = "14:00") {
    return { id, facility_name: EINRICHTUNG, date: datum, start_time: start, end_time: ende, shift_type: "frueh" };
}
function posten() {
    return tabellen.payroll_entries ?? [];
}
beforeEach(() => {
    tabellen = {
        facility_staff: [], user_profiles: [], facility_settings: [],
        vacation_requests: [], flextime_requests: [],
        shifts: [], shift_assignments: [], time_entries: [],
        bereich_shifts: [], bereich_shift_assignments: [],
        trainings: [], training_attendees: [], on_call_entries: [],
        payroll_runs: [], payroll_entries: [],
    };
});
describe("generatePayrollRun — gestempelte Zeiten", () => {
    it("rechnet die Zeiterfassung ab (sie fuehrt die Person als user_id/user_name)", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.time_entries = [{
                user_id: "s1", user_name: "Mitarbeiter 1", facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: 450, total_pause_minutes: 30,
            }];
        const res = await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(res.ok).toBe(true);
        expect(posten()).toHaveLength(1);
        expect(posten()[0].staff_name).toBe("Mitarbeiter 1");
        expect(posten()[0].hours_worked).toBe(7.5);
        expect(posten()[0].gross_pay).toBe(150);
    });
    it("bezahlt die Pause nach § 4 ArbZG nicht mit", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.time_entries = [{
                user_id: "s1", user_name: "Mitarbeiter 1", facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: null, total_pause_minutes: 45,
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0].hours_worked).toBe(7.25);
    });
    it("findet die Person auch ueber die user_id, wenn user_name fehlt", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.time_entries = [{
                user_id: "s1", user_name: null, facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: 480, total_pause_minutes: 0,
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0].hours_worked).toBe(8);
    });
});
describe("generatePayrollRun — mehr als tausend Zeilen", () => {
    it("rechnet einen vollen Monatsplan ab, nicht nur die ersten 1000 Zeilen", async () => {
        const leute = Array.from({ length: 60 }, (_, i) => person(`s${i}`, `Mitarbeiter ${i}`));
        tabellen.facility_staff = leute;
        for (const p of leute) {
            for (let tag = 1; tag <= 20; tag++) {
                const id = `${p.id}-${tag}`;
                tabellen.shifts.push(schicht(id, `2026-09-${String(tag).padStart(2, "0")}`));
                tabellen.shift_assignments.push({
                    shift_id: id, staff_id: p.id, staff_name: p.full_name,
                    facility_name: EINRICHTUNG, status: "confirmed",
                });
            }
        }
        expect(tabellen.shifts.length).toBeGreaterThan(MAX_ROWS);
        const res = await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(res.ok).toBe(true);
        expect(posten()).toHaveLength(60);
        for (const e of posten())
            expect(e.hours_worked).toBe(160);
    });
});
describe("generatePayrollRun — Stempelung und Plan zusammen", () => {
    it("nimmt je Tag die Stempelung, sonst den Plan — eine Buchung loescht nicht den Monat", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        for (const tag of ["07", "08", "09"]) {
            tabellen.shifts.push(schicht(`t${tag}`, `2026-09-${tag}`));
            tabellen.shift_assignments.push({
                shift_id: `t${tag}`, staff_id: "s1", staff_name: "Mitarbeiter 1",
                facility_name: EINRICHTUNG, status: "confirmed",
            });
        }
        tabellen.time_entries = [{
                user_id: "s1", user_name: "Mitarbeiter 1", facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: 450, total_pause_minutes: 30,
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0].hours_worked).toBe(23.5);
    });
    it("zaehlt einen Tag nicht doppelt, wenn Plan und Stempelung vorliegen", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.shifts = [schicht("t", "2026-09-07")];
        tabellen.shift_assignments = [{
                shift_id: "t", staff_id: "s1", staff_name: "Mitarbeiter 1",
                facility_name: EINRICHTUNG, status: "confirmed",
            }];
        tabellen.time_entries = [{
                user_id: "s1", user_name: "Mitarbeiter 1", facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: 450, total_pause_minutes: 30,
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0].hours_worked).toBe(7.5);
    });
});
describe("generatePayrollRun — Bereichsdienstplan", () => {
    it("verguetet auch Dienste aus bereich_shifts (eigene Tabelle, eigener Plan)", async () => {
        tabellen.facility_staff = [person("s1", "Reinigung 2", 14.5)];
        tabellen.bereich_shifts = [
            { id: "b1", facility_name: EINRICHTUNG, bereich_id: "ber", date: "2026-09-07", start_time: "06:00", end_time: "14:00", label: "Frueh" },
            { id: "b2", facility_name: EINRICHTUNG, bereich_id: "ber", date: "2026-09-08", start_time: "06:00", end_time: "14:00", label: "Frueh" },
        ];
        tabellen.bereich_shift_assignments = [
            { id: "z1", facility_name: EINRICHTUNG, shift_id: "b1", user_id: "s1", staff_name: "Reinigung 2" },
            { id: "z2", facility_name: EINRICHTUNG, shift_id: "b2", user_id: "s1", staff_name: "Reinigung 2" },
        ];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()).toHaveLength(1);
        expect(posten()[0].hours_worked).toBe(16);
        expect(posten()[0].gross_pay).toBe(232);
    });
    it("zaehlt einen Bereichstag nicht doppelt, wenn dafuer gestempelt wurde", async () => {
        tabellen.facility_staff = [person("s1", "Reinigung 2", 14.5)];
        tabellen.bereich_shifts = [
            { id: "b1", facility_name: EINRICHTUNG, bereich_id: "ber", date: "2026-09-07", start_time: "06:00", end_time: "14:00", label: "Frueh" },
        ];
        tabellen.bereich_shift_assignments = [
            { id: "z1", facility_name: EINRICHTUNG, shift_id: "b1", user_id: "s1", staff_name: "Reinigung 2" },
        ];
        tabellen.time_entries = [{
                user_id: "s1", user_name: "Reinigung 2", facility: EINRICHTUNG,
                check_in: "2026-09-07T06:00:00.000Z", check_out: "2026-09-07T14:00:00.000Z",
                duration_minutes: 450, total_pause_minutes: 30,
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0].hours_worked).toBe(7.5);
    });
});
describe("generatePayrollRun — welche Zuweisung zaehlt", () => {
    const eingeteilt = (status: string | null) => ({
        shift_id: "x", staff_id: "s1", staff_name: "Mitarbeiter 1",
        facility_name: EINRICHTUNG, status,
    });
    it.each([
        ["confirmed", 8],
        ["manual", 8],
        [null, 8],
        ["cancelled", 0],
    ])("Status %s → %s Stunden", async (status, erwartet) => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.shifts = [schicht("x", "2026-09-07")];
        tabellen.shift_assignments = [eingeteilt(status as string | null)];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()[0]?.hours_worked ?? 0).toBe(erwartet);
    });
});
describe("generatePayrollRun — Monatsgrenzen", () => {
    it("nimmt den letzten Kalendertag des Monats mit (Sommerzeit-Falle)", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.shifts = [schicht("x", "2026-09-30")];
        tabellen.shift_assignments = [{
                shift_id: "x", staff_id: "s1", staff_name: "Mitarbeiter 1",
                facility_name: EINRICHTUNG, status: "confirmed",
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()).toHaveLength(1);
        expect(posten()[0].hours_worked).toBe(8);
    });
    it("laesst den Folgemonat draussen", async () => {
        tabellen.facility_staff = [person("s1", "Mitarbeiter 1")];
        tabellen.shifts = [schicht("x", "2026-10-01")];
        tabellen.shift_assignments = [{
                shift_id: "x", staff_id: "s1", staff_name: "Mitarbeiter 1",
                facility_name: EINRICHTUNG, status: "confirmed",
            }];
        await generatePayrollRun(admin(), EINRICHTUNG, 9, 2026, "Test");
        expect(posten()).toHaveLength(0);
    });
});

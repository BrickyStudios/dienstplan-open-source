import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { findEligibleSwapPartners, validateSwap, executeSwap } from "@/lib/shift-swap";
import { berlinTagISO } from "@/lib/date";
const F = "Testeinrichtung";
const daysFromNow = (n: number): string => berlinTagISO(n);
type Row = Record<string, unknown>;
function makeAdmin(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            let patch: Row | null = null;
            const b: Record<string, unknown> = {};
            Object.assign(b, {
                select: () => b,
                update: (p: Row) => { patch = p; return b; },
                order: () => b,
                limit: (n: number) => { rows = rows.slice(0, n); return b; },
                eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return b; },
                neq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] !== v); return b; },
                gte: (c: string, v: unknown) => { rows = rows.filter(r => (r[c] as never) >= (v as never)); return b; },
                lte: (c: string, v: unknown) => { rows = rows.filter(r => (r[c] as never) <= (v as never)); return b; },
                in: (c: string, vals: unknown[]) => { const s = new Set(vals); rows = rows.filter(r => s.has(r[c])); return b; },
                is: (c: string, v: unknown) => { rows = rows.filter(r => (v === null ? r[c] == null : r[c] === v)); return b; },
                not: (c: string, _op: string, v: unknown) => { rows = rows.filter(r => (v === null ? r[c] != null : r[c] !== v)); return b; },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                single: async () => ({ data: rows[0] ?? null, error: null }),
                then: (resolve: (v: {
                    data: Row[];
                    error: null;
                }) => unknown) => {
                    if (patch)
                        for (const r of rows)
                            Object.assign(r, patch);
                    return resolve({ data: rows, error: null });
                },
            });
            return b;
        },
    };
}
function buildScenario() {
    const d1 = daysFromNow(3), d2 = daysFromNow(5);
    const names = ["R", "A", "B", "C", "D"];
    const pid: Record<string, string> = {};
    const facility_staff: Row[] = names.map(n => {
        const id = randomUUID();
        return { id, facility_name: F, full_name: n, active: true, station: "S1",
            max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: 20, minijob_buffer_pct: 15 };
    });
    const user_profiles: Row[] = names.map(n => { const id = randomUUID(); pid[n] = id; return { id, full_name: n, station: "S1", facility: F, role: "mitarbeiter" }; });
    const s1 = randomUUID(), s2 = randomUUID();
    const mkShift = (id: string, date: string) => ({ id, facility_name: F, station: "S1", date, shift_type: "frueh", planned_staff: 2, start_time: "06:00", end_time: "14:00" });
    const shifts: Row[] = [mkShift(s1, d1), mkShift(s2, d2)];
    const mkAssign = (shift_id: string, staff_name: string): Row => ({ id: randomUUID(), shift_id, facility_name: F, staff_id: null, staff_name, status: "confirmed" });
    const shift_assignments: Row[] = [
        mkAssign(s1, "R"), mkAssign(s1, "A"),
        mkAssign(s2, "B"), mkAssign(s2, "C"),
    ];
    const admin = makeAdmin({
        facility_settings: [{ facility_name: F, overtime_limit_pct: 20, pause_threshold_minutes: 20 }],
        facility_staff, user_profiles, staff_wishes: [], time_entries: [], staff_availability: [],
        shifts, shift_assignments,
    });
    return { admin, pid, s1, s2, shift_assignments };
}
describe("shift-swap — Mehrfachbesetzung pro shift_id (Regression)", () => {
    it("findet Tauschpartner, obwohl die eigene Schicht mit mehreren Personen besetzt ist", async () => {
        const { admin, pid, s1, s2 } = buildScenario();
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], s1, 60);
        expect(options.length).toBeGreaterThan(0);
        expect(options.map(o => o.staffName).sort()).toEqual(["B", "C"]);
        expect(new Set(options.map(o => o.shiftId))).toEqual(new Set([s2]));
    });
    it("führt den Tausch personengenau aus und lässt Unbeteiligte unberührt", async () => {
        const { admin, pid, s1, s2, shift_assignments } = buildScenario();
        const v = await validateSwap(admin as never, F, s1, s2, pid["R"], pid["B"]);
        expect(v.ok).toBe(true);
        if (v.ok) {
            expect(v.requester.staffName).toBe("R");
            expect(v.target.staffName).toBe("B");
        }
        const ex = await executeSwap(admin as never, F, s1, s2, pid["R"], pid["B"]);
        expect(ex.ok).toBe(true);
        const namesOn = (shiftId: string) => shift_assignments.filter(r => r.shift_id === shiftId).map(r => r.staff_name).sort();
        expect(namesOn(s1)).toEqual(["A", "B"]);
        expect(namesOn(s2)).toEqual(["C", "R"]);
    });
    it("validiert Zukunftsschichten (Kontextfenster deckt kommende Termine ab)", async () => {
        const { admin, pid, s1, s2 } = buildScenario();
        const v = await validateSwap(admin as never, F, s1, s2, pid["R"], pid["B"]);
        expect(v.ok).toBe(true);
    });
});
describe("shift-swap — Identität über Name (Demo: staff_id oft null/uneindeutig)", () => {
    it("Picker findet Partner, wenn nur der Name passt (übergebene staff_id ≠ aufgelöste ID)", async () => {
        const { admin, s1 } = buildScenario();
        const wrongId = randomUUID();
        const options = await findEligibleSwapPartners(admin as never, F, wrongId, s1, 60, "R");
        expect(options.map(o => o.staffName).sort()).toEqual(["B", "C"]);
    });
    it("validateSwap greift die Personen über den Namen, wenn die staff_id nicht passt", async () => {
        const { admin, s1, s2 } = buildScenario();
        const v = await validateSwap(admin as never, F, s1, s2, randomUUID(), randomUUID(), "R", "B");
        expect(v.ok).toBe(true);
        if (v.ok) {
            expect(v.requester.staffName).toBe("R");
            expect(v.target.staffName).toBe("B");
        }
    });
});
describe("shift-swap — Demo-Einrichtung end-to-end (Persona + reiner facility_staff-Roster)", () => {
    it("findet Tauschpartner für die Demo-Persona (staff_id null, Auflösung über Namen)", async () => {
        const FAC = "Demo-Einrichtung";
        const ST = "Wohnbereich A";
        const d1 = daysFromNow(3), d2 = daysFromNow(5), d3 = daysFromNow(8);
        const UP_DEMO = randomUUID();
        const FS_DEMO = randomUUID();
        const facility_staff: Row[] = [
            { id: FS_DEMO, facility_name: FAC, full_name: "Demo Mitarbeiter", active: true, station: ST, max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: 20 },
            { id: randomUUID(), facility_name: FAC, full_name: "Maria Schmidt", active: true, station: ST, max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: 20 },
            { id: randomUUID(), facility_name: FAC, full_name: "Thomas Müller", active: true, station: ST, max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: 20 },
        ];
        const user_profiles: Row[] = [
            { id: UP_DEMO, full_name: "Demo Mitarbeiter", station: ST, facility: FAC, role: "mitarbeiter" },
        ];
        const s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID();
        const mk = (id: string, date: string, type: string) => ({ id, facility_name: FAC, station: ST, date, shift_type: type, planned_staff: 3, start_time: "06:00", end_time: "14:00" });
        const shifts: Row[] = [mk(s1, d1, "frueh"), mk(s2, d2, "spaet"), mk(s3, d3, "nacht")];
        const a = (shift_id: string, name: string): Row => ({ id: randomUUID(), shift_id, facility_name: FAC, staff_id: null, staff_name: name, status: "confirmed" });
        const shift_assignments: Row[] = [
            a(s1, "Demo Mitarbeiter"),
            a(s2, "Maria Schmidt"),
            a(s3, "Thomas Müller"),
        ];
        const admin = makeAdmin({
            facility_settings: [{ facility_name: FAC, overtime_limit_pct: 20, pause_threshold_minutes: 20 }],
            facility_staff, user_profiles, staff_wishes: [], time_entries: [], staff_availability: [],
            shifts, vacation_requests: [], shift_assignments,
        });
        const options = await findEligibleSwapPartners(admin as never, FAC, UP_DEMO, s1, 60, "Demo Mitarbeiter");
        expect(options.map(o => o.staffName).sort()).toEqual(["Maria Schmidt", "Thomas Müller"]);
    });
});
function buildFlexible(opts: {
    shifts: {
        id: string;
        station: string;
        date: string;
        type: string;
        who: string[];
    }[];
    statusVon?: Record<string, string>;
    vacations?: {
        who: string;
        from: string;
        to: string;
    }[];
    availabilityUnavailable?: {
        who: string;
        day_of_week: number;
    }[];
}) {
    const names = ["R", "B"];
    const pid: Record<string, string> = {};
    const facility_staff: Row[] = names.map(n => ({
        id: randomUUID(), facility_name: F, full_name: n, active: true, station: "S1",
        max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: 20, minijob_buffer_pct: 15,
    }));
    const user_profiles: Row[] = names.map(n => { const id = randomUUID(); pid[n] = id; return { id, full_name: n, station: "S1", facility: F, role: "mitarbeiter" }; });
    const shifts: Row[] = opts.shifts.map(s => ({
        id: s.id, facility_name: F, station: s.station, date: s.date, shift_type: s.type,
        planned_staff: Math.max(1, s.who.length), start_time: "06:00", end_time: "14:00",
    }));
    const shift_assignments: Row[] = opts.shifts.flatMap(s => s.who.map(name => ({ id: randomUUID(), shift_id: s.id, facility_name: F, staff_id: null, staff_name: name, status: opts.statusVon?.[name] ?? "confirmed" })));
    const vacation_requests: Row[] = (opts.vacations ?? []).map(v => ({
        id: randomUUID(), staff_id: pid[v.who], from_date: v.from, to_date: v.to, status: "approved",
    }));
    const staff_availability: Row[] = (opts.availabilityUnavailable ?? []).map(a => ({
        staff_id: pid[a.who], facility_name: F, day_of_week: a.day_of_week, available: false, from_time: null, to_time: null,
    }));
    const admin = makeAdmin({
        facility_settings: [{ facility_name: F, overtime_limit_pct: 20, pause_threshold_minutes: 20 }],
        facility_staff, user_profiles, staff_wishes: [], time_entries: [], staff_availability,
        shifts, vacation_requests, shift_assignments,
    });
    return { admin, pid, shift_assignments };
}
describe("shift-swap — neue Regeln: nur Station + keine Doppelbelegung/Urlaub", () => {
    it("erlaubt Tausch mit ANDERER Schichtart (nur die Station muss stimmen)", async () => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        const { admin, pid } = buildFlexible({ shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S1", date: d2, type: "nacht", who: ["B"] },
            ] });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options.map(o => o.staffName)).toEqual(["B"]);
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(true);
    });
    it("verbietet Tausch über Stationsgrenzen (nur gleiche Station)", async () => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        const { admin, pid } = buildFlexible({ shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S2", date: d2, type: "frueh", who: ["B"] },
            ] });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options).toEqual([]);
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(false);
        if (!v.ok)
            expect(v.reason).toMatch(/Station/);
    });
    it("verbietet Tausch, wenn die Zielperson am eigenen Tag schon eine Schicht hat", async () => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        const { admin, pid } = buildFlexible({ shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S1", date: d2, type: "frueh", who: ["B"] },
                { id: "s3", station: "S1", date: d1, type: "spaet", who: ["B"] },
            ] });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options.some(o => o.shiftId === "s2")).toBe(false);
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(false);
    });
    it("verbietet Tausch, wenn die Zielperson am zu übernehmenden Tag im Urlaub ist", async () => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        const { admin, pid } = buildFlexible({
            shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S1", date: d2, type: "frueh", who: ["B"] },
            ],
            vacations: [{ who: "B", from: d1, to: d1 }],
        });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options).toEqual([]);
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(false);
        if (!v.ok)
            expect(v.reason).toMatch(/Urlaub/);
    });
    it("prüft KEINE Überstunden/Verfügbarkeit — Tausch bleibt möglich", async () => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        const dow = new Date(`${d1}T00:00:00Z`).getUTCDay();
        const { admin, pid } = buildFlexible({
            shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S1", date: d2, type: "frueh", who: ["B"] },
            ],
            availabilityUnavailable: [{ who: "B", day_of_week: dow }],
        });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options.map(o => o.staffName)).toEqual(["B"]);
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(true);
    });
});
describe("shift-swap — von Hand eingeteilte Dienste", () => {
    const zwei = (statusVon?: Record<string, string>) => {
        const d1 = daysFromNow(3), d2 = daysFromNow(5);
        return buildFlexible({
            shifts: [
                { id: "s1", station: "S1", date: d1, type: "frueh", who: ["R"] },
                { id: "s2", station: "S1", date: d2, type: "frueh", who: ["B"] },
            ],
            statusVon,
        });
    };
    it("findet den von Hand eingeteilten Partner im Picker", async () => {
        const { admin, pid } = zwei({ B: "manual" });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options.map(o => o.staffName)).toEqual(["B"]);
    });
    it("tauscht, wenn BEIDE Dienste von Hand eingeteilt sind", async () => {
        const { admin, pid, shift_assignments } = zwei({ R: "manual", B: "manual" });
        const v = await validateSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(v.ok).toBe(true);
        const ex = await executeSwap(admin as never, F, "s1", "s2", pid["R"], pid["B"]);
        expect(ex.ok).toBe(true);
        const namenAuf = (shiftId: string) => shift_assignments.filter(r => r.shift_id === shiftId).map(r => r.staff_name);
        expect(namenAuf("s1")).toEqual(["B"]);
        expect(namenAuf("s2")).toEqual(["R"]);
    });
    it("lässt eine gelöste Zuweisung weiterhin heraus (status='cancelled')", async () => {
        const { admin, pid } = zwei({ B: "cancelled" });
        const options = await findEligibleSwapPartners(admin as never, F, pid["R"], "s1", 60);
        expect(options).toEqual([]);
    });
});

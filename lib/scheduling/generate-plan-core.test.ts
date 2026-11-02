import { describe, it, expect } from "vitest";
import { runSchedulingAlgorithm, rankReplacementCandidates, violatesRestTransition, MAX_CONSECUTIVE_DAYS, type RawFacilityStaff, type AlgorithmInput, } from "@/lib/scheduling/generate-plan-core";
function staff(id: string, full_name: string, over: Partial<RawFacilityStaff> = {}): RawFacilityStaff {
    return {
        id, full_name, active: true, station: null,
        max_hours_per_week: 100, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15,
        ...over,
    };
}
describe("violatesRestTransition", () => {
    it("blockt Nacht -> Früh/Spät am Folgetag, erlaubt Nacht -> Nacht", () => {
        expect(violatesRestTransition("nacht", "frueh")).toBe(true);
        expect(violatesRestTransition("nacht", "spaet")).toBe(true);
        expect(violatesRestTransition("nacht", "nacht")).toBe(false);
    });
    it("blockt Spät -> Früh, erlaubt Früh -> alles und leeren Vortag", () => {
        expect(violatesRestTransition("spaet", "frueh")).toBe(true);
        expect(violatesRestTransition("spaet", "spaet")).toBe(false);
        expect(violatesRestTransition("frueh", "nacht")).toBe(false);
        expect(violatesRestTransition(null, "frueh")).toBe(false);
    });
});
describe("runSchedulingAlgorithm — Ruhezeit", () => {
    it("weist nach einer Nachtschicht keine Frühschicht am Folgetag zu", () => {
        const input: AlgorithmInput = {
            shifts: [
                { id: "n1", station: "S", date: "2026-06-01", shift_type: "nacht", planned_staff: 1, start_time: "22:00", end_time: "06:00" },
                { id: "f2", station: "S", date: "2026-06-02", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" },
            ],
            facilityStaff: [staff("s", "Solo", { station: "S" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
        };
        const res = runSchedulingAlgorithm(input);
        expect(res.assignments.map(a => a.shift_id)).toEqual(["n1"]);
        expect(res.unfilled_slots.some(s => s.shift_id === "f2")).toBe(true);
    });
});
describe("runSchedulingAlgorithm — maximale Arbeitstage am Stück", () => {
    it(`weist am Tag nach ${MAX_CONSECUTIVE_DAYS} Tagen am Stück einen Ruhetag ein`, () => {
        const dates = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"];
        const input: AlgorithmInput = {
            shifts: dates.map((d, i) => ({ id: `f${i}`, station: "S", date: d, shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" })),
            facilityStaff: [staff("s", "Solo", { station: "S" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
        };
        const res = runSchedulingAlgorithm(input);
        expect(res.assignments.length).toBe(MAX_CONSECUTIVE_DAYS + 1);
        expect(res.unfilled_slots.some(s => s.shift_date === "2026-06-07")).toBe(true);
    });
});
describe("runSchedulingAlgorithm — Vorgeschichte über Fenstergrenze (priorAssignments)", () => {
    it("blockt eine Frühschicht am ersten Fenstertag nach einer Nacht am Vortag (Vorfenster)", () => {
        const input: AlgorithmInput = {
            shifts: [
                { id: "f", station: "S", date: "2026-06-02", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" },
            ],
            facilityStaff: [staff("s", "Solo", { station: "S" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "auto" },
            priorAssignments: [{ staff_id: "s", date: "2026-06-01", shift_type: "nacht" }],
        };
        const res = runSchedulingAlgorithm(input);
        expect(res.assignments).toEqual([]);
    });
    it("rechnet Vorfenster-Stunden auf das Wochenlimit der straddling week an", () => {
        const prior = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]
            .map(d => ({ staff_id: "s", date: d, shift_type: "frueh" }));
        const input: AlgorithmInput = {
            shifts: [
                { id: "f6", station: "S", date: "2026-06-06", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" },
            ],
            facilityStaff: [staff("s", "Solo", { station: "S", max_hours_per_week: 40, job_type: "Vollzeit" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
            priorAssignments: prior,
        };
        const res = runSchedulingAlgorithm(input);
        expect(res.assignments).toEqual([]);
    });
});
describe("runSchedulingAlgorithm — Springer-Einplanung (Teil 2)", () => {
    const baseInput = (over: Partial<AlgorithmInput>): AlgorithmInput => ({
        shifts: [
            { id: "f1", station: "S", date: "2026-06-01", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" },
        ],
        facilityStaff: [staff("a", "Anna", { station: "S" }), staff("b", "Bea", { station: "S" })],
        profiles: [], wishes: [], nightEntries: [], availability: [],
        settings: { understaffing_mode: "popup" },
        ...over,
    });
    it("liefert keine Springer, wenn das Flag aus ist", () => {
        const res = runSchedulingAlgorithm(baseInput({}));
        expect(res.springer_assignments).toEqual([]);
    });
    it("designiert pro Tag eine Bereitschaft, wenn das Flag an ist", () => {
        const res = runSchedulingAlgorithm(baseInput({ settings: { understaffing_mode: "popup", schedule_springer_enabled: true } }));
        expect(res.assignments.length).toBe(1);
        expect(res.springer_assignments.length).toBe(1);
        expect(res.springer_assignments[0].date).toBe("2026-06-01");
        expect(res.springer_assignments[0].staff_name).not.toBe(res.assignments[0].staff_name);
    });
    it("plant keinen Springer, wenn niemand übrig ist", () => {
        const res = runSchedulingAlgorithm(baseInput({
            facilityStaff: [staff("a", "Anna", { station: "S" })],
            settings: { understaffing_mode: "popup", schedule_springer_enabled: true },
        }));
        expect(res.springer_assignments).toEqual([]);
    });
});
describe("runSchedulingAlgorithm — Vertragsgrenzen pro Mitarbeiter", () => {
    const week = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06"];
    const fruehShifts = (dates: string[]) => dates.map((d, i) => ({ id: `f${i}`, station: "S", date: d, shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" }));
    const base = (over: Partial<RawFacilityStaff>, dates = week, settings: AlgorithmInput["settings"] = { understaffing_mode: "popup" }): AlgorithmInput => ({
        shifts: fruehShifts(dates),
        facilityStaff: [staff("s", "Solo", { station: "S", ...over })],
        profiles: [], wishes: [], nightEntries: [], availability: [],
        settings,
    });
    it("Bestandskunde ohne gesetzte Grenzen: 12h-Schicht wird NICHT verworfen (unbegrenzt)", () => {
        const res = runSchedulingAlgorithm({
            shifts: [{ id: "lang", station: "S", date: "2026-06-01", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "18:00" }],
            facilityStaff: [staff("s", "Solo", { station: "S" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
        });
        expect(res.assignments.length).toBe(1);
    });
    it("erst ein gesetzter Default begrenzt die Schichtlänge", () => {
        const res = runSchedulingAlgorithm({
            shifts: [{ id: "lang", station: "S", date: "2026-06-01", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "18:00" }],
            facilityStaff: [staff("s", "Solo", { station: "S" })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup", default_max_hours_per_shift: 10 },
        });
        expect(res.assignments).toEqual([]);
    });
    it("max_shifts_per_week begrenzt die Schichten pro ISO-Woche", () => {
        const res = runSchedulingAlgorithm(base({ max_shifts_per_week: 3 }));
        expect(res.assignments.length).toBe(3);
    });
    it("max_hours_per_shift schließt zu lange Schichten aus, kürzere bleiben zulässig", () => {
        const long = runSchedulingAlgorithm({ ...base({ max_hours_per_shift: 6 }, ["2026-06-01"]) });
        expect(long.assignments).toEqual([]);
        const shortShift: AlgorithmInput = {
            ...base({ max_hours_per_shift: 6 }, ["2026-06-01"]),
            shifts: [{ id: "f", station: "S", date: "2026-06-01", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "12:00" }],
        };
        expect(runSchedulingAlgorithm(shortShift).assignments.length).toBe(1);
    });
    it("max_consecutive_nights erzwingt eine Pause nach N Nächten", () => {
        const nights = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]
            .map((d, i) => ({ id: `n${i}`, station: "S", date: d, shift_type: "nacht", planned_staff: 1, start_time: "22:00", end_time: "06:00" }));
        const res = runSchedulingAlgorithm({
            shifts: nights,
            facilityStaff: [staff("s", "Solo", { station: "S", max_consecutive_nights: 2 })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
        });
        expect(res.unfilled_slots.some(s => s.shift_date === "2026-06-03")).toBe(true);
        expect(res.assignments.length).toBe(3);
    });
    it("höhere min_rest_hours blockt Früh nach Früh (16h Ruhe < 20h)", () => {
        const res = runSchedulingAlgorithm(base({ min_rest_hours: 20 }, ["2026-06-01", "2026-06-02"]));
        expect(res.assignments.length).toBe(1);
    });
    it("nutzt den Einrichtungs-Default, wenn der Mitarbeiter-Wert fehlt", () => {
        const res = runSchedulingAlgorithm(base({}, week, { understaffing_mode: "popup", default_max_shifts_per_week: 2 }));
        expect(res.assignments.length).toBe(2);
    });
    it("Mitarbeiter-Wert schlägt den Einrichtungs-Default", () => {
        const res = runSchedulingAlgorithm(base({ max_shifts_per_week: 4 }, week, { understaffing_mode: "popup", default_max_shifts_per_week: 2 }));
        expect(res.assignments.length).toBe(4);
    });
    it("weiche Warnung: zu viele Feiertagsschichten pro Monat", () => {
        const res = runSchedulingAlgorithm({
            shifts: fruehShifts(["2026-12-25", "2026-12-26"]),
            facilityStaff: [staff("s", "Solo", { station: "S", max_holiday_shifts_per_month: 1 })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup" },
        });
        expect(res.contract_warnings.some(w => w.rule === "max_holiday_shifts_per_month")).toBe(true);
    });
    it("no_sunday_work: weist sonntags keine Schicht zu, samstags schon", () => {
        const res = runSchedulingAlgorithm({
            shifts: fruehShifts(["2026-06-06", "2026-06-07"]),
            facilityStaff: [staff("s", "Solo", { station: "S", no_sunday_work: true })],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "auto" },
        });
        expect(res.assignments.map(a => a.shift_date)).toEqual(["2026-06-06"]);
        expect(res.unfilled_slots.concat([]).length + res.understaffing_log.length).toBeGreaterThan(0);
    });
    it("weiche Warnung: zu wenige freie Tage pro Woche", () => {
        const res = runSchedulingAlgorithm(base({ min_days_off_per_week: 2 }));
        expect(res.contract_warnings.some(w => w.rule === "min_days_off_per_week")).toBe(true);
    });
});
describe("rankReplacementCandidates", () => {
    const baseShift = { station: "S", date: "2026-06-02", shift_type: "frueh", start_time: "06:00", end_time: "14:00" };
    const facilityStaff = [
        staff("a", "Anna", { station: "S", max_hours_per_week: 40 }),
        staff("b", "Bea", { station: "S", max_hours_per_week: 40 }),
        staff("x", "Sieglinde", { station: "S", max_hours_per_week: 40 }),
    ];
    const common = {
        shift: baseShift, facilityStaff, profiles: [], wishes: [], nightEntries: [], availability: [],
        overtimeLimitPct: 20, pauseThresholdMinutes: 20,
    };
    it("schließt die kranke Person aus", () => {
        const out = rankReplacementCandidates({ ...common, hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {}, excludeNames: ["Sieglinde"] });
        expect(out.map(c => c.staff_name)).not.toContain("Sieglinde");
        expect(out.map(c => c.staff_name)).toEqual(expect.arrayContaining(["Anna", "Bea"]));
    });
    it("schließt jemanden aus, der am selben Tag schon eingeteilt ist", () => {
        const out = rankReplacementCandidates({ ...common, hoursThisWeekByStaffId: {}, assignedByStaffAndDate: { a: { "2026-06-02": "spaet" } } });
        expect(out.map(c => c.staff_name)).not.toContain("Anna");
    });
    it("schließt eine Frühschicht direkt nach einer Nachtschicht aus (Ruhezeit)", () => {
        const out = rankReplacementCandidates({ ...common, hoursThisWeekByStaffId: {}, assignedByStaffAndDate: { b: { "2026-06-01": "nacht" } } });
        expect(out.map(c => c.staff_name)).not.toContain("Bea");
    });
    it("reiht reguläre Kandidaten vor Überstunden-Kandidaten ein", () => {
        const out = rankReplacementCandidates({ ...common, hoursThisWeekByStaffId: { b: 38 }, assignedByStaffAndDate: {} });
        expect(out[0].staff_name).toBe("Anna");
        expect(out[0].is_overtime).toBe(false);
        const bea = out.find(c => c.staff_name === "Bea");
        expect(bea?.is_overtime).toBe(true);
    });
});
describe("Einspringen auf anderen Stationen (einsatz_stationen)", () => {
    const schicht = (id: string, station: string, planned = 1) => ({ id, station, date: "2026-06-02", shift_type: "frueh", planned_staff: planned, start_time: "06:00", end_time: "14:00" });
    const basis = { profiles: [], wishes: [], nightEntries: [], availability: [], settings: { understaffing_mode: "popup" } };
    it("ohne Befähigung bleibt jede Person auf ihrer Station", () => {
        const res = runSchedulingAlgorithm({
            ...basis,
            shifts: [schicht("b1", "B")],
            facilityStaff: [staff("a", "Anna", { station: "A" })],
        });
        expect(res.assignments).toEqual([]);
    });
    it("füllt eine offene Schicht mit einer befähigten Person — als Springer", () => {
        const res = runSchedulingAlgorithm({
            ...basis,
            shifts: [schicht("b1", "B")],
            facilityStaff: [staff("a", "Anna", { station: "A", einsatz_stationen: ["B"] })],
        });
        expect(res.assignments).toHaveLength(1);
        expect(res.assignments[0]).toMatchObject({ shift_id: "b1", staff_name: "Anna", is_springer: true });
    });
    it("das eigene Personal der Station geht vor, und die eigene Station wird nicht leergeplant", () => {
        const res = runSchedulingAlgorithm({
            ...basis,
            shifts: [schicht("b1", "B"), schicht("a1", "A")],
            facilityStaff: [
                staff("a", "Anna", { station: "A", einsatz_stationen: ["B"] }),
                staff("b", "Bert", { station: "B" }),
            ],
        });
        const nach = Object.fromEntries(res.assignments.map(x => [x.shift_id, x]));
        expect(nach.a1.staff_name).toBe("Anna");
        expect(nach.a1.is_springer).toBeUndefined();
        expect(nach.b1.staff_name).toBe("Bert");
    });
    it("plant beim Erzeugen einer einzelnen Station niemanden von außen ein", () => {
        const res = runSchedulingAlgorithm({
            ...basis,
            stationFilter: "B",
            shifts: [schicht("b1", "B")],
            facilityStaff: [staff("a", "Anna", { station: "A", einsatz_stationen: ["B"] })],
        });
        expect(res.assignments).toEqual([]);
    });
    it("Ausfallsuche: Befähigte kommen in Frage, aber hinter dem Personal der Station", () => {
        const out = rankReplacementCandidates({
            shift: { station: "B", date: "2026-06-02", shift_type: "frueh", start_time: "06:00", end_time: "14:00" },
            facilityStaff: [
                staff("a", "Anna", { station: "A", einsatz_stationen: ["B"], max_hours_per_week: 40 }),
                staff("b", "Bert", { station: "B", max_hours_per_week: 40 }),
                staff("c", "Carl", { station: "C", max_hours_per_week: 40 }),
            ],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            overtimeLimitPct: 20, pauseThresholdMinutes: 20,
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {},
        });
        expect(out.map(c => c.staff_name)).toEqual(["Bert", "Anna"]);
        expect(out[1].is_springer).toBe(true);
        expect(out[1].reason).toContain("Springt von A ein");
    });
});
describe("Springer-Pass — nur Personal der Stationen im Plan", () => {
    it("teilt keine Ärztin als Pflege-Bereitschaft ein", () => {
        const res = runSchedulingAlgorithm({
            shifts: [{ id: "f1", station: "S", date: "2026-06-02", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" }],
            facilityStaff: [
                staff("a", "Anna", { station: "S" }),
                staff("b", "Bea", { station: "S" }),
                staff("d", "Dr. Demir", { station: "Ärztlicher Dienst" }),
            ],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            settings: { understaffing_mode: "popup", schedule_springer_enabled: true },
        });
        const pflege = res.assignments[0].staff_name;
        expect(res.springer_assignments.map(s => s.staff_name)).toEqual([pflege === "Anna" ? "Bea" : "Anna"]);
    });
});
describe("Beruf — nur die Pflege kommt in Pflegeschichten (lib/berufe.ts, seit 09.10.2026)", () => {
    const frueh = (station: string, id = "f1") => ({ id, station, date: "2026-06-02", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" });
    const plane = (shifts: ReturnType<typeof frueh>[], facilityStaff: RawFacilityStaff[], nichtPflegeStationen?: string[]) => runSchedulingAlgorithm({
        shifts, facilityStaff, profiles: [], wishes: [], nightEntries: [], availability: [],
        settings: { understaffing_mode: "popup" }, nichtPflegeStationen,
    });
    it("setzt eine Stationsärztin nicht in die Pflegeschicht ihrer Station", () => {
        const res = plane([frueh("Kardiologie")], [staff("d", "Dr. Demir", { station: "Kardiologie", role: "Stationsärztin / Stationsarzt" })]);
        expect(res.assignments).toEqual([]);
    });
    it("nimmt eine Reinigungskraft ohne Station nicht als Springerin für jede Station", () => {
        const res = plane([frueh("Station 2")], [staff("r", "Rita", { station: null, role: "Reinigungskraft" })]);
        expect(res.assignments).toEqual([]);
    });
    it("plant Ärztinnen weiter im ärztlichen Dienst ein — über den Namen der Station", () => {
        const res = plane([frueh("Ärztlicher Dienst")], [staff("d", "Dr. Demir", { station: "Ärztlicher Dienst", role: "Oberärztin / Oberarzt" })]);
        expect(res.assignments.map(a => a.staff_name)).toEqual(["Dr. Demir"]);
    });
    it("und auf jeder Station, die als PPBV-befreit markiert ist", () => {
        const res = plane([frueh("OP-Saal 1")], [staff("o", "Olaf", { station: "OP-Saal 1", role: "Operationstechnische Assistenz (OTA)" })], ["OP-Saal 1"]);
        expect(res.assignments.map(a => a.staff_name)).toEqual(["Olaf"]);
    });
    it("lässt die Pflege und den Bestand ohne Beruf unverändert", () => {
        const res = plane([frueh("Kardiologie", "f1"), frueh("Kardiologie", "f2")], [staff("p", "Paula", { station: "Kardiologie", role: "Pflegefachkraft" }), staff("q", "Quentin", { station: "Kardiologie" })]);
        expect(res.assignments.map(a => a.staff_name).sort()).toEqual(["Paula", "Quentin"]);
    });
    it("schlägt bei Krankheit keine Ärztin als Ersatz für die Pflegeschicht vor", () => {
        const out = rankReplacementCandidates({
            shift: { station: "Kardiologie", date: "2026-06-02", shift_type: "frueh", start_time: "06:00", end_time: "14:00" },
            facilityStaff: [
                staff("d", "Dr. Demir", { station: "Kardiologie", role: "Assistenzärztin / Assistenzarzt" }),
                staff("p", "Paula", { station: "Kardiologie", role: "Pflegefachkraft" }),
            ],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {}, excludeNames: [],
        });
        expect(out.map(c => c.staff_name)).toEqual(["Paula"]);
    });
});
describe("Konten — eine Leitung ohne Personalstamm ist keine Ersatzkraft (09.10.2026)", () => {
    const frueh = (station: string, id: string) => ({ id, station, date: "2026-10-12", shift_type: "frueh", planned_staff: 1, start_time: "06:00", end_time: "14:00" });
    it("plant ein Leitungskonto ohne Stammdaten nicht ein", () => {
        const res = runSchedulingAlgorithm({
            shifts: [frueh("In 1", "a")],
            facilityStaff: [],
            profiles: [{ id: "L", full_name: "Lilia Leitung", station: "", role: "leitung" }],
            wishes: [], nightEntries: [], availability: [], settings: { understaffing_mode: "popup" },
        });
        expect(res.assignments).toEqual([]);
    });
    it("plant eine Leitung, die im Personalstamm steht, wie alle anderen", () => {
        const res = runSchedulingAlgorithm({
            shifts: [frueh("In 1", "a")],
            facilityStaff: [staff("L", "Lilia Leitung", { station: "In 1" })],
            profiles: [{ id: "L", full_name: "Lilia Leitung", station: "In 1", role: "leitung" }],
            wishes: [], nightEntries: [], availability: [], settings: { understaffing_mode: "popup" },
        });
        expect(res.assignments.map(a => a.staff_name)).toEqual(["Lilia Leitung"]);
    });
    it("schlägt ein Leitungskonto ohne Stammdaten nicht als Ersatz vor", () => {
        const out = rankReplacementCandidates({
            shift: { station: "In 1", date: "2026-10-12", shift_type: "frueh", start_time: "06:00", end_time: "14:00" },
            facilityStaff: [staff("p", "Paula", { station: "In 1" })],
            profiles: [{ id: "L", full_name: "Lilia Leitung", station: "", role: "leitung" }, { id: "p", full_name: "Paula", station: "In 1", role: "mitarbeiter" }],
            wishes: [], nightEntries: [], availability: [],
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {}, excludeNames: [],
        });
        expect(out.map(c => c.staff_name)).toEqual(["Paula"]);
    });
    it("wer an dem Tag schon Frühdienst hat, ist für einen zweiten Frühdienst kein Ersatz", () => {
        const out = rankReplacementCandidates({
            shift: { station: "In 2", date: "2026-10-12", shift_type: "frueh", start_time: "06:00", end_time: "14:00" },
            facilityStaff: [staff("p", "Paula", { station: null })],
            profiles: [],
            wishes: [], nightEntries: [], availability: [],
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: { p: { "2026-10-12": "frueh" } }, excludeNames: [],
        });
        expect(out).toEqual([]);
    });
});
describe("runSchedulingAlgorithm — Praxis: Arzt-Plätze und Team-Plätze getrennt", () => {
    const P = "Praxis";
    const team = (id: string, name: string) => staff(id, name, { station: P, role: "Medizinische Fachangestellte (MFA)" });
    const arzt = (id: string, name: string) => staff(id, name, { station: P, role: "Praxisärztin / Praxisarzt" });
    const schicht = { id: "f1", station: P, date: "2026-11-02", shift_type: "frueh", planned_staff: 3, start_time: "08:00", end_time: "12:00" };
    const basis = { profiles: [], wishes: [], nightEntries: [], availability: [], settings: { understaffing_mode: "popup" } };
    it("1 Arzt + 2 Team: eine Ärztin, zwei MFA — auch wenn mehr Ärzte frei wären", () => {
        const res = runSchedulingAlgorithm({
            ...basis, shifts: [schicht],
            facilityStaff: [arzt("a1", "Arzt 1"), arzt("a2", "Arzt 2"), team("m1", "MFA 1"), team("m2", "MFA 2"), team("m3", "MFA 3")],
            aerzteSoll: { [P]: { frueh: 1 } },
        });
        const namen = res.assignments.map(a => a.staff_name);
        expect(namen.filter(n => n.startsWith("Arzt"))).toHaveLength(1);
        expect(namen.filter(n => n.startsWith("MFA"))).toHaveLength(2);
    });
    it("fehlt die MFA, springt keine Ärztin ein — der Platz bleibt offen", () => {
        const res = runSchedulingAlgorithm({
            ...basis, shifts: [schicht],
            facilityStaff: [arzt("a1", "Arzt 1"), arzt("a2", "Arzt 2"), arzt("a3", "Arzt 3"), team("m1", "MFA 1")],
            aerzteSoll: { [P]: { frueh: 1 } },
        });
        expect(res.assignments.filter(a => a.staff_name.startsWith("Arzt"))).toHaveLength(1);
        expect(res.assignments.some(a => a.staff_name === "MFA 1")).toBe(true);
        expect(res.unfilled_slots[0]?.slots_missing).toBe(1);
    });
    it("ohne ärztlichen Soll wird wie bisher nicht unterschieden", () => {
        const res = runSchedulingAlgorithm({
            ...basis, shifts: [schicht],
            facilityStaff: [arzt("a1", "Arzt 1"), arzt("a2", "Arzt 2"), arzt("a3", "Arzt 3")],
        });
        expect(res.assignments).toHaveLength(3);
    });
    it("Ersatz für eine ausgefallene MFA ist nie die Ärztin", () => {
        const kandidaten = rankReplacementCandidates({
            shift: { station: P, date: "2026-11-02", shift_type: "frueh", start_time: "08:00", end_time: "12:00" },
            facilityStaff: [arzt("a1", "Arzt 1"), team("m2", "MFA 2")],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {}, gruppe: "team",
        });
        expect(kandidaten.map(k => k.staff_name)).toEqual(["MFA 2"]);
    });
});
describe("arztPlaetze — Ärzte je Wochentag", () => {
    it("der Tag geht dem Soll der Schicht vor", async () => {
        const { arztPlaetze } = await import("@/lib/scheduling/generate-plan-core");
        const soll = { Praxis: { frueh: 1 } };
        const sonntag = { station: "Praxis", shift_type: "frueh", planned_staff: 3, date: "2026-11-22" };
        expect(arztPlaetze(soll, sonntag, { "0": { frueh: 0 } })).toBe(0);
        expect(arztPlaetze(soll, { ...sonntag, date: "2026-11-20" }, { "0": { frueh: 0 } })).toBe(1);
    });
});

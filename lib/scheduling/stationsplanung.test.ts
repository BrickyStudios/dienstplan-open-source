import { describe, it, expect } from "vitest";
import { baueStationsplanung } from "./stationsplanung";
import { pruefeEignung } from "./eignung";
const basis = {
    station: "Station 3",
    von: "2026-10-05",
    bis: "2026-10-11",
    settings: null,
    absences: [],
};
describe("baueStationsplanung", () => {
    const plan = baueStationsplanung({
        ...basis,
        shifts: [
            { id: "s1", station: "Station 3", date: "2026-10-06", shift_type: "nacht", planned_staff: 2, start_time: null, end_time: null },
            { id: "s0", station: "Station 3", date: "2026-10-06", shift_type: "frueh", planned_staff: 3, start_time: null, end_time: null },
            { id: "x1", station: "Station 5", date: "2026-10-05", shift_type: "nacht", planned_staff: 1, start_time: null, end_time: null },
            { id: "alt", station: "Station 3", date: "2026-09-30", shift_type: "frueh", planned_staff: 1, start_time: null, end_time: null },
        ],
        assignments: [
            { shift_id: "x1", staff_id: null, staff_name: "Berta", status: "confirmed" },
            { shift_id: "s0", staff_id: "p-anna", staff_name: "Anna", status: "cancelled" },
            { shift_id: "s0", staff_id: null, staff_name: "Freitext Person", status: "manual" },
        ],
        facilityStaff: [
            { id: "p-anna", full_name: "Anna", active: true, station: "Station 5", max_hours_per_week: 30, job_type: "Teilzeit", hourly_rate: null, minijob_buffer_pct: 15, max_consecutive_nights: 2 },
            { id: "fs-berta", full_name: "Berta", active: true, station: "Station 3", max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 },
            { id: "fs-weg", full_name: "Ausgeschieden", active: false, station: "Station 3", max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 },
        ],
        profiles: [{ id: "p-anna", full_name: "Anna", station: "Station 3" }],
    });
    it("zeigt nur die Schichten der Station in der Woche, sortiert Früh vor Nacht", () => {
        expect(plan.stationsSchichten.map(s => s.id)).toEqual(["s0", "s1"]);
    });
    it("behält Schichten anderer Stationen für die Prüfung", () => {
        expect(plan.schichten.map(s => s.id)).toContain("x1");
    });
    it("führt Personen zusammen: Profil gewinnt, Ausgeschiedene fehlen", () => {
        const namen = plan.personen.map(p => `${p.name}:${p.station}`);
        expect(namen).toEqual(["Anna:Station 3", "Berta:Station 3"]);
    });
    it("übernimmt die Grenzen aus dem Stamm (Planer-Auflösung)", () => {
        const anna = plan.personen.find(p => p.name === "Anna")!;
        expect(anna.grenzen.maxConsecutiveNights).toBe(2);
        expect(anna.vertragsMinutenWoche).toBe(30 * 60);
        expect(anna.grenzen.maxShiftsPerWeek).toBeNull();
    });
    it("ordnet Belegung ohne staff_id über den Namen zu; stornierte zählen nicht", () => {
        const berta = plan.personen.find(p => p.name === "Berta")!;
        expect(plan.belegung).toEqual([{ shiftId: "x1", staffId: berta.id }]);
        expect(plan.namenJeSchicht.s0).toEqual(["Freitext Person"]);
    });
    it("Berta darf nach der Nacht auf Station 5 nicht in den Frühdienst auf Station 3", () => {
        const berta = plan.personen.find(p => p.name === "Berta")!;
        const s0 = plan.schichten.find(s => s.id === "s0")!;
        expect(pruefeEignung(berta, s0, plan.schichten, plan.belegung).stufe).toBe("blocker");
    });
});
describe("Abwesenheiten", () => {
    it("werden je Tag gesetzt, Krankmeldung schlägt Urlaub, außerhalb der Woche abgeschnitten", () => {
        const plan = baueStationsplanung({
            ...basis,
            shifts: [], assignments: [],
            facilityStaff: [{ id: "a", full_name: "Anna", active: true, station: "Station 3", max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 }],
            profiles: [],
            absences: [
                { staff_id: "a", from: "2026-10-01", to: "2026-10-07", kind: "urlaub" },
                { staff_id: "a", from: "2026-10-06", to: "2026-10-06", kind: "krank" },
            ],
        });
        expect(plan.personen[0].abwesendeTage).toEqual({
            "2026-10-05": "Urlaub", "2026-10-06": "Krankmeldung", "2026-10-07": "Urlaub",
        });
    });
});
describe("baueStationsplanung — Springer und Einspringen", () => {
    const plan = baueStationsplanung({
        ...basis,
        shifts: [
            { id: "s1", station: "Station 3", date: "2026-10-06", shift_type: "frueh", planned_staff: 2, start_time: null, end_time: null },
        ],
        assignments: [
            { shift_id: "s1", staff_id: "fs-berta", staff_name: "Berta", status: "confirmed", is_springer: false },
            { shift_id: "s1", staff_id: "fs-carl", staff_name: "Carl", status: "manual", is_springer: true },
        ],
        facilityStaff: [
            { id: "fs-berta", full_name: "Berta", active: true, station: "Station 3", max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15 },
            { id: "fs-carl", full_name: "Carl", active: true, station: "Station 5", max_hours_per_week: 40, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15, einsatz_stationen: ["Station 3"] },
        ],
        profiles: [],
    });
    it("meldet, wer auf der Schicht als Springer eingeteilt ist", () => {
        expect(plan.springerJeSchicht).toEqual({ s1: ["Carl"] });
    });
    it("gibt die Stationen mit, auf denen eine Person einspringen darf", () => {
        expect(plan.personen.find(p => p.name === "Carl")?.einsatzStationen).toEqual(["Station 3"]);
        expect(plan.personen.find(p => p.name === "Berta")?.einsatzStationen).toEqual([]);
    });
});

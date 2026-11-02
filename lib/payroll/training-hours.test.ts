import { describe, it, expect } from "vitest";
import { trainingDuration, sumPaidTrainingHours } from "@/lib/payroll/training-hours";
describe("trainingDuration", () => {
    it("rechnet eine normale Zeitspanne", () => {
        expect(trainingDuration("09:00", "12:30")).toBe(3.5);
    });
    it("über Mitternacht", () => {
        expect(trainingDuration("22:00", "02:00")).toBe(4);
    });
    it("ohne Zeiten -> 0 (keine bezahlte Stunde)", () => {
        expect(trainingDuration(null, null)).toBe(0);
        expect(trainingDuration("09:00", null)).toBe(0);
    });
    it("ungültige Zeit -> 0", () => {
        expect(trainingDuration("abc", "12:00")).toBe(0);
    });
});
describe("sumPaidTrainingHours", () => {
    const t = (id: string, start: string | null, end: string | null, paid = true) => ({ id, start_time: start, end_time: end, paid });
    it("bezahltes Training addiert die Stunden pro Teilnehmer", () => {
        const map = sumPaidTrainingHours([t("x", "09:00", "13:00")], [{ training_id: "x", staff_name: "Anna" }, { training_id: "x", staff_name: "Bea" }]);
        expect(map.get("Anna")).toBe(4);
        expect(map.get("Bea")).toBe(4);
    });
    it("unbezahltes Training trägt 0 bei", () => {
        const map = sumPaidTrainingHours([t("x", "09:00", "13:00", false)], [{ training_id: "x", staff_name: "Anna" }]);
        expect(map.get("Anna")).toBeUndefined();
    });
    it("mehrere Trainings summieren sich pro Person", () => {
        const map = sumPaidTrainingHours([t("a", "08:00", "10:00"), t("b", "14:00", "15:30")], [
            { training_id: "a", staff_name: "Anna" },
            { training_id: "b", staff_name: "Anna" },
        ]);
        expect(map.get("Anna")).toBe(3.5);
    });
    it("Training ohne Zeiten zählt nicht (0h)", () => {
        const map = sumPaidTrainingHours([t("x", null, null)], [{ training_id: "x", staff_name: "Anna" }]);
        expect(map.get("Anna")).toBeUndefined();
    });
});

import { describe, it, expect } from "vitest";
import { decideSickResolution } from "@/lib/sick-resolution";
import type { ReplacementCandidate } from "@/lib/scheduling/generate-plan-core";
const cand = (name: string, overtime = false): ReplacementCandidate => ({
    staff_id: name.toLowerCase(), staff_name: name, score: 50, reason: "Verfügbar", is_overtime: overtime,
});
describe("decideSickResolution — Kaskade", () => {
    it("keine Lücke -> no_gap", () => {
        expect(decideSickResolution({
            mode: "auto", gap: 0, springer: [], candidates: [], hasExternalAgencies: true, autoExternalEnabled: true, requestReplacement: null,
        })).toEqual({ action: "no_gap" });
    });
    it("auto: Springer hat Vorrang", () => {
        const d = decideSickResolution({
            mode: "auto", gap: 1, springer: [{ staffName: "Anna", userId: "a" }], candidates: [cand("Bea")],
            hasExternalAgencies: true, autoExternalEnabled: true, requestReplacement: null,
        });
        expect(d).toMatchObject({ action: "assign", staffName: "Anna", isOvertime: false });
    });
    it("auto: ohne Springer den besten Kandidaten zuweisen", () => {
        const d = decideSickResolution({
            mode: "auto", gap: 1, springer: [], candidates: [cand("Bea", true)],
            hasExternalAgencies: true, autoExternalEnabled: true, requestReplacement: null,
        });
        expect(d).toMatchObject({ action: "assign", staffName: "Bea", isOvertime: true });
    });
    it("auto: ohne internen Ersatz und mit aktiven Diensten externe Anfrage", () => {
        const d = decideSickResolution({
            mode: "auto", gap: 1, springer: [], candidates: [],
            hasExternalAgencies: true, autoExternalEnabled: true, requestReplacement: null,
        });
        expect(d).toEqual({ action: "request_external" });
    });
    it("auto: ohne alles -> Eskalation an die Leitung", () => {
        const d = decideSickResolution({
            mode: "auto", gap: 1, springer: [], candidates: [],
            hasExternalAgencies: false, autoExternalEnabled: false, requestReplacement: null,
        });
        expect(d).toMatchObject({ action: "escalate_notify", reason: "no_candidate" });
    });
    it("auto: 'kein Ersatz' gewählt -> keine automatische Lösung", () => {
        const d = decideSickResolution({
            mode: "auto", gap: 1, springer: [{ staffName: "Anna", userId: "a" }], candidates: [],
            hasExternalAgencies: true, autoExternalEnabled: true, requestReplacement: false,
        });
        expect(d).toMatchObject({ action: "escalate_notify", reason: "suppressed" });
    });
    it("popup: immer Optionen an die Leitung, nie automatisch zuweisen", () => {
        const d = decideSickResolution({
            mode: "popup", gap: 1, springer: [{ staffName: "Anna", userId: "a" }], candidates: [cand("Bea")],
            hasExternalAgencies: true, autoExternalEnabled: false, requestReplacement: null,
        });
        expect(d.action).toBe("notify_options");
        if (d.action === "notify_options") {
            expect(d.springer.map(s => s.staffName)).toEqual(["Anna"]);
            expect(d.candidates.map(c => c.staff_name)).toEqual(["Bea"]);
            expect(d.canRequestExternal).toBe(true);
        }
    });
});

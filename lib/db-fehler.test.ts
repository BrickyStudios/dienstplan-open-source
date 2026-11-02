import { describe, expect, it } from "vitest";
import { fehlendeSpalte, spalteFehlt, tabelleFehlt } from "./db-fehler";
describe("tabelleFehlt", () => {
    it("erkennt den PostgREST-Code — der reale Fall seit 2025", () => {
        expect(tabelleFehlt({
            code: "PGRST205",
            message: "Could not find the table 'public.anbindungen' in the schema cache",
        })).toBe(true);
    });
    it("erkennt weiterhin den PostgreSQL-Code", () => {
        expect(tabelleFehlt({ code: "42P01", message: 'relation "anbindungen" does not exist' })).toBe(true);
    });
    it("hält andere Fehler nicht für eine fehlende Tabelle", () => {
        expect(tabelleFehlt({ code: "42703" })).toBe(false);
        expect(tabelleFehlt({ code: "PGRST204" })).toBe(false);
        expect(tabelleFehlt({ code: "23505", message: "duplicate key" })).toBe(false);
    });
    it("kommt mit null und undefined zurecht — der Normalfall ohne Fehler", () => {
        expect(tabelleFehlt(null)).toBe(false);
        expect(tabelleFehlt(undefined)).toBe(false);
        expect(tabelleFehlt({})).toBe(false);
    });
});
describe("spalteFehlt", () => {
    it("erkennt beide Schreibweisen", () => {
        expect(spalteFehlt({ code: "PGRST204" })).toBe(true);
        expect(spalteFehlt({ code: "42703" })).toBe(true);
    });
    it("verwechselt eine fehlende Spalte nicht mit einer fehlenden Tabelle", () => {
        expect(spalteFehlt({ code: "PGRST205" })).toBe(false);
        expect(spalteFehlt({ code: "42P01" })).toBe(false);
    });
});
describe("fehlendeSpalte", () => {
    it("liest den Namen aus der PostgREST-Meldung", () => {
        expect(fehlendeSpalte({ code: "PGRST204", message: "Could not find the 'doctor_demand' column of 'facility_settings' in the schema cache" })).toBe("doctor_demand");
    });
    it("liest den Namen aus beiden PostgreSQL-Schreibweisen", () => {
        expect(fehlendeSpalte({ code: "42703", message: 'column "bundesland" of relation "facility_settings" does not exist' })).toBe("bundesland");
        expect(fehlendeSpalte({ code: "42703", message: "column facility_settings.ort does not exist" })).toBe("ort");
    });
    it("null bei anderen Fehlern oder ohne Namen", () => {
        expect(fehlendeSpalte({ code: "23505", message: "duplicate key" })).toBeNull();
        expect(fehlendeSpalte({ code: "PGRST204", message: "etwas anderes" })).toBeNull();
        expect(fehlendeSpalte(null)).toBeNull();
    });
});

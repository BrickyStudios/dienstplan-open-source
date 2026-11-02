import { describe, expect, it } from "vitest";
import { sameFacility } from "./leitung-auth";
describe("sameFacility", () => {
    it("erkennt dieselbe Einrichtung", () => {
        expect(sameFacility("Klinikum Nord", "Klinikum Nord")).toBe(true);
    });
    it("trennt verschiedene Einrichtungen", () => {
        expect(sameFacility("Klinikum Nord", "Klinikum Süd")).toBe(false);
    });
    it("ist der Grund für diese Funktion: leer ist NIE derselbe Mandant", () => {
        expect(sameFacility("", "")).toBe(false);
    });
    it("lässt auch leer-gegen-gesetzt nicht durch", () => {
        expect(sameFacility("", "Klinikum Nord")).toBe(false);
        expect(sameFacility("Klinikum Nord", "")).toBe(false);
    });
    it("behandelt null und undefined wie leer", () => {
        expect(sameFacility(null, null)).toBe(false);
        expect(sameFacility(undefined, undefined)).toBe(false);
        expect(sameFacility(null, "Klinikum Nord")).toBe(false);
        expect(sameFacility("Klinikum Nord", undefined)).toBe(false);
    });
    it("zählt reinen Leerraum als leer — sonst wäre \" \" ein Schlupfloch", () => {
        expect(sameFacility("   ", "   ")).toBe(false);
        expect(sameFacility("\t", "\n")).toBe(false);
    });
    it("verzeiht Leerraum am Rand eines echten Namens", () => {
        expect(sameFacility(" Klinikum Nord ", "Klinikum Nord")).toBe(true);
    });
    it("unterscheidet Groß- und Kleinschreibung — Namen sind der Schlüssel", () => {
        expect(sameFacility("klinikum nord", "Klinikum Nord")).toBe(false);
    });
});

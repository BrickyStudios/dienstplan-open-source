import { describe, expect, it } from "vitest";
import { dateiPruefen, zeilenAusTextItems } from "@/lib/dokument-lesen";
const st = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10 });
describe("zeilenAusTextItems", () => {
    it("ordnet Stücke nach Zeile und Spalte, egal in welcher Reihenfolge sie kommen", () => {
        const text = zeilenAusTextItems([
            st("Name", 10, 700), st("[A]", 10, 680), st("[B]", 10, 660),
            st("Mo", 200, 700), st("F", 200, 680), st("S", 200, 660),
            st("Di", 300, 700), st("F", 300, 680), st("U", 300, 660),
        ]);
        expect(text).toBe("Name | Mo | Di\n[A] | F | F\n[B] | S | U");
    });
    it("hält Wörter einer Zelle zusammen", () => {
        expect(zeilenAusTextItems([st("Früh", 10, 500, 20), st("7:30", 32, 500, 20)])).toBe("Früh 7:30");
    });
    it("leere Seite ergibt leeren Text", () => {
        expect(zeilenAusTextItems([st("  ", 10, 10)])).toBe("");
    });
});
describe("dateiPruefen", () => {
    it("nimmt PDF und Fotos", () => {
        expect(dateiPruefen({ type: "application/pdf", size: 1000, name: "plan.pdf" })).toBeNull();
        expect(dateiPruefen({ type: "image/jpeg", size: 1000, name: "plan.jpg" })).toBeNull();
        expect(dateiPruefen({ type: "", size: 1000, name: "PLAN.PDF" })).toBeNull();
    });
    it("sagt bei HEIC, was zu tun ist", () => {
        expect(dateiPruefen({ type: "image/heic", size: 1000, name: "IMG_1.HEIC" })).toMatch(/HEIC/);
    });
    it("lehnt Fremdes und Übergroßes ab", () => {
        expect(dateiPruefen({ type: "application/vnd.ms-excel", size: 1000, name: "plan.xls" })).toMatch(/PDF/);
        expect(dateiPruefen({ type: "application/pdf", size: 20 * 1024 * 1024, name: "plan.pdf" })).toMatch(/15 MB/);
    });
});

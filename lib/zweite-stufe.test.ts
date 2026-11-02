import { describe, expect, it } from "vitest";
import { stufeAusToken, stufeFehlt } from "./zweite-stufe";
function token(nutz: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "ES256" })}.${b64(nutz)}.signatur`;
}
const mitFaktor = { factors: [{ id: "f", status: "verified", factor_type: "totp", created_at: "", updated_at: "" }] } as never;
const nurUnbestaetigt = { factors: [{ id: "f", status: "unverified", factor_type: "totp", created_at: "", updated_at: "" }] } as never;
const ohneFaktor = { factors: [] } as never;
describe("stufeAusToken", () => {
    it("liest aal aus dem Token", () => {
        expect(stufeAusToken(token({ aal: "aal2" }))).toBe("aal2");
    });
    it("gibt null bei Unsinn", () => {
        expect(stufeAusToken("kein-token")).toBeNull();
        expect(stufeAusToken(undefined)).toBeNull();
    });
});
describe("stufeFehlt", () => {
    it("Konto mit Faktor und Sitzung auf aal1: fehlt", () => {
        expect(stufeFehlt(mitFaktor, token({ aal: "aal1" }))).toBe(true);
    });
    it("Konto mit Faktor und Sitzung auf aal2: fehlt nicht", () => {
        expect(stufeFehlt(mitFaktor, token({ aal: "aal2" }))).toBe(false);
    });
    it("Konto ohne Faktor: aal1 reicht", () => {
        expect(stufeFehlt(ohneFaktor, token({ aal: "aal1" }))).toBe(false);
    });
    it("unbestätigter Faktor zählt nicht", () => {
        expect(stufeFehlt(nurUnbestaetigt, token({ aal: "aal1" }))).toBe(false);
    });
    it("Faktor da, Token unlesbar: fehlt (fail closed)", () => {
        expect(stufeFehlt(mitFaktor, "kaputt")).toBe(true);
        expect(stufeFehlt(mitFaktor, null)).toBe(true);
    });
});

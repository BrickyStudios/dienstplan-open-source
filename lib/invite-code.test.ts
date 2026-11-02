import { describe, expect, it } from "vitest";
import { generateInviteCode, inviteCodeExpiry, INVITE_CODE_TTL_DAYS } from "./invite-code";
describe("generateInviteCode", () => {
    it("baut das Format <prefix>-XXXXXX", () => {
        expect(generateInviteCode("NRV-M")).toMatch(/^NRV-M-[A-HJ-NP-Z2-9]{6}$/);
        expect(generateInviteCode("NRV-L")).toMatch(/^NRV-L-[A-HJ-NP-Z2-9]{6}$/);
    });
    it("lässt die am Telefon verwechselbaren Zeichen weg (I, O, 0, 1)", () => {
        const alle = Array.from({ length: 400 }, () => generateInviteCode("NRV-M")).join("");
        expect(alle).not.toMatch(/[IO01]/);
    });
    it("wiederholt sich nicht — 32^6 Möglichkeiten, 500 Ziehungen", () => {
        const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode("NRV-M")));
        expect(codes.size).toBe(500);
    });
    it("nutzt den ganzen Zeichenvorrat, klebt also nicht an wenigen Werten", () => {
        const zeichen = new Set(Array.from({ length: 300 }, () => generateInviteCode("X").slice(2)).join("").split(""));
        expect(zeichen.size).toBeGreaterThanOrEqual(30);
    });
});
describe("inviteCodeExpiry", () => {
    it("liegt standardmäßig sieben Tage in der Zukunft", () => {
        const tage = (new Date(inviteCodeExpiry()).getTime() - Date.now()) / 86400000;
        expect(tage).toBeGreaterThan(INVITE_CODE_TTL_DAYS - 0.01);
        expect(tage).toBeLessThan(INVITE_CODE_TTL_DAYS + 0.01);
    });
    it("nimmt eine abweichende Frist an (Demo-Codes: 30 Tage)", () => {
        const tage = (new Date(inviteCodeExpiry(30)).getTime() - Date.now()) / 86400000;
        expect(Math.round(tage)).toBe(30);
    });
    it("liefert einen ISO-String, den Postgres als timestamptz annimmt", () => {
        expect(inviteCodeExpiry()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
    it("liegt nie in der Vergangenheit", () => {
        expect(new Date(inviteCodeExpiry()).getTime()).toBeGreaterThan(Date.now());
    });
});

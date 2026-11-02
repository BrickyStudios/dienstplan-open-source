import { afterEach, describe, expect, it, vi } from "vitest";
import { bereichAus, bereicheAusListe, inBereichen, ipAlsZahl } from "./suchmaschinen";
const LISTE = {
    prefixes: [
        { ipv6Prefix: "2001:4860:4801:10::/64" },
        { ipv4Prefix: "66.249.64.0/27" },
        { ipv4Prefix: "157.55.39.0/24" },
        { kaputt: "1.2.3.4/8" },
        { ipv4Prefix: "300.1.1.1/24" },
    ],
};
describe("IP-Bereiche", () => {
    const bereiche = bereicheAusListe(LISTE);
    it("liest nur gültige Einträge", () => {
        expect(bereiche).toHaveLength(3);
    });
    it("erkennt Googlebot und Bingbot", () => {
        expect(inBereichen("66.249.64.1", bereiche)).toBe(true);
        expect(inBereichen("66.249.64.31", bereiche)).toBe(true);
        expect(inBereichen("157.55.39.200", bereiche)).toBe(true);
        expect(inBereichen("2001:4860:4801:10::abcd", bereiche)).toBe(true);
        expect(inBereichen("2001:4860:4801:10:1:2:3:4", bereiche)).toBe(true);
        expect(inBereichen("::ffff:66.249.64.5", bereiche)).toBe(true);
    });
    it("lässt Nachbarn und fremde Adressen draußen", () => {
        expect(inBereichen("34.31.120.130", bereiche)).toBe(false);
        expect(inBereichen("66.249.64.32", bereiche)).toBe(false);
        expect(inBereichen("2001:4860:4801:11::1", bereiche)).toBe(false);
        expect(inBereichen("unknown", bereiche)).toBe(false);
        expect(inBereichen("", bereiche)).toBe(false);
    });
    it("wirft IPv4 und IPv6 nicht durcheinander", () => {
        expect(inBereichen("::4231:4001", [bereichAus("66.49.64.0/24")!])).toBe(false);
    });
    it("lehnt Unsinn ab", () => {
        for (const s of ["1.2.3", "1.2.3.4.5", "256.1.1.1", "1::2::3", "1:2:3:4:5:6:7:8:9", "g::1", "<script>"]) {
            expect(ipAlsZahl(s), s).toBeNull();
        }
        expect(bereichAus("1.2.3.4/33")).toBeNull();
    });
});
describe("istSuchmaschine", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });
    it("lädt die Listen einmal und erkennt danach ohne Netz", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(LISTE)));
        vi.stubGlobal("fetch", fetchMock);
        const { istSuchmaschine, QUELLEN } = await import("./suchmaschinen");
        expect(await istSuchmaschine("66.249.64.1")).toBe(true);
        expect(await istSuchmaschine("34.31.120.130")).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(QUELLEN.length);
    });
    it("bleibt still, wenn eine Quelle nicht antwortet", async () => {
        vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("bing") ? new Response("nein", { status: 503 }) : new Response(JSON.stringify(LISTE))));
        const { istSuchmaschine } = await import("./suchmaschinen");
        expect(await istSuchmaschine("66.249.64.1")).toBe(false);
    });
    it("nimmt 'unknown' nie aus und fragt dafür kein Netz", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { istSuchmaschine } = await import("./suchmaschinen");
        expect(await istSuchmaschine("unknown")).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

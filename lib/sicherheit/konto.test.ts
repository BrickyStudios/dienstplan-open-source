import { describe, expect, it } from "vitest";
import { geraetKurz, ortKurz } from "./geraet";
import { neueAnmeldungMailText, sitzungSchonGesehen } from "./konto";
describe("geraetKurz", () => {
    it.each([
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Windows · Chrome"],
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "Windows · Edge"],
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "iOS · Safari"],
        ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Linux · Firefox"],
        [null, "Unbekanntes Gerät"],
    ])("%s", (ua, erwartet) => {
        expect(geraetKurz(ua)).toBe(erwartet);
    });
    it("ein Browser-Update macht kein neues Gerät", () => {
        expect(geraetKurz("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36"))
            .toBe(geraetKurz("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36"));
    });
});
describe("ortKurz", () => {
    it("Stadt und Land, oder nichts", () => {
        expect(ortKurz({ stadt: "Köln", land: "DE" })).toBe("Köln, DE");
        expect(ortKurz({ stadt: null, land: "VN" })).toBe("VN");
        expect(ortKurz({ stadt: null, land: null })).toBeNull();
    });
});
describe("sitzungSchonGesehen", () => {
    it("fragt die Datenbank je Sitzung nur einmal", () => {
        const id = "aaaaaaaa-0000-0000-0000-000000000001";
        expect(sitzungSchonGesehen(id)).toBe(false);
        expect(sitzungSchonGesehen(id)).toBe(true);
    });
});
describe("neueAnmeldungMailText", () => {
    it("nennt Gerät, Ort und den Weg zurück — und maskiert", () => {
        const { subject, html } = neueAnmeldungMailText({
            zeit: "2026-10-18T08:00:00.000Z", ip: "203.0.113.7", ort: "Hanoi, VN", geraet: "<b>Linux</b> · Firefox",
        });
        expect(subject).toContain("Hanoi, VN");
        expect(html).toContain("Waren Sie das nicht?");
        expect(html).toContain("/einstellungen");
        expect(html).toContain("203.0.113.7");
        expect(html).not.toContain("<b>Linux</b>");
        expect(html).toContain("&lt;b&gt;Linux");
    });
});

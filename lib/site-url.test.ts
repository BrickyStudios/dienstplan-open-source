import { describe, it, expect, afterEach, vi } from "vitest";
import { siteUrl, absoluteUrl, clientSiteUrl, CANONICAL_SITE_URL } from "./site-url";
const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
    if (ORIGINAL === undefined)
        delete process.env.NEXT_PUBLIC_SITE_URL;
    else
        process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
    vi.unstubAllGlobals();
});
describe("siteUrl", () => {
    it("nimmt eine echte eigene Domain", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://dienstplan.klinik-beispiel.de";
        expect(siteUrl()).toBe("https://dienstplan.klinik-beispiel.de");
    });
    it("verwirft Deploy-Adressen — das war der SEO-Schaden", () => {
        for (const deploy of [
            "https://nurvo.vercel.app",
            "https://nurvo-git-feature-xyz.vercel.app",
            "https://irgendwas.netlify.app",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]) {
            process.env.NEXT_PUBLIC_SITE_URL = deploy;
            expect(siteUrl(), deploy).toBe(CANONICAL_SITE_URL);
        }
    });
    it("faellt bei Unsinn auf die kanonische Adresse zurueck", () => {
        for (const murks of ["", "   ", "nicht-mal-eine-url", "ftp://nurvo.de"]) {
            process.env.NEXT_PUBLIC_SITE_URL = murks;
            expect(siteUrl()).toBe(CANONICAL_SITE_URL);
        }
    });
    it("wirft den Pfad weg und behaelt nur den Ursprung", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://www.nurvo.de/irgendwas/";
        expect(siteUrl()).toBe("https://www.nurvo.de");
    });
});
describe("absoluteUrl", () => {
    it("setzt einen fehlenden Schraegstrich", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://www.nurvo.de";
        expect(absoluteUrl("preise")).toBe("https://www.nurvo.de/preise");
        expect(absoluteUrl("/preise")).toBe("https://www.nurvo.de/preise");
    });
});
describe("clientSiteUrl", () => {
    const alsSeite = (origin: string) => {
        const u = new URL(origin);
        vi.stubGlobal("window", { location: { origin: u.origin, hostname: u.hostname } });
    };
    it("gibt NIE die Deploy-Adresse heraus, auf der gerade gearbeitet wird", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://nurvo.vercel.app";
        alsSeite("https://nurvo.vercel.app");
        expect(clientSiteUrl()).toBe(CANONICAL_SITE_URL);
        expect(clientSiteUrl({ erlaubeLokal: true })).toBe(CANONICAL_SITE_URL);
    });
    it("laesst localhost nur zu, wenn ausdruecklich erlaubt", () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        alsSeite("http://localhost:3000");
        expect(clientSiteUrl()).toBe(CANONICAL_SITE_URL);
        expect(clientSiteUrl({ erlaubeLokal: true })).toBe("http://localhost:3000");
    });
    it("nimmt auf einer echten eigenen Domain diese Domain", () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://dienstplan.klinik-beispiel.de";
        alsSeite("https://dienstplan.klinik-beispiel.de");
        expect(clientSiteUrl()).toBe("https://dienstplan.klinik-beispiel.de");
    });
    it("funktioniert auch ohne window (Server-Rendering)", () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;
        vi.stubGlobal("window", undefined);
        expect(clientSiteUrl({ erlaubeLokal: true })).toBe(CANONICAL_SITE_URL);
    });
});

import { describe, expect, it, vi } from "vitest";
import { regelEmpfehlung } from "./empfehlung";
import { kiAnfrage, schwaerze } from "./empfehlung-ki";
import { sicherheitsMailText, type SicherheitsMeldung } from "./mail";
import { ART_TEXT } from "./signaturen";
const MELDUNG: SicherheitsMeldung = {
    ip: "203.0.113.7", land: "DE", region: "NW", stadt: "Hürth", userAgent: "curl/8.0 (von 198.51.100.4)",
    art: "login_fehlgeschlagen", schwere: "info", grund: "Anmeldung mit falschem Passwort",
    methode: "POST", pfad: "/login?email=chefin@praxis-muster.de",
    details: { konto: "chefin@praxis-muster.de", einrichtung: "Praxis Dr. Muster", stufe: "passwort" },
    punkte: 22, gesperrtBis: "2026-10-24T08:00:00.000Z",
};
describe("regelEmpfehlung", () => {
    it("hat für jede bekannte Art eine Empfehlung, keine fällt auf den Standardtext", () => {
        for (const art of Object.keys(ART_TEXT)) {
            const r = regelEmpfehlung({ art, pfad: "/x", gesperrt: false, einrichtung: null });
            expect(r.text, art).not.toContain("noch keine feste Empfehlung");
        }
    });
    it("Scanner: kein Handlungsbedarf — die Mail soll nicht bei jedem /wp-login.php Alarm schlagen", () => {
        expect(regelEmpfehlung({ art: "scanner_pfad", pfad: "/wp-login.php", gesperrt: true, einrichtung: null }).bedarf).toBe("keiner");
        expect(regelEmpfehlung({ art: "geheimnis_suche", pfad: "/.env", gesperrt: true, einrichtung: null }).bedarf).toBe("keiner");
    });
    it("Angriffsmuster auf eine echte Route: beobachten, sonst nichts", () => {
        expect(regelEmpfehlung({ art: "sql_injection", pfad: "/api/track?x=1' or 1=1", gesperrt: true, einrichtung: null }).bedarf).toBe("beobachten");
        expect(regelEmpfehlung({ art: "sql_injection", pfad: "/shop.php?id=1 union select", gesperrt: true, einrichtung: null }).bedarf).toBe("keiner");
    });
    it("gesperrtes Passwort-Raten auf ein Kundenkonto: handeln, mit Namen der Einrichtung", () => {
        const r = regelEmpfehlung({ art: "login_fehlgeschlagen", pfad: "/login", gesperrt: true, einrichtung: "Praxis Dr. Muster" });
        expect(r.bedarf).toBe("handeln");
        expect(r.text).toContain("Praxis Dr. Muster");
    });
    it("unbekannte Art: beobachten statt Schweigen", () => {
        expect(regelEmpfehlung({ art: "neu", pfad: null, gesperrt: false, einrichtung: null }).bedarf).toBe("beobachten");
    });
});
describe("KI-Anfrage — was das Modell sieht", () => {
    const text = kiAnfrage(MELDUNG);
    it("enthält weder IP noch E-Mail noch Konto, Einrichtung oder Stadt", () => {
        for (const geheim of ["203.0.113.7", "198.51.100.4", "chefin@praxis-muster.de", "Praxis Dr. Muster", "Hürth"]) {
            expect(text).not.toContain(geheim);
        }
    });
    it("sagt aber, dass ein Kundenkonto betroffen ist, und reicht die feste Empfehlung mit", () => {
        expect(text).toContain("Konto eines Nurvo-Kunden betroffen: ja");
        expect(text).toContain("Feste Empfehlung des Systems (handeln)");
        expect(text).toContain("[Einrichtung]");
    });
    it("schwaerze() ersetzt IPv4, IPv6 und Adressen", () => {
        expect(schwaerze("GET /a?ip=10.0.0.1&m=x@y.de&v6=2001:db8::1", 200)).toBe("GET /a?ip=[IP]&m=[E-Mail]&v6=[IP]");
    });
    it("schwaerze() kürzt lange Zahlen und IDs — sonst bricht die Ausgangsschranke ab (Ereignis vom 21.10.2026)", () => {
        expect(schwaerze("metabase-cve-2026-72898-detect/1.0", 200)).toBe("metabase-cve-2026-[Zahl]-detect/1.0");
        expect(schwaerze("/api/x/0b9e7c1e-3f2a-4c55-9d1e-123456789abc", 200)).toBe("/api/x/[ID]");
    });
});
describe("Mail mit Empfehlungen", () => {
    it("ohne KI: nur die feste Empfehlung, kein leerer KI-Block", () => {
        const { html } = sicherheitsMailText(MELDUNG);
        expect(html).toContain("Empfehlung (automatisch)");
        expect(html).toContain("Handeln");
        expect(html).not.toContain("Einschätzung der KI");
    });
    it("mit KI: beide Blöcke, KI darunter, gekennzeichnet und maskiert", () => {
        const { html } = sicherheitsMailText({
            ...MELDUNG,
            ki: { bedarf: "beobachten", einschaetzung: "Vermutlich <b>Tippfehler</b>.", schritte: ["Leitung anrufen"], modell: "claude-opus-5", ai_generated: true },
        });
        expect(html.indexOf("Empfehlung (automatisch)")).toBeLessThan(html.indexOf("Einschätzung der KI"));
        expect(html).toContain("KI-generiert (claude-opus-5)");
        expect(html).toContain('data-ai-generated="true"');
        expect(html).toContain("&lt;b&gt;Tippfehler");
        expect(html).toContain("<li>Leitung anrufen</li>");
    });
});
describe("kiEmpfehlung", () => {
    it("ohne Schlüssel: null, ohne Aufruf", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "");
        vi.stubEnv("AI_BASE_URL", "");
        const { kiEmpfehlung } = await import("./empfehlung-ki");
        expect(await kiEmpfehlung(MELDUNG)).toBeNull();
        vi.unstubAllEnvs();
    });
});
describe("Nachtrag-Mail", () => {
    it("sagt im Betreff und oben, dass es ein Nachtrag ist", () => {
        const { subject, html } = sicherheitsMailText({ ...MELDUNG, nachtragVom: "2026-10-18T00:55:04.000Z" });
        expect(subject.startsWith("Nachtrag (18.10.2026, 02:55): Nurvo-Sicherheit:")).toBe(true);
        expect(html.indexOf("Nachtrag zur Meldung vom")).toBeLessThan(html.indexOf(">IP-Adresse<"));
    });
});

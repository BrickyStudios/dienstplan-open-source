import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isPublicPath, MARKETING_ROUTES, PUBLIC_METADATA_ROUTES } from "./public-routes";
const MARKETING_DIR = join(process.cwd(), "app", "(marketing)");
const SITEMAP = join(process.cwd(), "app", "sitemap.ts");
function routesOnDisk(dir: string = MARKETING_DIR, prefix = ""): string[] {
    const routes: string[] = [];
    if (existsSync(join(dir, "page.tsx")))
        routes.push(prefix === "" ? "/" : prefix);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const segment = entry.name.startsWith("(") ? "" : "/" + entry.name;
        routes.push(...routesOnDisk(join(dir, entry.name), prefix + segment));
    }
    return [...new Set(routes)].sort();
}
function topLevelRoutesOnDisk(): string[] {
    return routesOnDisk().filter(r => r === "/" || r.indexOf("/", 1) === -1);
}
describe("öffentliche Routen", () => {
    it("jede Seite unter app/(marketing) ist ohne Anmeldung erreichbar", () => {
        for (const route of routesOnDisk()) {
            expect(isPublicPath(route), `${route} wird auf /login umgeleitet`).toBe(true);
        }
    });
    it("die Allowlist kennt keine Seiten, die es nicht mehr gibt", () => {
        const onDisk = topLevelRoutesOnDisk();
        for (const route of MARKETING_ROUTES) {
            expect(onDisk, `${route} steht in der Allowlist, aber die Seite fehlt`).toContain(route);
        }
    });
    it("das Open-Graph-Bild ist ohne Anmeldung abrufbar", () => {
        for (const route of PUBLIC_METADATA_ROUTES) {
            expect(isPublicPath(route), `${route} wird auf /login umgeleitet`).toBe(true);
        }
    });
    it("jeder Pfad in der Sitemap ist öffentlich — sonst indexiert Google eine Weiterleitung", () => {
        const src = readFileSync(SITEMAP, "utf8");
        const paths = [...src.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
        expect(paths.length).toBeGreaterThan(5);
        for (const path of paths) {
            expect(isPublicPath(path), `${path} steht in der Sitemap, ist aber nicht öffentlich`).toBe(true);
        }
    });
    it("jedes Weiterleitungsziel existiert und ist ohne Anmeldung erreichbar", () => {
        const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
        const block = src.slice(src.indexOf("async redirects()"), src.indexOf("async rewrites()"));
        const ziele = [...block.matchAll(/destination:\s*"([^"]+)"/g)].map(m => m[1]);
        expect(ziele.length).toBeGreaterThan(0);
        for (const ziel of ziele) {
            expect(isPublicPath(ziel), `${ziel} ist Weiterleitungsziel, aber nicht öffentlich`).toBe(true);
        }
    });
    it("keine Weiterleitung zeigt auf sich selbst", () => {
        const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
        const block = src.slice(src.indexOf("async redirects()"), src.indexOf("async rewrites()"));
        const paare = [...block.matchAll(/source:\s*"([^"]+)",\s*destination:\s*"([^"]+)"/g)];
        expect(paare.length).toBeGreaterThan(0);
        for (const [, source, destination] of paare) {
            expect(source, "Weiterleitungsschleife").not.toBe(destination);
        }
    });
    it("geschützte Seiten bleiben geschützt", () => {
        for (const path of ["/dashboard", "/schichtplan", "/mitarbeiter", "/einstellungen", "/admin"]) {
            expect(isPublicPath(path), `${path} wäre ohne Anmeldung erreichbar`).toBe(false);
        }
    });
    it("ein abschließender Slash ändert nichts", () => {
        expect(isPublicPath("/preise/")).toBe(true);
        expect(isPublicPath("/dashboard/")).toBe(false);
    });
    it("ein Präfix gibt keine fremde Seite frei", () => {
        expect(isPublicPath("/preise-intern")).toBe(false);
        expect(isPublicPath("/downloads-intern")).toBe(false);
    });
});

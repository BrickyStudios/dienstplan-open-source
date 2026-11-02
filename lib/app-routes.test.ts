import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isAppRoute, APP_ROUTES, OTHER_APP_ROUTES } from "./app-routes";
import { isPublicAsset, isPublicPath } from "./public-routes";
const APP_DIR = join(process.cwd(), "app");
const ROUTE_FILES = ["page.tsx", "page.ts", "route.ts", "route.tsx"];
function routesOnDisk(dir = APP_DIR, prefix = ""): string[] {
    const routes: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && ROUTE_FILES.includes(e.name))) {
        routes.push(prefix === "" ? "/" : prefix);
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const segment = entry.name.startsWith("(") ? "" : "/" + entry.name;
        routes.push(...routesOnDisk(join(dir, entry.name), prefix + segment));
    }
    return [...new Set(routes)].sort();
}
const AUTH_ROUTES = ["/login", "/register", "/passwort-vergessen", "/passwort-zuruecksetzen"];
describe("Routen hinter der Anmeldung", () => {
    it("jede Route unter app/ ist entweder öffentlich, geschützt oder eine API", () => {
        const unklar = routesOnDisk().filter((r) => !r.startsWith("/api/") &&
            !AUTH_ROUTES.includes(r) &&
            !isPublicPath(r) &&
            !isPublicAsset(r) &&
            !isAppRoute(r));
        expect(unklar, `Diese Seiten stehen weder in public-routes.ts noch in app-routes.ts. ` +
            `Der Proxy liefert dafür jetzt 404 — falls sie geschützt sein sollen, sind ` +
            `sie stattdessen ohne Anmeldung erreichbar: ${unklar.join(", ")}`).toEqual([]);
    });
    it("die Liste kennt keine Seiten, die es nicht mehr gibt", () => {
        const onDisk = routesOnDisk();
        for (const route of [...APP_ROUTES, ...OTHER_APP_ROUTES]) {
            const vorhanden = onDisk.some((r) => r === route || r.startsWith(route + "/"));
            expect(vorhanden, `${route} steht in app-routes.ts, aber die Seite fehlt`).toBe(true);
        }
    });
    it("keine Route ist gleichzeitig öffentlich und geschützt", () => {
        for (const route of [...APP_ROUTES, ...OTHER_APP_ROUTES]) {
            expect(isPublicPath(route), `${route} steht in beiden Listen`).toBe(false);
        }
    });
    it("Unterseiten sind erfasst, ähnlich benannte Seiten nicht", () => {
        expect(isAppRoute("/schichtplan/2026-09")).toBe(true);
        expect(isAppRoute("/schichtplan/")).toBe(true);
        expect(isAppRoute("/schichtplan-demo")).toBe(false);
    });
    it("unbekannte Pfade sind keine App-Routen — sie bekommen 404", () => {
        for (const path of ["/gibtsnicht-xyz", "/dashbord", "/preise-alt", "/"]) {
            expect(isAppRoute(path), `${path} würde weiterhin aufs Login umgeleitet`).toBe(false);
        }
    });
    it("der Rückweg aus der Bestätigungsmail ist ohne Sitzung erreichbar", () => {
        expect(isPublicPath("/auth/callback")).toBe(true);
    });
    it("die KI-Offenlegung nach Art. 50 EU-KI-VO ist ohne Anmeldung abrufbar", () => {
        expect(isPublicAsset("/ai-disclosure.json")).toBe(true);
    });
});

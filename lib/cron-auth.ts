import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
export type CronAuthResult = {
    ok: true;
} | {
    ok: false;
    grund: "nicht_konfiguriert";
} | {
    ok: false;
    grund: "falsches_geheimnis";
};
export function cronSecretKonfiguriert(): boolean {
    return Boolean(process.env.CRON_SECRET);
}
export function cronAuthCheck(req: NextRequest): CronAuthResult {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[cron] CRON_SECRET ist nicht gesetzt — der Lauf wird abgewiesen und es passiert NICHTS. " +
            "Solange die Variable fehlt, laufen weder Planerstellung noch Erinnerungen, Lohnabrechnung, " +
            "externes Nachfassen oder die PPBV-Festschreibung. Variable in den Projekt-Einstellungen " +
            "setzen und neu deployen.");
        return { ok: false, grund: "nicht_konfiguriert" };
    }
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length === expected.length && timingSafeEqual(given, expected))
        return { ok: true };
    return { ok: false, grund: "falsches_geheimnis" };
}
export function cronAuthorized(req: NextRequest): boolean {
    return cronAuthCheck(req).ok;
}

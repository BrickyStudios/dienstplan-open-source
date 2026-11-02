import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
const CACHE_DIR = process.env.NURVO_CACHE_DIR;
function safeFilename(facility: string, weekStart: string, weekEnd: string): string {
    const safe = facility.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return join(CACHE_DIR!, `plan_${safe}_${weekStart}_${weekEnd}.json`);
}
export function writePlanCache(facility: string, weekStart: string, weekEnd: string, data: unknown): void {
    if (!CACHE_DIR)
        return;
    try {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(safeFilename(facility, weekStart, weekEnd), JSON.stringify({ data, savedAt: new Date().toISOString() }), "utf8");
    }
    catch { }
}
export function readPlanCache(facility: string, weekStart: string, weekEnd: string): {
    data: unknown;
    savedAt: string;
} | null {
    if (!CACHE_DIR)
        return null;
    try {
        const raw = readFileSync(safeFilename(facility, weekStart, weekEnd), "utf8");
        return JSON.parse(raw) as {
            data: unknown;
            savedAt: string;
        };
    }
    catch {
        return null;
    }
}

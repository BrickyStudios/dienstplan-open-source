import { spalteFehlt } from "@/lib/db-fehler";
function isMissingColumn(error: {
    code?: string;
    message?: string;
} | null | undefined): boolean {
    if (!error)
        return false;
    if (spalteFehlt(error))
        return true;
    const m = (error.message ?? "").toLowerCase();
    return m.includes("schema cache") || (m.includes("column") && m.includes("does not exist"));
}
type Result = {
    data: any;
    error: any;
};
export async function insertWithOptional(db: any, table: string, base: Record<string, unknown>, extra: Record<string, unknown>): Promise<Result> {
    const hasExtra = Object.keys(extra).length > 0;
    let res = await db.from(table).insert(hasExtra ? { ...base, ...extra } : base).select().single();
    if (res.error && hasExtra && isMissingColumn(res.error)) {
        res = await db.from(table).insert(base).select().single();
    }
    return res;
}
export async function updateWithOptional(db: any, table: string, base: Record<string, unknown>, extra: Record<string, unknown>, match: Record<string, unknown>): Promise<Result> {
    const hasExtra = Object.keys(extra).length > 0;
    const build = (vals: Record<string, unknown>) => {
        let q = db.from(table).update(vals);
        for (const [k, v] of Object.entries(match))
            q = q.eq(k, v);
        return q.select().single();
    };
    let res = await build(hasExtra ? { ...base, ...extra } : base);
    if (res.error && hasExtra && isMissingColumn(res.error)) {
        res = await build(base);
    }
    return res;
}
export const AUFGABEN_AKTIONEN = ["reinigen", "austauschen", "desinfizieren", "reparieren", "sonstiges"];
export function trimOrNull(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
}
export function aufgabenAenderung(body: Record<string, unknown>, leitungName: string, mitStation: boolean): {
    updates: Record<string, unknown>;
} | {
    fehler: string;
} {
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) {
        const title = trimOrNull(body.title);
        if (!title)
            return { fehler: "Beschreibung erforderlich" };
        updates.title = title;
    }
    if (body.room !== undefined)
        updates.room = trimOrNull(body.room);
    if (mitStation && body.station !== undefined)
        updates.station = trimOrNull(body.station);
    if (body.building !== undefined)
        updates.building = trimOrNull(body.building);
    if (body.bed !== undefined)
        updates.bed = trimOrNull(body.bed);
    if (body.action !== undefined)
        updates.action = AUFGABEN_AKTIONEN.includes(body.action as string) ? body.action : "reinigen";
    if (body.priority !== undefined)
        updates.priority = body.priority === "hoch" ? "hoch" : "normal";
    if (body.status !== undefined) {
        if (body.status === "done") {
            updates.status = "done";
            updates.done_at = new Date().toISOString();
            updates.done_by_name = leitungName;
        }
        else {
            updates.status = "open";
            updates.done_at = null;
            updates.done_by_name = null;
        }
    }
    return { updates };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { computePpbvReport, monthRange, isPastMonth, previousMonth, recordRowsFromReport, reportFromRecordRows, type PpbvReport, type PpbvRecordRow, type PpbvShift, type PpbvSource, } from "@/lib/ppbv";
import { resolveCapabilities } from "@/lib/plan";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
type Db = SupabaseClient<any, any, any>;
type PgError = {
    code?: string | null;
    message?: string;
} | null;
function isTableMissing(e: PgError): boolean {
    return tabelleFehlt(e);
}
function isColumnMissing(e: PgError): boolean {
    return spalteFehlt(e);
}
const BASE_COLS = "station, year, month, shifts_count, planned_sum, actual_sum, understaffed_count, fulfilled_shifts, compliance_pct, shift_quote_pct, by_type, generated_at";
const EXTRA_COLS = "source";
export type FrozenState = {
    rows: PpbvRecordRow[] | null;
    frozenAt: string | null;
    source: string | null;
    migrationPending: boolean;
};
const NOT_FROZEN: FrozenState = { rows: null, frozenAt: null, source: null, migrationPending: false };
export async function loadLiveReport(db: Db, facility: string, year: number, month: number): Promise<PpbvReport> {
    const { from, to } = monthRange(year, month);
    const [shiftsRes, exemptRes] = await Promise.all([
        db.from("shifts")
            .select("planned_staff, actual_staff, date, station, shift_type")
            .eq("facility_name", facility)
            .gte("date", from)
            .lte("date", to),
        db.from("stations").select("name, ppbv_exempt").eq("facility_name", facility),
    ]);
    const shifts = (shiftsRes.error ? [] : (shiftsRes.data ?? [])) as PpbvShift[];
    const exempt = new Set<string>();
    for (const r of (exemptRes.error ? [] : (exemptRes.data ?? [])) as {
        name: string;
        ppbv_exempt?: boolean;
    }[]) {
        if (r.ppbv_exempt)
            exempt.add(r.name);
    }
    return computePpbvReport(shifts, exempt, year, month);
}
export async function loadFrozen(db: Db, facility: string, year: number, month: number): Promise<FrozenState> {
    for (const cols of [`${BASE_COLS}, ${EXTRA_COLS}`, BASE_COLS]) {
        const { data, error } = await db.from("ppbv_records")
            .select(cols)
            .eq("facility_name", facility)
            .eq("year", year)
            .eq("month", month);
        if (error) {
            if (isTableMissing(error))
                return { ...NOT_FROZEN, migrationPending: true };
            if (isColumnMissing(error))
                continue;
            return NOT_FROZEN;
        }
        const rows = (data ?? []) as unknown as PpbvRecordRow[];
        if (rows.length === 0)
            return NOT_FROZEN;
        let frozenAt: string | null = null;
        for (const r of rows) {
            const g = r.generated_at ?? null;
            if (g && (!frozenAt || g > frozenAt))
                frozenAt = g;
        }
        return { rows, frozenAt, source: rows[0]?.source ?? null, migrationPending: false };
    }
    return NOT_FROZEN;
}
export function frozenReport(state: FrozenState, year: number, month: number): PpbvReport | null {
    return state.rows ? reportFromRecordRows(state.rows, year, month) : null;
}
export async function frozenMonths(db: Db, facility: string): Promise<{
    year: number;
    month: number;
}[]> {
    const { data, error } = await db.from("ppbv_records")
        .select("year, month")
        .eq("facility_name", facility)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
    if (error)
        return [];
    const seen = new Set<string>();
    const out: {
        year: number;
        month: number;
    }[] = [];
    for (const r of (data ?? []) as {
        year: number;
        month: number;
    }[]) {
        const k = `${r.year}-${r.month}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        out.push({ year: Number(r.year), month: Number(r.month) });
    }
    return out;
}
export type FreezeResult = {
    ok: true;
    frozenAt: string;
    stations: number;
    report: PpbvReport;
} | {
    ok: false;
    reason: "already" | "migration" | "future" | "empty" | "error";
    message: string;
};
export type FreezeOptions = {
    facility: string;
    year: number;
    month: number;
    source: PpbvSource;
    userId?: string | null;
    replace?: boolean;
    now?: Date;
};
export async function freezeMonth(db: Db, opts: FreezeOptions): Promise<FreezeResult> {
    const { facility, year, month, source, userId = null, replace = false, now = new Date() } = opts;
    if (!isPastMonth(year, month, now)) {
        return { ok: false, reason: "future", message: "Nur abgeschlossene Monate können festgeschrieben werden." };
    }
    const existing = await loadFrozen(db, facility, year, month);
    if (existing.migrationPending) {
        return { ok: false, reason: "migration", message: "Migration 20260723_ppbv_records ist noch nicht eingespielt." };
    }
    if (existing.rows && !replace) {
        return { ok: false, reason: "already", message: "Dieser Monat ist bereits festgeschrieben." };
    }
    const report = await loadLiveReport(db, facility, year, month);
    if (report.stations.length === 0) {
        return { ok: false, reason: "empty", message: "Keine gewerteten Schichten in diesem Monat." };
    }
    const frozenAt = now.toISOString();
    const base = recordRowsFromReport(report, facility).map(r => ({ ...r, generated_at: frozenAt }));
    if (replace && existing.rows) {
        const { error } = await db.from("ppbv_records").delete()
            .eq("facility_name", facility).eq("year", year).eq("month", month);
        if (error)
            return { ok: false, reason: "error", message: error.message };
    }
    const attempts = [
        base.map(r => ({ ...r, source, generated_by_user_id: userId })),
        base,
    ];
    for (const rows of attempts) {
        const { error } = await db.from("ppbv_records").insert(rows);
        if (!error)
            return { ok: true, frozenAt, stations: report.stations.length, report };
        if (isTableMissing(error)) {
            return { ok: false, reason: "migration", message: "Migration 20260723_ppbv_records ist noch nicht eingespielt." };
        }
        if (error.code === "23505") {
            return { ok: false, reason: "already", message: "Dieser Monat ist bereits festgeschrieben." };
        }
        if (isColumnMissing(error))
            continue;
        return { ok: false, reason: "error", message: error.message };
    }
    return { ok: false, reason: "error", message: "Nachweis konnte nicht gespeichert werden." };
}
async function facilitiesWithNachweis(db: Db): Promise<string[]> {
    for (const cols of ["facility_name, plan", "facility_name"]) {
        const { data, error } = await db.from("facility_settings").select(cols);
        if (error) {
            if (isColumnMissing(error))
                continue;
            return [];
        }
        return ((data ?? []) as unknown as {
            facility_name: string;
            plan?: unknown;
        }[])
            .filter(r => !!r.facility_name && resolveCapabilities(r.plan ?? null).ppbv)
            .map(r => r.facility_name);
    }
    return [];
}
export async function freezePreviousMonthForAll(db: Db, today: Date, log: string[]): Promise<void> {
    const { year, month } = previousMonth(today);
    const facilities = await facilitiesWithNachweis(db);
    for (const facility of facilities) {
        try {
            const res = await freezeMonth(db, { facility, year, month, source: "automatisch", now: today });
            if (res.ok) {
                log.push(`${facility}: PPBV-Nachweis ${year}-${String(month).padStart(2, "0")} festgeschrieben (${res.stations} Einheiten)`);
            }
            else if (res.reason === "migration") {
                if (!log.some(l => l.includes("ppbv_records"))) {
                    log.push(`PPBV-Nachweis übersprungen: Migration 20260723_ppbv_records fehlt`);
                }
                return;
            }
        }
        catch (e) {
            log.push(`${facility}: PPBV-Nachweis Fehler — ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

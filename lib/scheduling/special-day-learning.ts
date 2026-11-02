import { notifyLeitung } from "@/lib/notify";
import { berlinTodayISO } from "@/lib/date";
import { resolveOccurrence, makeSpecialDayId, type SpecialDay, } from "@/lib/scheduling/special-days";
export type DailyStat = {
    date: string;
    plannedTotal: number;
    actualTotal: number;
    sickCount: number;
};
export type MonthDayAggregate = {
    monthDay: string;
    month: number;
    day: number;
    occurrences: number;
    avgGapRatio: number;
    avgSickCount: number;
};
function avg(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
export function aggregateDailyStats(daily: DailyStat[]): MonthDayAggregate[] {
    const byMonthDay = new Map<string, {
        gaps: number[];
        sick: number[];
    }>();
    for (const d of daily) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date))
            continue;
        const monthDay = d.date.slice(5);
        const gapRatio = d.plannedTotal > 0 ? Math.max(0, d.plannedTotal - d.actualTotal) / d.plannedTotal : 0;
        const entry = byMonthDay.get(monthDay) ?? { gaps: [], sick: [] };
        entry.gaps.push(gapRatio);
        entry.sick.push(d.sickCount);
        byMonthDay.set(monthDay, entry);
    }
    return [...byMonthDay.entries()].map(([monthDay, v]) => ({
        monthDay,
        month: parseInt(monthDay.slice(0, 2), 10),
        day: parseInt(monthDay.slice(3, 5), 10),
        occurrences: v.gaps.length,
        avgGapRatio: avg(v.gaps),
        avgSickCount: avg(v.sick),
    }));
}
export type LearnedCandidate = {
    monthDay: string;
    month: number;
    day: number;
    occurrences: number;
    avgGapRatio: number;
    avgSickCount: number;
    baselineGapRatio: number;
    baselineSickCount: number;
    reason: string;
};
export type DetectOptions = {
    minOccurrences?: number;
    gapRatioMultiplier?: number;
    minGapRatio?: number;
    sickMultiplier?: number;
    minSampleSize?: number;
};
export function detectAnomalousDays(aggregates: MonthDayAggregate[], opts: DetectOptions = {}): LearnedCandidate[] {
    const minOccurrences = opts.minOccurrences ?? 2;
    const gapRatioMultiplier = opts.gapRatioMultiplier ?? 1.6;
    const minGapRatio = opts.minGapRatio ?? 0.08;
    const sickMultiplier = opts.sickMultiplier ?? 1.6;
    const minSampleSize = opts.minSampleSize ?? 30;
    const eligible = aggregates.filter(a => a.occurrences >= minOccurrences);
    if (eligible.length < minSampleSize)
        return [];
    const baselineGapRatio = avg(eligible.map(a => a.avgGapRatio));
    const baselineSickCount = avg(eligible.map(a => a.avgSickCount));
    const out: LearnedCandidate[] = [];
    for (const a of eligible) {
        const gapFlag = a.avgGapRatio >= minGapRatio && a.avgGapRatio >= baselineGapRatio * gapRatioMultiplier;
        const sickFlag = baselineSickCount > 0 && a.avgSickCount >= baselineSickCount * sickMultiplier;
        if (!gapFlag && !sickFlag)
            continue;
        const reasons: string[] = [];
        if (gapFlag)
            reasons.push(`Unterbesetzung Ø ${Math.round(a.avgGapRatio * 100)}% (sonst Ø ${Math.round(baselineGapRatio * 100)}%)`);
        if (sickFlag)
            reasons.push(`Krankmeldungen Ø ${a.avgSickCount.toFixed(1)}/Tag (sonst Ø ${baselineSickCount.toFixed(1)})`);
        out.push({
            ...a,
            baselineGapRatio,
            baselineSickCount,
            reason: `${reasons.join("; ")} — beobachtet an ${a.occurrences} Tagen in der Historie`,
        });
    }
    return out.sort((x, y) => y.avgGapRatio - x.avgGapRatio);
}
function multiplierFromGapRatio(gapRatio: number): number {
    const raw = 1 + gapRatio;
    return Math.round(Math.max(1.1, Math.min(2.0, raw)) * 10) / 10;
}
function alreadyCovered(sd: SpecialDay, month: number, day: number, years: number[]): boolean {
    for (const y of years) {
        const occ = resolveOccurrence(sd, y);
        if (!occ)
            continue;
        const cursor = new Date(occ.start);
        while (cursor <= occ.end) {
            if (cursor.getUTCMonth() + 1 === month && cursor.getUTCDate() === day)
                return true;
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }
    return false;
}
export function toLearnedSpecialDays(candidates: LearnedCandidate[], existing: SpecialDay[]): SpecialDay[] {
    const nowYear = new Date().getUTCFullYear();
    const years = [nowYear - 1, nowYear, nowYear + 1];
    const out: SpecialDay[] = [];
    for (const c of candidates) {
        if (existing.some(sd => alreadyCovered(sd, c.month, c.day, years)))
            continue;
        if (out.some(sd => sd.month === c.month && sd.day === c.day))
            continue;
        const label = `${String(c.day).padStart(2, "0")}.${String(c.month).padStart(2, "0")}.`;
        out.push({
            id: makeSpecialDayId(`gelernt-${label}`, [...existing, ...out]),
            name: `Auffälliger Tag ${label}`,
            kind: "learned",
            month: c.month,
            day: c.day,
            demandMultiplier: multiplierFromGapRatio(c.avgGapRatio),
            status: "pending",
            source: "learned",
        });
    }
    return out;
}
export async function runSpecialDayLearning(admin: any, facilityName: string, log: string[], opts?: {
    yearsBack?: number;
}): Promise<void> {
    try {
        const monthKey = berlinTodayISO().slice(0, 7);
        const { data: settingsRow, error: settingsErr } = await admin
            .from("facility_settings")
            .select("special_days, special_days_learned_month")
            .eq("facility_name", facilityName)
            .maybeSingle();
        if (settingsErr) {
            log.push(`${facilityName}: Sondertage-Lernlauf übersprungen (${settingsErr.message})`);
            return;
        }
        if (settingsRow?.special_days_learned_month === monthKey)
            return;
        const yearsBack = opts?.yearsBack ?? 3;
        const since = new Date();
        since.setUTCFullYear(since.getUTCFullYear() - yearsBack);
        const sinceISO = berlinTodayISO(since);
        const todayISO = berlinTodayISO();
        const [shiftsRes, sickRes] = await Promise.all([
            admin.from("shifts")
                .select("date, planned_staff, actual_staff")
                .eq("facility_name", facilityName)
                .gte("date", sinceISO)
                .lt("date", todayISO),
            admin.from("sick_reports")
                .select("sick_date")
                .eq("facility_name", facilityName)
                .gte("sick_date", sinceISO),
        ]);
        if (shiftsRes.error) {
            log.push(`${facilityName}: Sondertage-Lernlauf übersprungen (${shiftsRes.error.message})`);
            return;
        }
        const byDate = new Map<string, {
            planned: number;
            actual: number;
        }>();
        for (const s of (shiftsRes.data ?? []) as {
            date: string;
            planned_staff: number | null;
            actual_staff: number | null;
        }[]) {
            const e = byDate.get(s.date) ?? { planned: 0, actual: 0 };
            e.planned += s.planned_staff ?? 0;
            e.actual += s.actual_staff ?? 0;
            byDate.set(s.date, e);
        }
        const sickByDate = new Map<string, number>();
        if (!sickRes.error) {
            for (const r of (sickRes.data ?? []) as {
                sick_date: string;
            }[]) {
                sickByDate.set(r.sick_date, (sickByDate.get(r.sick_date) ?? 0) + 1);
            }
        }
        const daily: DailyStat[] = [...byDate.entries()].map(([date, v]) => ({
            date, plannedTotal: v.planned, actualTotal: v.actual, sickCount: sickByDate.get(date) ?? 0,
        }));
        const aggregates = aggregateDailyStats(daily);
        const candidates = detectAnomalousDays(aggregates);
        const existing: SpecialDay[] = Array.isArray(settingsRow?.special_days) ? settingsRow.special_days : [];
        const learned = toLearnedSpecialDays(candidates, existing);
        const update: Record<string, unknown> = { special_days_learned_month: monthKey };
        if (learned.length > 0)
            update.special_days = [...existing, ...learned];
        const { error: updErr } = await admin.from("facility_settings").update(update).eq("facility_name", facilityName);
        if (updErr) {
            log.push(`${facilityName}: Sondertage-Lernlauf konnte Ergebnis nicht speichern (${updErr.message})`);
            return;
        }
        if (learned.length > 0) {
            log.push(`${facilityName}: ${learned.length} gelernte(r) Sondertag(e) als Vorschlag (pending) angelegt`);
            await notifyLeitung(admin, facilityName, "Neue Sondertag-Vorschläge", `${learned.length} auffällige Kalendertag(e) erkannt (Unterbesetzung/Krankmeldungen) — in den Einstellungen unter Sondertage prüfen und bestätigen.`);
        }
        else {
            log.push(`${facilityName}: Sondertage-Lernlauf ohne Auffälligkeiten`);
        }
    }
    catch (e) {
        log.push(`${facilityName}: Sondertage-Lernlauf übersprungen (${e instanceof Error ? e.message : String(e)})`);
    }
}

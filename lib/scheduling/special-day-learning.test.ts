import { describe, it, expect } from "vitest";
import { aggregateDailyStats, detectAnomalousDays, toLearnedSpecialDays, type DailyStat } from "./special-day-learning";
import type { SpecialDay } from "./special-days";
import { utcTagISO } from "@/lib/date";
function buildHistory(): DailyStat[] {
    const days: DailyStat[] = [];
    const years = [2023, 2024, 2025];
    for (const year of years) {
        for (let doy = 1; doy <= 70; doy++) {
            const d = new Date(Date.UTC(year, 0, doy));
            const date = utcTagISO(d);
            const isAnomaly = d.getUTCMonth() === 2 && d.getUTCDate() === 5;
            days.push({
                date,
                plannedTotal: 10,
                actualTotal: isAnomaly ? 6 : 9,
                sickCount: isAnomaly ? 4 : 1,
            });
        }
    }
    return days;
}
describe("aggregateDailyStats", () => {
    it("gruppiert je Monat+Tag über mehrere Jahre und mittelt", () => {
        const daily: DailyStat[] = [
            { date: "2024-03-05", plannedTotal: 10, actualTotal: 6, sickCount: 4 },
            { date: "2025-03-05", plannedTotal: 10, actualTotal: 6, sickCount: 4 },
            { date: "2024-03-06", plannedTotal: 10, actualTotal: 9, sickCount: 1 },
        ];
        const agg = aggregateDailyStats(daily);
        const march5 = agg.find(a => a.monthDay === "03-05")!;
        expect(march5.occurrences).toBe(2);
        expect(march5.avgGapRatio).toBeCloseTo(0.4, 5);
        expect(march5.avgSickCount).toBe(4);
        const march6 = agg.find(a => a.monthDay === "03-06")!;
        expect(march6.occurrences).toBe(1);
        expect(march6.avgGapRatio).toBeCloseTo(0.1, 5);
    });
    it("ignoriert Zeilen mit ungültigem Datumsformat", () => {
        const daily: DailyStat[] = [{ date: "not-a-date", plannedTotal: 5, actualTotal: 5, sickCount: 0 }];
        expect(aggregateDailyStats(daily)).toEqual([]);
    });
    it("planned=0 ergibt gapRatio 0 (kein Bedarf, keine Lücke)", () => {
        const daily: DailyStat[] = [{ date: "2024-01-01", plannedTotal: 0, actualTotal: 0, sickCount: 0 }];
        expect(aggregateDailyStats(daily)[0].avgGapRatio).toBe(0);
    });
});
describe("detectAnomalousDays", () => {
    it("erkennt den auffälligen Kalendertag (05.03.) aus einer mehrjährigen Historie", () => {
        const agg = aggregateDailyStats(buildHistory());
        const candidates = detectAnomalousDays(agg);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0].monthDay).toBe("03-05");
        expect(candidates[0].occurrences).toBe(3);
        expect(candidates[0].reason).toContain("Unterbesetzung");
    });
    it("markiert NICHTS, wenn kein Tag deutlich vom Durchschnitt abweicht", () => {
        const daily: DailyStat[] = [];
        for (const year of [2023, 2024, 2025]) {
            for (let doy = 1; doy <= 40; doy++) {
                const date = utcTagISO(Date.UTC(year, 0, doy));
                daily.push({ date, plannedTotal: 10, actualTotal: 9, sickCount: 1 });
            }
        }
        expect(detectAnomalousDays(aggregateDailyStats(daily))).toEqual([]);
    });
    it("ignoriert einen Einzelausreißer, der nur in EINEM Jahr auftrat (minOccurrences)", () => {
        const daily: DailyStat[] = [];
        for (const year of [2023, 2024, 2025]) {
            for (let doy = 1; doy <= 40; doy++) {
                const d = new Date(Date.UTC(year, 0, doy));
                const date = utcTagISO(d);
                const isOneOffAnomaly = year === 2025 && d.getUTCMonth() === 2 && d.getUTCDate() === 5;
                daily.push({ date, plannedTotal: 10, actualTotal: isOneOffAnomaly ? 4 : 9, sickCount: isOneOffAnomaly ? 5 : 1 });
            }
        }
        expect(detectAnomalousDays(aggregateDailyStats(daily))).toEqual([]);
    });
    it("verlangt eine Mindest-Datenbasis (minSampleSize), bevor überhaupt verglichen wird", () => {
        const daily: DailyStat[] = [
            { date: "2024-03-05", plannedTotal: 10, actualTotal: 2, sickCount: 9 },
            { date: "2025-03-05", plannedTotal: 10, actualTotal: 2, sickCount: 9 },
        ];
        expect(detectAnomalousDays(aggregateDailyStats(daily))).toEqual([]);
    });
});
describe("toLearnedSpecialDays", () => {
    it("erzeugt kind=learned/status=pending/source=learned mit plausiblem Multiplikator", () => {
        const agg = aggregateDailyStats(buildHistory());
        const candidates = detectAnomalousDays(agg);
        const learned = toLearnedSpecialDays(candidates, []);
        expect(learned.length).toBe(1);
        const entry = learned[0];
        expect(entry.kind).toBe("learned");
        expect(entry.status).toBe("pending");
        expect(entry.source).toBe("learned");
        expect(entry.month).toBe(3);
        expect(entry.day).toBe(5);
        expect(entry.demandMultiplier).toBeGreaterThan(1);
        expect(entry.demandMultiplier).toBeLessThanOrEqual(2.0);
    });
    it("schlägt einen Kalendertag NICHT erneut vor, wenn er schon durch einen bestehenden Sondertag abgedeckt ist", () => {
        const agg = aggregateDailyStats(buildHistory());
        const candidates = detectAnomalousDays(agg);
        const existing: SpecialDay[] = [
            { id: "existing", name: "Bestehender Eintrag 05.03.", kind: "fixed", month: 3, day: 5, demandMultiplier: 1.2, status: "active", source: "leitung" },
        ];
        expect(toLearnedSpecialDays(candidates, existing)).toEqual([]);
    });
});

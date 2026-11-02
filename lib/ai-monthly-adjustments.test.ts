import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardAssignment, GuardShift } from "@/lib/ai-guardrails";
type MockOpts = {
    system?: string;
    messages: {
        content: string;
    }[];
};
type MockResult = {
    data: unknown;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
};
const gesendeteSysteme: string[] = [];
const gesendetePrompts: string[] = [];
let aiStructuredMock: (opts: MockOpts) => Promise<MockResult>;
vi.mock("@/lib/ai", () => ({
    isAiConfigured: () => true,
    aiProvider: () => "anthropic",
    aiModel: () => "claude-opus-5",
    aiComplete: vi.fn(),
    aiStructured: (opts: MockOpts) => aiStructuredMock(opts),
}));
import { MAX_KANDIDATEN_MONAT, baselineFuerSonderTage, berechneBurnoutScore, burnoutEinstufungVon, kiMonatsplanungAktiv, kiMonatsplanungGlobalAktiv, loeseSonderTageAuf, planMonthlyAdjustments, pseudonymisiereKandidaten, type RealKandidat, type SpecialDay, } from "@/lib/ai-monthly-adjustments";
const SILVESTER: SpecialDay = {
    id: "sd-silvester", name: "Silvester", kind: "fixed",
    date: "2026-12-31", demandMultiplier: 1.5, status: "active", source: "seed",
};
const SHIFT: GuardShift = {
    id: "S-SPAET-1", date: "2026-12-31", shift_type: "spaet", station: "Station 1",
    start_time: "14:00", end_time: "22:00", benoetigteQualifikation: "examiniert", sollBesetzung: 2,
};
const H = 60;
function baueStaff(): RealKandidat[] {
    return [
        {
            id: "P-A", name: "Anna Aigner", qualifikationen: ["examiniert"],
            verplanteMinutenWoche: 5 * H, vertragsMinutenWoche: 38.5 * H,
            burnoutScore: 10, nachtdiensteLetzte28Tage: 0,
        },
        {
            id: "P-D", name: "Dirk Dorn", qualifikationen: ["pflegehelfer"],
            verplanteMinutenWoche: 5 * H, vertragsMinutenWoche: 38.5 * H,
            burnoutScore: 20, nachtdiensteLetzte28Tage: 0,
        },
        {
            id: "P-ABW", name: "Abby Abwesend", qualifikationen: ["examiniert"],
            verplanteMinutenWoche: 0, vertragsMinutenWoche: 38.5 * H,
            burnoutScore: 5, nachtdiensteLetzte28Tage: 0,
            abwesend: true, abwesenheitsgrund: "Urlaub",
        },
    ];
}
const BESTEHEND: GuardAssignment[] = [{ shiftId: "S-SPAET-1", staffId: "P-EXIST" }];
beforeEach(() => {
    gesendeteSysteme.length = 0;
    gesendetePrompts.length = 0;
    aiStructuredMock = vi.fn(async (opts: {
        system?: string;
        messages: {
            content: string;
        }[];
    }) => {
        const system = opts.system ?? "";
        gesendeteSysteme.push(system);
        for (const m of opts.messages)
            gesendetePrompts.push(m.content);
        throw new Error("Kein Mock-Fall für diesen Testfall definiert.");
    });
});
afterEach(() => {
    vi.unstubAllEnvs();
});
describe("Kill-Switches", () => {
    it("global: ungesetzt = aus", () => {
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "");
        expect(kiMonatsplanungGlobalAktiv()).toBe(false);
    });
    it("global: 'false' = aus", () => {
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "false");
        expect(kiMonatsplanungGlobalAktiv()).toBe(false);
    });
    it("global: nur exaktes 'true' = an", () => {
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "true");
        expect(kiMonatsplanungGlobalAktiv()).toBe(true);
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "TRUE");
        expect(kiMonatsplanungGlobalAktiv()).toBe(true);
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "1");
        expect(kiMonatsplanungGlobalAktiv()).toBe(false);
    });
    it("beide Schalter müssen an sein — jede Kombination mit mindestens einem AUS ergibt AUS", () => {
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "false");
        expect(kiMonatsplanungAktiv({ ai_monthly_planning_enabled: true })).toBe(false);
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "true");
        expect(kiMonatsplanungAktiv({ ai_monthly_planning_enabled: false })).toBe(false);
        expect(kiMonatsplanungAktiv(null)).toBe(false);
        expect(kiMonatsplanungAktiv(undefined)).toBe(false);
        expect(kiMonatsplanungAktiv({})).toBe(false);
    });
    it("beide Schalter an → aktiv", () => {
        vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "true");
        expect(kiMonatsplanungAktiv({ ai_monthly_planning_enabled: true })).toBe(true);
    });
});
describe("loeseSonderTageAuf", () => {
    it("exaktes Datum innerhalb des Zeitraums", () => {
        const r = loeseSonderTageAuf([SILVESTER], "2026-12-01", "2026-12-31");
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ id: "sd-silvester", date: "2026-12-31", demandMultiplier: 1.5 });
    });
    it("exaktes Datum außerhalb des Zeitraums wird nicht geliefert", () => {
        expect(loeseSonderTageAuf([SILVESTER], "2027-01-01", "2027-01-31")).toEqual([]);
    });
    it("wiederkehrend über month/day, über mehrere Jahre aufgelöst", () => {
        const r = loeseSonderTageAuf([{ id: "sd-nk", name: "Neujahr", kind: "fixed", month: 1, day: 1, demandMultiplier: 1.2, status: "active", source: "seed" }], "2026-01-01", "2028-12-31");
        expect(r.map(x => x.date)).toEqual(["2026-01-01", "2027-01-01", "2028-01-01"]);
    });
    it("wiederkehrend über easterOffsetDays (Rosenmontag = Ostersonntag - 48 Tage)", () => {
        const r = loeseSonderTageAuf([{ id: "sd-rm", name: "Rosenmontag", kind: "computed", easterOffsetDays: -48, demandMultiplier: 1.3, status: "active", source: "seed" }], "2026-01-01", "2026-12-31");
        expect(r).toHaveLength(1);
        expect(r[0].date).toBe("2026-02-16");
    });
    it("status 'pending' (gelernter, noch nicht bestätigter Vorschlag) wird ignoriert", () => {
        const pending = loeseSonderTageAuf([{ ...SILVESTER, status: "pending" }], "2026-12-01", "2026-12-31");
        expect(pending).toEqual([]);
    });
    it("mehrtägiger Sondertag (dateRangeDays, z.B. Oktoberfest) wird an jedem Tag im Bereich geliefert", () => {
        const oktoberfest: SpecialDay = {
            id: "sd-of", name: "Oktoberfest", kind: "regional",
            bundeslaender: ["Bayern"], month: 9, day: 20, dateRangeDays: 3,
            demandMultiplier: 1.3, status: "active", source: "seed",
        };
        const r = loeseSonderTageAuf([oktoberfest], "2026-09-01", "2026-09-30", "Bayern");
        expect(r.map(x => x.date)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    });
    it("ohne special_days-Spalte (undefined/null) → leere Liste, kein Crash", () => {
        expect(loeseSonderTageAuf(undefined, "2026-12-01", "2026-12-31")).toEqual([]);
        expect(loeseSonderTageAuf(null, "2026-12-01", "2026-12-31")).toEqual([]);
    });
    it("bundeslaender-Filter", () => {
        const sd: SpecialDay = { ...SILVESTER, bundeslaender: ["NW", "BY"] };
        expect(loeseSonderTageAuf([sd], "2026-12-01", "2026-12-31", "BE")).toEqual([]);
        expect(loeseSonderTageAuf([sd], "2026-12-01", "2026-12-31", "NW")).toHaveLength(1);
    });
});
describe("baselineFuerSonderTage", () => {
    it("aggregiert nur Schichten an Sondertagen — soll ist bereits das (ggf. von applySpecialDayDemand hochgesetzte) planned_staff, wird hier NICHT erneut multipliziert", () => {
        const nichtSonderTag: GuardShift = { ...SHIFT, id: "S-NORMAL", date: "2026-12-15" };
        const rows = baselineFuerSonderTage([SHIFT, nichtSonderTag], BESTEHEND, loeseSonderTageAuf([SILVESTER], "2026-12-01", "2026-12-31"));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ datum: "2026-12-31", soll: 2, ist: 1, offen: 1 });
        expect(rows[0]).not.toHaveProperty("empfohlenSoll");
    });
    it("keine Sondertage → leere Baseline", () => {
        expect(baselineFuerSonderTage([SHIFT], BESTEHEND, [])).toEqual([]);
    });
});
describe("berechneBurnoutScore", () => {
    it("Nachtschichten × 10 + Wochenendschichten × 5 + Feiertagsschichten × 15", () => {
        const r = berechneBurnoutScore([
            { date: "2026-08-17", shift_type: "nacht" },
            { date: "2026-08-15", shift_type: "frueh" },
            { date: "2026-12-25", shift_type: "frueh" },
        ]);
        expect(r.score).toBe(30);
        expect(r.naechte).toBe(1);
    });
    it("Einstufung folgt den Schwellwerten aus Kapitel 17", () => {
        expect(burnoutEinstufungVon(0)).toBe("unauffaellig");
        expect(burnoutEinstufungVon(29)).toBe("unauffaellig");
        expect(burnoutEinstufungVon(30)).toBe("erhoeht");
        expect(burnoutEinstufungVon(59)).toBe("erhoeht");
        expect(burnoutEinstufungVon(60)).toBe("kritisch");
    });
});
describe("pseudonymisiereKandidaten", () => {
    it("abwesende Personen werden GAR NICHT übermittelt", () => {
        const { kandidaten, mapping } = pseudonymisiereKandidaten(baueStaff());
        expect(kandidaten.some(k => mapping.get(k.pseudoId)?.id === "P-ABW")).toBe(false);
        expect(kandidaten).toHaveLength(2);
    });
    it("kein echter Name oder echte ID im pseudonymisierten Objekt", () => {
        const { kandidaten } = pseudonymisiereKandidaten(baueStaff());
        const json = JSON.stringify(kandidaten);
        expect(json).not.toContain("Anna");
        expect(json).not.toContain("Aigner");
        expect(json).not.toContain("P-A");
        expect(json).not.toContain("P-D");
    });
    it("niedrigerer Burnout-Score kommt zuerst (MA-1)", () => {
        const { kandidaten, mapping } = pseudonymisiereKandidaten(baueStaff());
        expect(mapping.get(kandidaten[0].pseudoId)?.id).toBe("P-A");
    });
    it("kappt auf MAX_KANDIDATEN_MONAT", () => {
        const viele: RealKandidat[] = Array.from({ length: MAX_KANDIDATEN_MONAT + 10 }, (_, i) => ({
            id: `P-${i}`, name: `Person ${i}`, qualifikationen: ["examiniert"],
            verplanteMinutenWoche: 0, vertragsMinutenWoche: 38.5 * H,
            burnoutScore: i, nachtdiensteLetzte28Tage: 0,
        }));
        const { kandidaten } = pseudonymisiereKandidaten(viele);
        expect(kandidaten).toHaveLength(MAX_KANDIDATEN_MONAT);
    });
});
const GRUNDLAUF = () => planMonthlyAdjustments({
    von: "2026-12-01", bis: "2026-12-31",
    shifts: [SHIFT], staff: baueStaff(), bestehend: BESTEHEND,
    specialDays: [SILVESTER],
});
describe("planMonthlyAdjustments — Gate ohne aktiven Sondertag", () => {
    it("liefert null und ruft die KI NIE auf, wenn kein Sondertag im Zeitraum liegt", async () => {
        const r = await planMonthlyAdjustments({
            von: "2027-01-01", bis: "2027-01-31",
            shifts: [SHIFT], staff: baueStaff(), bestehend: BESTEHEND,
            specialDays: [SILVESTER],
        });
        expect(r).toBeNull();
        expect(aiStructuredMock).not.toHaveBeenCalled();
    });
    it("liefert null ohne special_days (Spalte evtl. noch nicht migriert)", async () => {
        const r = await planMonthlyAdjustments({
            von: "2026-12-01", bis: "2026-12-31",
            shifts: [SHIFT], staff: baueStaff(), bestehend: BESTEHEND,
            specialDays: undefined,
        });
        expect(r).toBeNull();
        expect(aiStructuredMock).not.toHaveBeenCalled();
    });
});
describe("planMonthlyAdjustments — Regel-Layer je einzelner Änderung", () => {
    it("eine gültige und eine regelwidrige Änderung im selben Lauf: nur die gültige besteht sofort, die andere löst genau eine Korrekturrunde aus", async () => {
        aiStructuredMock = vi.fn(async (opts: {
            system?: string;
            messages: {
                content: string;
            }[];
        }) => {
            const system = opts.system ?? "";
            gesendeteSysteme.push(system);
            for (const m of opts.messages)
                gesendetePrompts.push(m.content);
            const rundenNr = gesendeteSysteme.filter(s => s.includes("KI-Anpassungsschicht")).length;
            if (rundenNr === 1) {
                return {
                    data: {
                        anpassungen: [
                            { shiftId: "D001", staffId: "MA-1", ersetztStaffId: null, begruendung: "Niedriger Burnout-Score, viel frei." },
                            { shiftId: "D001", staffId: "MA-2", ersetztStaffId: null, begruendung: "Fälschlich vorgeschlagen, keine Qualifikation." },
                        ],
                        zusammenfassung: "Zwei Vorschläge für Silvester.",
                    },
                    usage: { inputTokens: 20, outputTokens: 10 },
                };
            }
            return {
                data: { anpassungen: [], zusammenfassung: "Keine weitere zulässige Anpassung gefunden." },
                usage: { inputTokens: 8, outputTokens: 4 },
            };
        });
        const r = await GRUNDLAUF();
        expect(r).not.toBeNull();
        expect(r!.vorschlaege).toHaveLength(1);
        expect(r!.vorschlaege[0].staffId).toBe("P-A");
        expect(r!.vorschlaege[0].staffName).toBe("Anna Aigner");
        expect(r!.verworfen).toBe(1);
        expect(r!.korrekturrunden).toBe(1);
        const anzahlRunden = gesendeteSysteme.filter(s => s.includes("KI-Anpassungsschicht")).length;
        expect(anzahlRunden).toBe(2);
    });
    it("nach der einen Korrekturrunde bleibt ein weiterhin regelwidriger Vorschlag verworfen, nicht stillschweigend übernommen", async () => {
        aiStructuredMock = vi.fn(async (opts: {
            system?: string;
            messages: {
                content: string;
            }[];
        }) => {
            gesendeteSysteme.push(opts.system ?? "");
            for (const m of opts.messages)
                gesendetePrompts.push(m.content);
            return {
                data: {
                    anpassungen: [{ shiftId: "D001", staffId: "MA-2", ersetztStaffId: null, begruendung: "Hartnäckig falsch." }],
                    zusammenfassung: "Beharrt auf der falschen Person.",
                },
                usage: { inputTokens: 10, outputTokens: 5 },
            };
        });
        const r = await GRUNDLAUF();
        expect(r).not.toBeNull();
        expect(r!.vorschlaege).toEqual([]);
        expect(r!.verworfen).toBe(1);
        expect(r!.korrekturrunden).toBe(1);
    });
    it("keine Vorschläge nötig → leeres Ergebnis, keine Korrekturrunde", async () => {
        aiStructuredMock = vi.fn(async (opts: {
            system?: string;
            messages: {
                content: string;
            }[];
        }) => {
            gesendeteSysteme.push(opts.system ?? "");
            return { data: { anpassungen: [], zusammenfassung: "Keine Anpassung nötig." }, usage: { inputTokens: 5, outputTokens: 3 } };
        });
        const r = await GRUNDLAUF();
        expect(r!.vorschlaege).toEqual([]);
        expect(r!.verworfen).toBe(0);
        expect(r!.korrekturrunden).toBe(0);
    });
});
describe("planMonthlyAdjustments — Datenminimierung bleibt über die Korrekturrunde hinweg bestehen", () => {
    it("kein echter Name/keine echte ID in irgendeiner an die KI gesendeten Nachricht — auch nicht im Korrektur-Prompt", async () => {
        aiStructuredMock = vi.fn(async (opts: {
            system?: string;
            messages: {
                content: string;
            }[];
        }) => {
            gesendeteSysteme.push(opts.system ?? "");
            for (const m of opts.messages)
                gesendetePrompts.push(m.content);
            const rundenNr = gesendeteSysteme.length;
            if (rundenNr === 1) {
                return {
                    data: {
                        anpassungen: [{ shiftId: "D001", staffId: "MA-2", ersetztStaffId: null, begruendung: "x" }],
                        zusammenfassung: "x",
                    },
                    usage: { inputTokens: 1, outputTokens: 1 },
                };
            }
            return { data: { anpassungen: [], zusammenfassung: "x" }, usage: { inputTokens: 1, outputTokens: 1 } };
        });
        await GRUNDLAUF();
        const gesamterText = gesendetePrompts.join("\n");
        expect(gesamterText).not.toContain("Anna");
        expect(gesamterText).not.toContain("Aigner");
        expect(gesamterText).not.toContain("Dirk");
        expect(gesamterText).not.toContain("Dorn");
        expect(gesamterText).not.toContain("Abwesend");
        expect(gesamterText).not.toContain("Urlaub");
        expect(gesamterText).not.toContain("P-A");
        expect(gesamterText).not.toContain("P-D");
        expect(gesamterText).not.toContain("P-ABW");
        expect(gesamterText).not.toContain("S-SPAET-1");
        expect(gesamterText).not.toContain("Station 1");
        expect(gesamterText).not.toContain("Silvester");
        expect(gesamterText).not.toContain("examiniert");
        expect(gesamterText).not.toContain("pflegehelfer");
    });
    it("die Baseline nennt jede Schicht mit Kürzel — sonst kann das Modell keine shiftId zurückgeben", async () => {
        aiStructuredMock = vi.fn(async (opts: {
            system?: string;
            messages: {
                content: string;
            }[];
        }) => {
            for (const m of opts.messages)
                gesendetePrompts.push(m.content);
            return { data: { anpassungen: [], zusammenfassung: "x" }, usage: { inputTokens: 1, outputTokens: 1 } };
        });
        await GRUNDLAUF();
        expect(gesendetePrompts[0]).toMatch(/shiftId=D001 \| 2026-12-31 \(T01\) \| S01 spaet/);
    });
});
describe("planMonthlyAdjustments — Ausgabe trägt maschinenlesbare KI-Kennzeichnung", () => {
    it("ai_generated + Provider/Modell sind gesetzt (Art. 50 EU-KI-VO)", async () => {
        aiStructuredMock = vi.fn(async () => ({
            data: { anpassungen: [], zusammenfassung: "x" }, usage: { inputTokens: 1, outputTokens: 1 },
        }));
        const r = await GRUNDLAUF();
        expect(r!.ai.ai_generated).toBe(true);
        expect(r!.ai.ai_provider).toBe("anthropic");
        expect(r!.uebermittelt.kandidaten).toBeGreaterThan(0);
        expect(r!.uebermittelt.schichten).toBeGreaterThan(0);
    });
});

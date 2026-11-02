// Beweist die zentrale Sicherheitsanforderung aus dem Auftrag "KI-Anpassungsschicht für
// Sondertage": bei ausgeschalteten Kill-Switches (Standard in Tests/CI — KI_MONTHLY_PLANNING_
// ENABLED ist nicht gesetzt) darf sich am bestehenden Verhalten von POST /api/leitung/
// generate-plan NICHTS ändern. Kein zusätzliches Antwortfeld, kein Aufruf der KI, kein
// zusätzlicher Protokoll-Insert — exakt derselbe Rückgabewert wie vor dieser Änderung
// (`runSchedulingAlgorithm`-Ergebnis, ggf. `fromCache`), sonst nichts.
//
// lib/scheduling/generate-plan-core.ts (der eigentliche Monats-Generator) wird von diesem
// Auftrag NICHT verändert — das ist über generate-plan-core.test.ts bereits abgesichert. Dieser
// Test beweist die Kill-Switch-Eigenschaft der NEUEN Schicht obendrauf.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* ────────────────────────────────────────────────────────────────────────────
   Generischer Fake-Supabase-Client: jede Kette (.from().select().eq()…) ist über einen
   Proxy "then"-bar und liefert ein pro Tabelle konfigurierbares Ergebnis. Deckt die vielen
   verschiedenen Aufrufmuster in generate-plan/route.ts ab, ohne jede Kette einzeln nachbauen
   zu müssen.
   ──────────────────────────────────────────────────────────────────────────── */

type FakeResult = { data?: unknown; error?: unknown; count?: number };

function chain(result: FakeResult): unknown {
  const target = () => {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      // Echtes Promise-`.then` zurückgeben (nicht nur synchron `resolve(result)` aufrufen) —
      // sonst bricht Chaining wie `.insert(...).then(a).then(b)` (verwendet für
      // Fire-and-forget-Logging), weil der Rückgabewert einer synchronen Ausführung kein
      // weiteres `.then` mehr hat.
      if (prop === "then") return (onFulfilled?: (v: FakeResult) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected);
      if (prop === "catch") return (onRejected?: (e: unknown) => unknown) => Promise.resolve(result).catch(onRejected);
      if (prop === "finally") return (fn?: () => void) => Promise.resolve(result).finally(fn);
      return (..._args: unknown[]) => proxy;
    },
  });
  return proxy;
}

const aufgerufeneTabellen: string[] = [];

function baueFakeAdmin(byTable: Record<string, FakeResult>) {
  return {
    from: (table: string) => {
      aufgerufeneTabellen.push(table);
      return chain(byTable[table] ?? { data: [], error: null, count: 0 });
    },
    // Die Ratenbegrenzung ruft seit dem 20.09.2026 `rate_limit_pruefen()` per rpc auf
    // (lib/rate-limit.ts). Fehlt `rpc` hier, wirft der Ersatz-Client — und die Route
    // scheitert an einer Stelle, mit der dieser Test nichts zu tun hat. Immer erlauben:
    // geprüft wird hier der KI-Kill-Switch, nicht die Sperre.
    rpc: async () => ({ data: { erlaubt: true, anzahl: 1 }, error: null }),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Mocks
   ──────────────────────────────────────────────────────────────────────────── */

let fakeAdmin: ReturnType<typeof baueFakeAdmin>;
const aiStructuredMock = vi.fn();

vi.mock("@/lib/admin-client", () => ({
  admin: () => fakeAdmin,
}));

vi.mock("@/lib/leitung-auth", () => ({
  resolveLeitung: async () => ({
    facilityName: "Test-Einrichtung", createdBy: "Leitung Test", leitungName: "Leitung Test",
    name: "Leitung Test", userId: "u-leitung-1", role: "leitung", isDemo: false,
  }),
}));

vi.mock("@/lib/server-cache", () => ({
  writePlanCache: vi.fn(),
  readPlanCache: vi.fn(() => null),
}));

vi.mock("@/lib/ai", () => ({
  isAiConfigured: () => true,
  aiProvider: () => "anthropic",
  aiModel: () => "claude-opus-5",
  aiComplete: vi.fn(),
  aiStructured: aiStructuredMock,
}));

describe("POST /api/leitung/generate-plan — Kill-Switch aus ändert nichts", () => {
  // Die Route einmal vorab laden, mit eigener Frist: Der Import zieht den ganzen Planer
  // nach sich, und in der vollen Suite lief der ERSTE Test damit unter Last gelegentlich in
  // die 5-s-Grenze (20./21.10.2026). Danach kommt sie aus dem Cache; die Mocks oben gelten
  // schon, weil vi.mock vor jeden Import gehoben wird.
  beforeAll(async () => { await import("@/app/api/leitung/generate-plan/route"); }, 30_000);

  beforeEach(() => {
    vi.unstubAllEnvs();
    aufgerufeneTabellen.length = 0;
    aiStructuredMock.mockReset();
    fakeAdmin = baueFakeAdmin({
      facility_settings: {
        data: {
          facility_name: "Test-Einrichtung",
          ai_monthly_planning_enabled: false, // Standard AUS, wie in jeder echten Einrichtung ohne bewusste Freischaltung
          special_days: [
            { id: "sd-1", name: "Silvester", kind: "fixed" as const, date: "2026-12-31", demandMultiplier: 1.5, status: "active" as const, source: "seed" as const },
          ],
          pause_threshold_minutes: 20,
          overtime_limit_pct: 20,
          schedule_springer_enabled: false,
        },
        error: null,
      },
      shifts: {
        data: [
          { id: "S1", station: "Station 1", date: "2026-12-31", shift_type: "spaet", planned_staff: 2, start_time: "14:00", end_time: "22:00" },
        ],
        error: null,
      },
      facility_staff: {
        data: [{ id: "F1", full_name: "Anna Aigner", active: true, max_hours_per_week: 38.5, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15, role: "examiniert" }],
        error: null,
      },
    });
  });

  it("ohne KI_MONTHLY_PLANNING_ENABLED (CI-Standard) enthält die Antwort KEIN kiAnpassungen-Feld", async () => {
    // Explizit sicherstellen, dass die Variable in diesem Testlauf nicht gesetzt ist —
    // genau der Zustand, den jede bestehende Einrichtung heute hat.
    delete process.env.KI_MONTHLY_PLANNING_ENABLED;

    const { POST } = await import("@/app/api/leitung/generate-plan/route");
    const req = new NextRequest("http://localhost/api/leitung/generate-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week_start: "2026-12-01", week_end: "2026-12-31" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).not.toHaveProperty("kiAnpassungen");
    // Das reguläre Ergebnis bleibt unverändert vorhanden — die Schicht kommt nur ergänzend hinzu, nie ersetzend.
    expect(json).toHaveProperty("assignments");
    expect(json).toHaveProperty("stats");
  });

  it("selbst wenn die Einrichtung ai_monthly_planning_enabled=true gesetzt hat, bleibt es ohne den globalen Schalter aus", async () => {
    delete process.env.KI_MONTHLY_PLANNING_ENABLED;
    fakeAdmin = baueFakeAdmin({
      facility_settings: {
        data: {
          facility_name: "Test-Einrichtung",
          ai_monthly_planning_enabled: true, // Einrichtung HAT den zweiten Schalter aktiviert …
          special_days: [{ id: "sd-1", name: "Silvester", kind: "fixed" as const, date: "2026-12-31", demandMultiplier: 1.5, status: "active" as const, source: "seed" as const }],
          pause_threshold_minutes: 20, overtime_limit_pct: 20, schedule_springer_enabled: false,
        },
        error: null,
      },
      shifts: { data: [{ id: "S1", station: "Station 1", date: "2026-12-31", shift_type: "spaet", planned_staff: 2, start_time: "14:00", end_time: "22:00" }], error: null },
      facility_staff: { data: [{ id: "F1", full_name: "Anna Aigner", active: true, max_hours_per_week: 38.5, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15, role: "examiniert" }], error: null },
    });

    const { POST } = await import("@/app/api/leitung/generate-plan/route");
    const req = new NextRequest("http://localhost/api/leitung/generate-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week_start: "2026-12-01", week_end: "2026-12-31" }),
    });
    const res = await POST(req);
    const json = await res.json();

    // … aber OHNE den globalen Server-Schalter bleibt die ganze Schicht inaktiv (Aufgabe 0:
    // "beide Schalter müssen erfüllt sein").
    expect(json).not.toHaveProperty("kiAnpassungen");
    expect(aiStructuredMock).not.toHaveBeenCalled();
    expect(aufgerufeneTabellen).not.toContain("ki_monthly_adjustment_runs");
  });

  it("mit BEIDEN Schaltern an UND einem aktiven Sondertag im Zeitraum wird die KI tatsächlich aufgerufen — Gegenprobe, dass der Test oben wirklich etwas beweist", async () => {
    vi.stubEnv("KI_MONTHLY_PLANNING_ENABLED", "true");
    aiStructuredMock.mockResolvedValue({
      data: { anpassungen: [], zusammenfassung: "Keine Anpassung nötig." },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    fakeAdmin = baueFakeAdmin({
      facility_settings: {
        data: {
          facility_name: "Test-Einrichtung",
          ai_monthly_planning_enabled: true,
          special_days: [{ id: "sd-1", name: "Silvester", kind: "fixed" as const, date: "2026-12-31", demandMultiplier: 1.5, status: "active" as const, source: "seed" as const }],
          pause_threshold_minutes: 20, overtime_limit_pct: 20, schedule_springer_enabled: false,
        },
        error: null,
      },
      shifts: { data: [{ id: "S1", station: "Station 1", date: "2026-12-31", shift_type: "spaet", planned_staff: 2, start_time: "14:00", end_time: "22:00" }], error: null },
      facility_staff: { data: [{ id: "F1", full_name: "Anna Aigner", active: true, max_hours_per_week: 38.5, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15, role: "examiniert" }], error: null },
    });

    const { POST } = await import("@/app/api/leitung/generate-plan/route");
    const req = new NextRequest("http://localhost/api/leitung/generate-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week_start: "2026-12-01", week_end: "2026-12-31" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json).toHaveProperty("kiAnpassungen");
    expect(aiStructuredMock).toHaveBeenCalled();
  });
});

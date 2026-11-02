// Doppelklick auf „Annehmen" darf einen gelungenen Tausch nicht nachträglich als
// gescheitert markieren. Vorher lasen zwei gleichzeitige Aufrufe beide 'pending_colleague';
// der zweite scheiterte an der Re-Validierung und schrieb 'failed' über 'approved'.
// Jetzt beansprucht die Route die Zeile per bedingtem Update — wer zu spät kommt, bekommt
// 404 und fasst weder Schichten noch Status an.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Aufruf = { tabelle: string; kette: { m: string; a: unknown[] }[] };
let aufrufe: Aufruf[] = [];
let beanspruchtesErgebnis: unknown = null;

function fakeAdmin() {
  return {
    from(tabelle: string) {
      const a: Aufruf = { tabelle, kette: [] };
      aufrufe.push(a);
      const proxy: unknown = new Proxy(() => {}, {
        get(_t, prop) {
          if (prop === "then") {
            const istBeanspruchung = a.kette.some(k => k.m === "is") && a.kette.some(k => k.m === "update");
            const ergebnis = { data: istBeanspruchung ? beanspruchtesErgebnis : null, error: null };
            return (ok?: (v: unknown) => unknown, nein?: (e: unknown) => unknown) => Promise.resolve(ergebnis).then(ok, nein);
          }
          return (...args: unknown[]) => { a.kette.push({ m: String(prop), a: args }); return proxy; };
        },
      });
      return proxy;
    },
  };
}

const executeSwap = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/admin-client", () => ({ admin: () => fakeAdmin() }));
vi.mock("@/lib/swap-auth", () => ({
  resolveSwapActor: async () => ({ staffId: "s-ziel", fullName: "Ziel", facility: "F", userId: "u" }),
}));
vi.mock("@/lib/shift-swap", () => ({ validateSwap: vi.fn(), executeSwap }));
vi.mock("@/lib/swap-ppbv", () => ({ assessSwapPpbv: async () => ({ ok: true }) }));
vi.mock("@/lib/swap-ruhezeit", () => ({ assessSwapRuhezeit: async () => ({ warn: false }) }));
vi.mock("@/lib/swap-scope", () => ({ resolveSwapScope: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyLeitung: vi.fn(async () => {}), notifyStaffByName: vi.fn(async () => {}) }));

const { PATCH } = await import("./route");

function anfrage() {
  return new NextRequest("http://x/api/mitarbeiter/shift-swap-requests", {
    method: "PATCH", body: JSON.stringify({ id: "r1", response: "accept" }),
  });
}

const zeile = {
  id: "r1", facility_name: "F", reason: "Termin", leitung_decided_at: "2026-10-01T00:00:00Z",
  requester_shift_id: "a", requester_shift_date: "2026-10-12", requester_staff_id: "s-an", requester_staff_name: "An",
  target_shift_id: "b", target_shift_date: "2026-10-13", target_staff_id: "s-ziel", target_staff_name: "Ziel",
};

beforeEach(() => { aufrufe = []; executeSwap.mockClear(); });

describe("PATCH /api/mitarbeiter/shift-swap-requests — Beanspruchung", () => {
  it("beansprucht die Anfrage per bedingtem Update auf colleague_decided_at IS NULL", async () => {
    beanspruchtesErgebnis = zeile;
    const res = await PATCH(anfrage());
    expect(res.status).toBe(200);
    const erster = aufrufe[0];
    expect(erster.tabelle).toBe("shift_swap_requests");
    expect(erster.kette[0].m).toBe("update");
    expect(erster.kette).toContainEqual({ m: "is", a: ["colleague_decided_at", null] });
    expect(erster.kette).toContainEqual({ m: "eq", a: ["status", "pending_colleague"] });
    expect(executeSwap).toHaveBeenCalledTimes(1);
  });

  it("zweiter Klick: 404, kein Tausch, kein Status-Update", async () => {
    beanspruchtesErgebnis = null; // ein anderer Aufruf hat die Zeile schon
    const res = await PATCH(anfrage());
    expect(res.status).toBe(404);
    expect(executeSwap).not.toHaveBeenCalled();
    // Nur der eine Beanspruchungsversuch — kein nachgeschobenes `status: failed`.
    expect(aufrufe).toHaveLength(1);
  });
});

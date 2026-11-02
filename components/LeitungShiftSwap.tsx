"use client";
import { useEffect, useState, useCallback } from "react";
import { Repeat, CheckCircle, ArrowRight } from "lucide-react";
type Staff = {
    id: string;
    full_name: string;
    station: string | null;
};
type AssignedShift = {
    shiftId: string;
    date: string;
    shiftType: string;
    station: string;
};
type PartnerOption = {
    staffId: string;
    staffName: string;
    shiftId: string;
    shiftDate: string;
    shiftType: string;
};
const shiftLabel = (t: string) => ({ frueh: "Früh", spaet: "Spät", nacht: "Nacht" } as Record<string, string>)[t] ?? t;
const fmtDate = (d: string) => {
    try {
        return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return d;
    }
};
export default function LeitungShiftSwap() {
    const [enabled, setEnabled] = useState(false);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [staffId, setStaffId] = useState("");
    const [shifts, setShifts] = useState<AssignedShift[] | null>(null);
    const [shiftId, setShiftId] = useState("");
    const [partners, setPartners] = useState<PartnerOption[] | null>(null);
    const [partnerKey, setPartnerKey] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState("");
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const sRes = await fetch("/api/leitung/facility-settings");
                const sJson = await sRes.json().catch(() => ({}));
                if (!alive)
                    return;
                if (sJson?.settings?.shift_swap_mode !== "leitung_only") {
                    setEnabled(false);
                    return;
                }
                setEnabled(true);
                const stRes = await fetch("/api/leitung/shift-swap?action=staff");
                const stJson = await stRes.json().catch(() => ({}));
                if (alive)
                    setStaff((stJson.staff as Staff[]) ?? []);
            }
            catch { }
        })();
        return () => { alive = false; };
    }, []);
    const chooseStaff = useCallback(async (id: string) => {
        setStaffId(id);
        setShifts(null);
        setShiftId("");
        setPartners(null);
        setPartnerKey("");
        setError("");
        setDone("");
        if (!id)
            return;
        const res = await fetch(`/api/leitung/shift-swap?action=shifts&staff_id=${encodeURIComponent(id)}`);
        const d = await res.json().catch(() => ({}));
        setShifts((d.shifts as AssignedShift[]) ?? []);
    }, []);
    const chooseShift = useCallback(async (id: string) => {
        setShiftId(id);
        setPartners(null);
        setPartnerKey("");
        setError("");
        setDone("");
        if (!id)
            return;
        const res = await fetch(`/api/leitung/shift-swap?action=partners&staff_id=${encodeURIComponent(staffId)}&shift_id=${encodeURIComponent(id)}`);
        const d = await res.json().catch(() => ({}));
        setPartners((d.options as PartnerOption[]) ?? []);
    }, [staffId]);
    async function execute() {
        const partner = partners?.find(p => `${p.shiftId}:${p.staffId}` === partnerKey);
        if (!staffId || !shiftId || !partner) {
            setError("Bitte Mitarbeiter, Schicht und Tauschpartner wählen.");
            return;
        }
        setBusy(true);
        setError("");
        setDone("");
        try {
            const res = await fetch("/api/leitung/shift-swap", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requester_staff_id: staffId, requester_shift_id: shiftId,
                    target_staff_id: partner.staffId, target_shift_id: partner.shiftId,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(d.error ?? "Tausch fehlgeschlagen.");
                return;
            }
            setDone(`Getauscht: ${d.requester} ↔ ${d.target}.`);
            setPartners(null);
            setPartnerKey("");
            setShiftId("");
            chooseStaff(staffId);
        }
        catch {
            setError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setBusy(false);
        }
    }
    if (!enabled)
        return null;
    const selectedStaff = staff.find(s => s.id === staffId);
    return (<div className="rounded-2xl border border-[var(--linie)] bg-[var(--papier-tief)]/50 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-[var(--papier-tief)] flex items-center justify-center flex-shrink-0">
          <Repeat size={16} className="text-[var(--tinte-matt)]"/>
        </div>
        <h2 className="text-[14px] font-semibold text-[var(--tinte)]">Schicht tauschen</h2>
      </div>
      <p className="text-[13px] text-[var(--tinte-leise)] mb-3">Tausch läuft nur über die Leitung — führen Sie den von einem Mitarbeiter gewünschten Tausch hier durch.</p>

      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        
        <div className="space-y-2">
          <select value={staffId} onChange={e => chooseStaff(e.target.value)} className="w-full text-[13px] rounded-xl border border-[var(--linie)] bg-[var(--papier)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--linie)]/30">
            <option value="">Mitarbeiter wählen…</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.station ? ` · ${s.station}` : ""}</option>)}
          </select>
          {staffId && (<select value={shiftId} onChange={e => chooseShift(e.target.value)} className="w-full text-[13px] rounded-xl border border-[var(--linie)] bg-[var(--papier)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--linie)]/30">
              <option value="">{shifts === null ? "Schichten laden…" : shifts.length ? "Abzugebende Schicht wählen…" : "Keine kommenden Schichten"}</option>
              {(shifts ?? []).map(s => <option key={s.shiftId} value={s.shiftId}>{shiftLabel(s.shiftType)} · {fmtDate(s.date)} · {s.station}</option>)}
            </select>)}
        </div>

        <div className="hidden sm:flex items-center justify-center text-[var(--tinte-leise)] pb-2"><ArrowRight size={18}/></div>

        
        <div>
          {shiftId ? (<select value={partnerKey} onChange={e => setPartnerKey(e.target.value)} className="w-full text-[13px] rounded-xl border border-[var(--linie)] bg-[var(--papier)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--linie)]/30">
              <option value="">{partners === null ? "Partner laden…" : partners.length ? "Tauschpartner wählen…" : "Kein passender Tausch"}</option>
              {(partners ?? []).map(p => (<option key={`${p.shiftId}:${p.staffId}`} value={`${p.shiftId}:${p.staffId}`}>
                  {p.staffName} · {shiftLabel(p.shiftType)} {fmtDate(p.shiftDate)}
                </option>))}
            </select>) : (<div className="text-[13px] text-[var(--tinte-leise)] px-1 py-2">Erst Mitarbeiter und Schicht wählen.</div>)}
        </div>
      </div>

      {error && <p className="text-[13px] text-[var(--gefahr)] mt-2">{error}</p>}
      {done && <p className="text-[13px] text-[var(--ok)] mt-2 inline-flex items-center gap-1"><CheckCircle size={13}/> {done}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button onClick={execute} disabled={busy || !partnerKey} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
          <Repeat size={14}/> {busy ? "Tausche…" : "Tausch durchführen"}
        </button>
        {selectedStaff && <span className="text-[13px] text-[var(--tinte-leise)]">für {selectedStaff.full_name}</span>}
      </div>
    </div>);
}

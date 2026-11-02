"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { useLang } from "@/lib/LanguageContext";
import FlextimeReviewSection from "@/components/FlextimeReviewSection";
type ReqStatus = "pending" | "approved" | "declined";
type VacationRequest = {
    id: string;
    staff_id: string;
    from_date: string;
    to_date: string;
    days: number;
    reason: string;
    status: ReqStatus;
    submitted_at: string;
    staffName?: string;
};
export default function UrlaubsantraegePage() {
    const { t, locale } = useLang();
    const [requests, setRequests] = useState<VacationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    useEffect(() => {
        async function load() {
            const res = await fetch("/api/leitung/vacation-requests");
            if (!res.ok) {
                setLoading(false);
                return;
            }
            const data = await res.json();
            setRequests(data.requests ?? []);
            setLoading(false);
        }
        load();
    }, []);
    async function updateStatus(id: string, status: ReqStatus) {
        setUpdating(id);
        const res = await fetch("/api/leitung/vacation-requests", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        if (res.ok) {
            setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
        }
        setUpdating(null);
    }
    const pending = requests.filter(r => r.status === "pending").length;
    const approved = requests.filter(r => r.status === "approved").length;
    const declined = requests.filter(r => r.status === "declined").length;
    const sorted = [...requests].sort((a, b) => {
        const order: Record<ReqStatus, number> = { pending: 0, approved: 1, declined: 2 };
        return order[a.status] - order[b.status];
    });
    return (<div>
      <Header title={t("ula.title")} subtitle={t("ula.subtitle")}/>
      <div className="px-7 pb-7 pt-4 space-y-6 max-w-6xl mx-auto">

        
        <FlextimeReviewSection />

        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ula.waiting")}</span>
            <div className="flex items-end justify-between mt-4">
              <span className="text-[36px] font-semibold text-[var(--tinte)] leading-none">{pending}</span>
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>pending_actions</span>
            </div>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ula.approved")}</span>
            <div className="flex items-end justify-between mt-4">
              <span className="text-[36px] font-semibold text-[var(--ok)] leading-none">{approved}</span>
              <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 24 }}>check_circle</span>
            </div>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ula.rejected")}</span>
            <div className="flex items-end justify-between mt-4">
              <span className="text-[36px] font-semibold text-[var(--gefahr)] leading-none">{declined}</span>
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 24 }}>cancel</span>
            </div>
          </div>
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--linie)] bg-[var(--papier-tief)] flex justify-between items-center">
            <h2 className="text-[16px] font-semibold text-[var(--tinte)]">{t("ula.currentRequests")}</h2>
          </div>

          {loading ? (<div className="flex items-center justify-center py-12 gap-2 text-[var(--tinte-matt)]">
              <PulseLoader size={20}/>
              <span className="text-[14px]">{t("common.loading")}</span>
            </div>) : requests.length === 0 ? (<div className="flex items-start gap-4 p-8">
              <div className="w-10 h-10 bg-[var(--warnung-flaeche)] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 20 }}>info</span>
              </div>
              <div>
                <p className="font-semibold text-[var(--tinte)] mb-1">{t("ula.noRequests")}</p>
                <p className="text-[var(--tinte-matt)] text-[14px]">{t("ula.noRequestsHint")}</p>
              </div>
            </div>) : (<div className="divide-y divide-[var(--linie)]">
              {sorted.map((req) => {
                const isPending = req.status === "pending";
                const diffMs = req.from_date && req.to_date
                    ? new Date(req.to_date).getTime() - new Date(req.from_date).getTime()
                    : 0;
                const days = req.days || Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
                const initial = (req.staffName ?? "M").charAt(0).toUpperCase();
                const avatarBg = isPending ? "bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : req.status === "approved" ? "bg-[var(--ok-flaeche)] text-[var(--ok)]" : "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]";
                return (<div key={req.id} className="p-6 hover:bg-[var(--papier-tief)] transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                      
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-semibold flex-shrink-0 ${avatarBg}`}>
                          {initial}
                        </div>
                        <div>
                          <h3 className="text-[15px] font-semibold text-[var(--tinte)]">{req.staffName ?? t("role.mitarbeiter")}</h3>
                          <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                            {t("ula.submitted")} {req.submitted_at ? new Date(req.submitted_at).toLocaleDateString(locale) : "—"}
                          </p>
                        </div>
                      </div>

                      
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[var(--tinte-matt)]">
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
                          <span className="text-[14px]">
                            {req.from_date ? new Date(req.from_date).toLocaleDateString(locale) : "—"}
                            {" – "}
                            {req.to_date ? new Date(req.to_date).toLocaleDateString(locale) : "—"}
                          </span>
                        </div>
                        <p className="text-[13px] text-[var(--tinte-matt)] pl-6">{days} {t("ula.days")}{req.reason ? ` · ${req.reason}` : ""}</p>
                      </div>

                      
                      <div>
                        {isPending ? (<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] text-[13px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--akzent)]"/>
                            {t("ula.pending")}
                          </span>) : req.status === "approved" ? (<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--ok-flaeche)] text-[var(--ok)] text-[13px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]"/>
                            {t("ul.status.approved")}
                          </span>) : (<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] text-[13px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--gefahr)]"/>
                            {t("ul.status.declined")}
                          </span>)}
                      </div>

                      
                      {isPending && (<div className="flex items-center gap-2">
                          <button onClick={() => updateStatus(req.id, "declined")} disabled={updating === req.id} className="flex items-center gap-1.5 px-4 py-2 text-[var(--gefahr)] border border-[var(--linie)] bg-[var(--gefahr-flaeche)] hover:bg-[var(--gefahr-flaeche)] rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50">
                            {updating === req.id
                            ? <PulseLoader size={14}/>
                            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>}
                            {t("ula.reject")}
                          </button>
                          <button onClick={() => updateStatus(req.id, "approved")} disabled={updating === req.id} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--akzent)] text-white hover:bg-[var(--akzent-tief)] rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50">
                            {updating === req.id
                            ? <PulseLoader size={14}/>
                            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>rule</span>}
                            {t("ula.approve")}
                          </button>
                        </div>)}
                    </div>
                  </div>);
            })}
            </div>)}
        </div>

        
        <div data-fuehrung="urlaubskonten"><VacationBalances /></div>

      </div>
    </div>);
}
type Balance = {
    staff_id: string;
    full_name: string;
    entitlement: number;
    bonus: number;
    total: number;
    used: number;
    remaining: number;
};
function VacationBalances() {
    const { t } = useLang();
    const [balances, setBalances] = useState<Balance[]>([]);
    const [loading, setLoading] = useState(true);
    const [migrationNeeded, setMigrationNeeded] = useState(false);
    const [draft, setDraft] = useState<Record<string, {
        entitlement: number;
        bonus: number;
    }>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/leitung/vacation-balances")
            .then(r => r.json())
            .then(d => {
            const list: Balance[] = d.balances ?? [];
            setBalances(list);
            setMigrationNeeded(!!d.migrationNeeded);
            setDraft(Object.fromEntries(list.map(b => [b.staff_id, { entitlement: b.entitlement, bonus: b.bonus }])));
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    function setField(id: string, field: "entitlement" | "bonus", value: number) {
        setDraft(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    }
    function dirty(b: Balance) {
        const d = draft[b.staff_id];
        return d && (d.entitlement !== b.entitlement || d.bonus !== b.bonus);
    }
    async function save(b: Balance) {
        const d = draft[b.staff_id];
        if (!d)
            return;
        setSavingId(b.staff_id);
        setError("");
        setSavedId(null);
        try {
            const res = await fetch("/api/leitung/vacation-balances", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ staff_id: b.staff_id, vacation_days: d.entitlement, vacation_bonus_days: d.bonus }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(j.error ?? t("uk.saveFailed"));
            }
            else {
                setBalances(prev => prev.map(x => x.staff_id === b.staff_id
                    ? { ...x, entitlement: d.entitlement, bonus: d.bonus, total: d.entitlement + d.bonus, remaining: d.entitlement + d.bonus - x.used }
                    : x));
                setSavedId(b.staff_id);
                setTimeout(() => setSavedId(null), 2500);
            }
        }
        catch {
            setError(t("uk.saveFailed"));
        }
        setSavingId(null);
    }
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--linie)] bg-[var(--papier-tief)]">
        <h2 className="text-[16px] font-semibold text-[var(--tinte)] flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }} aria-hidden="true">event_available</span>
          {t("uk.title")}
        </h2>
        <p className="text-[13px] text-[var(--tinte-matt)] mt-1">
          {t("uk.descPre")}<strong>{t("uk.descBold")}</strong>{t("uk.descPost")}
        </p>
      </div>

      {migrationNeeded && (<div className="m-4 text-[13px] text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-lg px-4 py-3">
          {t("uk.migrationPre")}<code>20260607_vacation_entitlement.sql</code>{t("uk.migrationPost")}
        </div>)}
      {error && (<div className="m-4 text-[13px] text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg px-4 py-3 whitespace-pre-line">{error}</div>)}

      {loading ? (<div className="flex items-center justify-center py-10 gap-2 text-[var(--tinte-matt)]"><PulseLoader size={18}/> <span className="text-[13px]">{t("common.loading")}</span></div>) : balances.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)] text-center py-8">{t("uk.noStaff")}</p>) : (<div className="divide-y divide-[var(--linie)]">
          {balances.map(b => {
                const d = draft[b.staff_id] ?? { entitlement: b.entitlement, bonus: b.bonus };
                const total = d.entitlement + d.bonus;
                const remaining = total - b.used;
                return (<div key={b.staff_id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="md:w-48 flex-shrink-0">
                  <p className="text-[14px] font-semibold text-[var(--tinte)]">{b.full_name}</p>
                  <p className="text-[13px] text-[var(--tinte-matt)]">{t("uk.usedPre")} {b.used} · {t("uk.remainingLabel")} <strong className={remaining < 0 ? "text-[var(--gefahr)]" : "text-[var(--ok)]"}>{remaining}</strong></p>
                </div>
                <div className="flex items-end gap-4 flex-wrap">
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("uk.entitlement")}</span>
                    <input type="number" min={0} max={365} value={d.entitlement} onChange={e => setField(b.staff_id, "entitlement", Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))} className="w-24 px-3 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[var(--ok)]">{t("uk.bonus")}</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={365} value={d.bonus} onChange={e => setField(b.staff_id, "bonus", Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))} className="w-20 px-3 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--ok-flaeche)] focus:outline-none focus:ring-2 focus:ring-[var(--ok)]/40"/>
                      <button type="button" onClick={() => setField(b.staff_id, "bonus", Math.min(365, d.bonus + 1))} title={t("uk.addOneDayTitle")} className="px-2 py-1.5 text-[13px] font-semibold text-[var(--ok)] border border-[var(--linie)] rounded-lg hover:bg-[var(--ok-flaeche)] transition-colors">+1</button>
                    </div>
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("uk.total")}</span>
                    <span className="px-3 py-1.5 text-[13px] font-semibold text-[var(--tinte)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg min-w-[56px] text-center">{total}</span>
                  </div>
                  <button onClick={() => save(b)} disabled={!dirty(b) || savingId === b.staff_id} className="flex items-center gap-1.5 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-40">
                    {savingId === b.staff_id ? <PulseLoader size={13}/>
                        : savedId === b.staff_id ? <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                    {savedId === b.staff_id ? t("common.saved") : t("common.save")}
                  </button>
                </div>
              </div>);
            })}
        </div>)}
    </div>);
}

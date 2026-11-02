"use client";
import Wortmarke from "@/components/Wortmarke";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, ChevronRight, ChevronLeft, Zap, Settings, Shield, BarChart2, Building2, Layers, ChevronDown, Stethoscope, Clock, Users, HeartHandshake } from "lucide-react";
import { setAnalyticsEnabled, isAnalyticsEnabled } from "@/lib/useAnalytics";
import { useLang, LANGUAGES, type TKey } from "@/lib/LanguageContext";
import { planFuerNeuanlage, getPlanCapabilities, DEFAULT_SHIFT_DEMAND, SELECTABLE_PLANS, type Plan } from "@/lib/plan";
import { GERMAN_STATES } from "@/lib/scheduling/special-days";
import { MAX_ERINNERUNG_TAGE, MAX_PLAN_TAGE, STANDARD_ERINNERUNG_TAGE, STANDARD_PLAN_TAGE, monatsbeginnNach } from "@/lib/scheduling/monats-automatik";
import Schalter from "@/components/Schalter";
import Modal from "@/components/Modal";
import { addDaysISO, monatsBereichISO } from "@/lib/date";
import { deriveShiftType } from "@/lib/scheduling/shift-demand";
import PraxisKiSchritt, { type HochgeladenerPlan } from "@/components/onboarding/PraxisKiSchritt";
import Wochenraster from "@/components/onboarding/Wochenraster";
import Tageszeiten from "@/components/onboarding/Tageszeiten";
import TagesBesetzung from "@/components/onboarding/TagesBesetzung";
import Mittagspause from "@/components/onboarding/Mittagspause";
import Personalbedarf from "@/components/onboarding/Personalbedarf";
import ErkanntePersonen from "@/components/onboarding/ErkanntePersonen";
import type { ClosedSlots, MitarbeiterVorschlag, Mittagspause as MittagspauseZeit, RasterVorschlag, Schichtart, TagesBesetzung as TagesBesetzungWerte, TagesZeiten, Turnus } from "@/lib/scheduling/praxis-raster";
import { WOCHENTAGE, naechsterWochentag, turnusBehalten } from "@/lib/scheduling/praxis-raster";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#64748b"];
function shiftTypeFromStart(start: string, end?: string): "frueh" | "spaet" | "nacht" {
    return deriveShiftType(start, end) as "frueh" | "spaet" | "nacht";
}
const DEFAULT_DEMAND_BY_TYPE = DEFAULT_SHIFT_DEMAND;
const DEFAULT_DOCTOR_DEMAND_BY_TYPE: Record<string, number> = { frueh: 1, spaet: 1, nacht: 1 };
const STATION_TYPES = ["Pflegestation", "Intensivstation", "Notaufnahme", "Geriatrie", "Chirurgie", "Neurologie", "Palliativstation", "Sonstige"];
const BEREICH_PRESETS = ["Reinigung", "Küche", "Wäscherei", "Haustechnik", "Verwaltung", "Soziale Betreuung", "Pforte"];
function WizardTypeSelect({ value, onChange }: {
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node))
            setOpen(false); }
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    function toggle(t: string) {
        const next = value.includes(t) ? value.filter(v => v !== t) : [...value, t];
        onChange(next.length > 0 ? next : [t]);
    }
    return (<div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]">
        <span className="flex gap-1 flex-wrap flex-1">
          {value.map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-[var(--akzent-flaeche)] text-[var(--akzent)] text-[13px]">{t}</span>)}
        </span>
        <ChevronDown size={12} className={`text-[var(--tinte-leise)] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}/>
      </button>
      {open && (<div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-y-auto max-h-48">
          {STATION_TYPES.map(t => (<button key={t} type="button" onClick={() => toggle(t)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--papier-tief)] text-left">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${value.includes(t) ? "bg-[var(--akzent)] border-[var(--akzent)]" : "border-[var(--linie)]"}`}>
                {value.includes(t) && <Check size={10} className="text-white"/>}
              </div>
              <span className="text-[13px] text-[var(--tinte-matt)]">{t}</span>
            </button>))}
        </div>)}
    </div>);
}
function EntityShiftConfig({ name, slots, getDemand, setDemand, getOverride, setOverride, showDoctors, getDoctors, setDoctors, t, }: {
    name: string;
    slots: {
        type: string;
        name: string;
        defStart: string;
        defEnd: string;
    }[];
    getDemand: (name: string, type: string) => number;
    setDemand: (name: string, type: string, val: number) => void;
    getOverride: (name: string, type: string) => {
        start: string;
        end: string;
    };
    setOverride: (name: string, type: string, field: "start" | "end", val: string) => void;
    showDoctors?: boolean;
    getDoctors?: (name: string, type: string) => number;
    setDoctors?: (name: string, type: string, val: number) => void;
    t: (k: TKey) => string;
}) {
    const doctors = Boolean(showDoctors && getDoctors && setDoctors);
    return (<div className="mt-2 rounded-lg border border-[var(--linie)] bg-[var(--papier)] p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tinte-leise)] uppercase tracking-wide px-0.5 mb-1.5">
        <span className="flex-1"/>
        <span className="w-12 text-center">{t("wiz.override.staffCol")}</span>
        {doctors && <span className="w-12 text-center">{t("wiz.override.doctorCol")}</span>}
        <span className="w-[178px] text-center">{t("wiz.override.timeCol")}</span>
      </div>
      {slots.map(sl => {
            const ov = getOverride(name, sl.type);
            return (<div key={sl.type} className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--tinte)] font-medium truncate leading-tight">{sl.name}</p>
              <p className="text-[13px] text-[var(--tinte-leise)] leading-tight">{sl.defStart}–{sl.defEnd}</p>
            </div>
            <input type="number" min={0} max={99} value={getDemand(name, sl.type)} onChange={e => setDemand(name, sl.type, parseInt(e.target.value) || 0)} className="w-12 px-1.5 py-1 rounded-lg border border-[var(--linie)] text-[13px] text-center focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
            {doctors && (<input type="number" min={0} max={99} value={getDoctors!(name, sl.type)} onChange={e => setDoctors!(name, sl.type, parseInt(e.target.value) || 0)} className="w-12 px-1.5 py-1 rounded-lg border border-[var(--linie)] text-[13px] text-center focus:outline-none focus:border-[#0369a1] bg-[var(--papier)]"/>)}
            <div className="flex items-center gap-1 w-[178px] justify-end">
              <input type="time" value={ov.start} onChange={e => setOverride(name, sl.type, "start", e.target.value)} className="px-1.5 py-1 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)] w-[82px]"/>
              <span className="text-[var(--tinte-leise)] text-[13px]">–</span>
              <input type="time" value={ov.end} onChange={e => setOverride(name, sl.type, "end", e.target.value)} className="px-1.5 py-1 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)] w-[82px]"/>
            </div>
          </div>);
        })}
      <p className="text-[13px] text-[var(--tinte-leise)] mt-1.5">{t("wiz.override.globalHint")}</p>
      {doctors && <p className="text-[13px] text-[var(--tinte-leise)] mt-0.5">{t("wiz.override.doctorHint")}</p>}
    </div>);
}
type Station = {
    name: string;
    color: string;
    type: string;
};
type Bereich = {
    name: string;
    color: string;
};
type Props = {
    userId: string;
    facilityName: string;
    userName: string;
    isDemoCode?: boolean;
};
const STORAGE_KEY = "nurvo_onboarding_v3";
function loadDraft(): Partial<{
    step: number;
    stations: Station[];
    bereiche: Bereich[];
    payrollAuto: boolean;
    plan: Plan;
    brAcknowledged: boolean;
    bundesland: string;
    ort: string;
}> {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    }
    catch {
        return {};
    }
}
function saveDraft(data: object) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    catch { }
}
function clearDraft() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch { }
}
export default function OnboardingWizard({ facilityName, userName, isDemoCode = false }: Props) {
    const router = useRouter();
    const { lang, setLang, t, locale } = useLang();
    const draft = typeof window !== "undefined" ? loadDraft() : {};
    const [step, setStep] = useState(draft.step ?? 0);
    const [plan, setPlan] = useState<Plan>(planFuerNeuanlage(draft.plan));
    const planCaps = getPlanCapabilities(plan);
    const [bundesland, setBundesland] = useState<string>(draft.bundesland ?? "");
    const [ort, setOrt] = useState<string>(draft.ort ?? "");
    const [stations, setStations] = useState<Station[]>(draft.stations ?? []);
    const [bereiche, setBereiche] = useState<Bereich[]>(draft.bereiche ?? []);
    const [payrollAuto, setPayrollAuto] = useState(draft.payrollAuto ?? false);
    const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
    const [defaultWeekendPct, setDefaultWeekendPct] = useState("");
    const [defaultHolidayPct, setDefaultHolidayPct] = useState("");
    const [oncallPayEnabled, setOncallPayEnabled] = useState(false);
    const [oncallStandbyPct, setOncallStandbyPct] = useState("25");
    const [oncallHoursPerDay, setOncallHoursPerDay] = useState("8");
    const [oncallWorkPct, setOncallWorkPct] = useState("0");
    const [analyticsEnabled, setAnalyticsState] = useState(() => typeof window !== "undefined" && isAnalyticsEnabled());
    const [brAcknowledged, setBrAcknowledged] = useState(!!draft.brAcknowledged);
    const [newStationName, setNewStationName] = useState("");
    const [newStationTypes, setNewStationTypes] = useState<string[]>([STATION_TYPES[0]]);
    const [newStationColor, setNewStationColor] = useState(COLORS[0]);
    const [newBereichName, setNewBereichName] = useState("");
    const [newBereichColor, setNewBereichColor] = useState(COLORS[1]);
    const [springerEnabled, setSpringerEnabled] = useState(false);
    const [nichtGespeichert, setNichtGespeichert] = useState<string[]>([]);
    const [scheduleSpringerEnabled, setScheduleSpringerEnabled] = useState(false);
    const [availabilityEnabled, setAvailabilityEnabled] = useState(true);
    const [testEmail, setTestEmail] = useState("");
    const [testEmailSending, setTestEmailSending] = useState(false);
    const [testEmailSent, setTestEmailSent] = useState(false);
    const [testEmailError, setTestEmailError] = useState("");
    const [shiftTimes, setShiftTimes] = useState(() => plan === "praxis" ? [
        { name: "Vormittag", start: "07:30", end: "13:00" },
        { name: "Nachmittag", start: "14:00", end: "18:30" },
    ] : [
        { name: "Frühschicht", start: "06:00", end: "14:00" },
        { name: "Spätschicht", start: "14:00", end: "22:00" },
        { name: "Nachtschicht", start: "22:00", end: "06:00" },
    ]);
    const [shiftDemand, setShiftDemand] = useState<Record<string, Record<string, number>>>({});
    const getDemand = (name: string, type: string): number => shiftDemand[name]?.[type] ?? DEFAULT_DEMAND_BY_TYPE[type] ?? 1;
    const setDemand = (name: string, type: string, val: number) => setShiftDemand(prev => ({ ...prev, [name]: { ...(prev[name] ?? {}), [type]: Math.max(0, val) } }));
    const [doctorDemand, setDoctorDemand] = useState<Record<string, Record<string, number>>>({});
    const getDoctors = (name: string, type: string): number => doctorDemand[name]?.[type] ?? DEFAULT_DOCTOR_DEMAND_BY_TYPE[type] ?? 0;
    const setDoctors = (name: string, type: string, val: number) => setDoctorDemand(prev => ({ ...prev, [name]: { ...(prev[name] ?? {}), [type]: Math.max(0, val) } }));
    const getPraxisAerzte = (name: string, type: string): number => doctorDemand[name]?.[type] ?? (type === "nacht" ? 0 : 1);
    const [shiftTimeOverrides, setShiftTimeOverrides] = useState<Record<string, Record<string, {
        start: string;
        end: string;
    }>>>({});
    const getOverride = (name: string, type: string): {
        start: string;
        end: string;
    } => shiftTimeOverrides[name]?.[type] ?? { start: "", end: "" };
    const setOverride = (name: string, type: string, field: "start" | "end", val: string) => setShiftTimeOverrides(prev => ({
        ...prev,
        [name]: { ...(prev[name] ?? {}), [type]: { ...(prev[name]?.[type] ?? { start: "", end: "" }), [field]: val } },
    }));
    const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
    const demandSlots = (["frueh", "spaet", "nacht"] as const)
        .map(type => {
        const s = shiftTimes.find(x => shiftTypeFromStart(x.start, x.end) === type);
        return s ? { type: type as string, name: s.name, defStart: s.start, defEnd: s.end } : null;
    })
        .filter((s): s is {
        type: string;
        name: string;
        defStart: string;
        defEnd: string;
    } => s !== null);
    const [closedSlots, setClosedSlots] = useState<ClosedSlots>({ "6": ["frueh", "spaet", "nacht"], "0": ["frueh", "spaet", "nacht"] });
    const [replacementMin, setReplacementMin] = useState<Record<string, number | null>>({});
    const [praxisBeschreibung, setPraxisBeschreibung] = useState("");
    const [praxisPlan, setPraxisPlan] = useState<HochgeladenerPlan | null>(null);
    const [dayShiftTimes, setDayShiftTimes] = useState<TagesZeiten>({});
    const [mittagspause, setMittagspause] = useState<MittagspauseZeit | null>(null);
    const [turnus, setTurnus] = useState<Turnus>({});
    const [besetzungJeTag, setBesetzungJeTag] = useState<TagesBesetzungWerte>({});
    const [erkanntePersonen, setErkanntePersonen] = useState<MitarbeiterVorschlag[]>([]);
    const [kiUebernommen, setKiUebernommen] = useState(false);
    const praxisEinheit = facilityName || "Praxis";
    function toggleClosed(dow: number, art: string) {
        const tag = String(dow);
        const zu = (closedSlots[tag] ?? []).includes(art);
        const imTurnus = Boolean(turnus[tag]?.[art as Schichtart]);
        const ohneTurnus = (t: Turnus) => {
            const rest = { ...(t[tag] ?? {}) };
            delete rest[art as Schichtart];
            const neu = { ...t, [tag]: rest };
            if (!Object.keys(rest).length)
                delete neu[tag];
            return neu;
        };
        if (zu) {
            setClosedSlots(prev => ({ ...prev, [tag]: (prev[tag] ?? []).filter(a => a !== art) }));
        }
        else if (!imTurnus) {
            setTurnus(prev => ({ ...prev, [tag]: { ...(prev[tag] ?? {}), [art]: { alle: 2, ab: naechsterWochentag(dow) } } }));
        }
        else {
            setTurnus(ohneTurnus);
            setClosedSlots(prev => ({ ...prev, [tag]: [...(prev[tag] ?? []), art] }));
        }
    }
    function turnusVerschieben(dow: number, art: Schichtart) {
        setTurnus(prev => {
            const t = prev[String(dow)]?.[art];
            if (!t)
                return prev;
            return { ...prev, [String(dow)]: { ...prev[String(dow)], [art]: { ...t, ab: addDaysISO(t.ab, 7) } } };
        });
    }
    function rasterUebernehmen(v: RasterVorschlag) {
        setShiftTimes(v.schichten.map(s => ({ name: s.name, start: s.start, end: s.end })));
        setShiftDemand(prev => ({ ...prev, [praxisEinheit]: Object.fromEntries(v.schichten.map(s => [s.art, s.bedarf])) }));
        setDoctorDemand(prev => ({ ...prev, [praxisEinheit]: Object.fromEntries(v.schichten.map(s => [s.art, s.aerzte])) }));
        setReplacementMin(Object.fromEntries(v.schichten.map(s => [s.art, s.mindestens])));
        setClosedSlots(v.geschlossen);
        setDayShiftTimes(v.zeitenJeTag ?? {});
        setMittagspause(v.mittagspause ?? null);
        setTurnus(prev => turnusBehalten(v.turnus, prev) ?? {});
        setBesetzungJeTag(v.besetzungJeTag ?? {});
        if (v.mitarbeitende?.length)
            setErkanntePersonen(v.mitarbeitende);
        setKiUebernommen(true);
        goNext();
    }
    const [pauseThreshold, setPauseThreshold] = useState(20);
    const [overtimeLimitPct, setOvertimeLimitPct] = useState(20);
    const [overtimeCompensation, setOvertimeCompensation] = useState<"payout" | "vacation">("payout");
    const [overtimeHoursPerDay, setOvertimeHoursPerDay] = useState(8);
    const [understaffingMode, setUnderstaffingMode] = useState<"popup" | "auto">(isDemoCode ? "popup" : "auto");
    const [overtimeRebalanceMode, setOvertimeRebalanceMode] = useState<"off" | "suggest" | "auto">(isDemoCode ? "off" : "auto");
    const [shiftSwapMode, setShiftSwapMode] = useState<"manual" | "automatic">(isDemoCode ? "manual" : "automatic");
    const [autoScheduling, setAutoScheduling] = useState(!isDemoCode);
    const [wishReminderDays, setWishReminderDays] = useState(STANDARD_ERINNERUNG_TAGE);
    const [planCreateDays, setPlanCreateDays] = useState(STANDARD_PLAN_TAGE);
    const [autoPayrollEnabled, setAutoPayrollEnabled] = useState(!isDemoCode);
    const [vacationAutoApprove, setVacationAutoApprove] = useState(!isDemoCode);
    const [contractLimits, setContractLimits] = useState({
        max_hours_per_shift: 10, min_rest_hours: 11, max_consecutive_days: 6,
        max_consecutive_nights: 4, max_shifts_per_week: 6,
        break_after_minutes: 360, break_min: 30,
        max_holiday_shifts_per_month: 4, min_days_off_per_week: 2,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showSkipModal, setShowSkipModal] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const persist = useCallback((updates: object) => {
        saveDraft({ step, stations, bereiche, payrollAuto, plan, bundesland, ort, ...updates });
    }, [step, stations, bereiche, payrollAuto, plan, bundesland, ort]);
    const STEP_DEFS: {
        key: string;
        label: string;
    }[] = [
        { key: "sprache", label: t("wiz.step.sprache") },
        { key: "welcome", label: t("wiz.step.welcome") },
        { key: "vertrag", label: t("wiz.step.vertrag") },
        ...(SELECTABLE_PLANS.length > 1 ? [{ key: "typ", label: t("wiz.step.typ") }] : []),
        { key: "standort", label: t("wiz.step.standort") },
        ...(plan === "praxis" ? [{ key: "praxisKi", label: t("wiz.step.praxisKi") }] : []),
        { key: "zeiten", label: t("wiz.step.zeiten") },
        ...(planCaps.multiStation ? [{ key: "stationen", label: t("wiz.step.stationen") }] : []),
        { key: "bereiche", label: t("wiz.step.bereiche") },
        { key: "mitarbeiter", label: t("wiz.step.mitarbeiter") },
        { key: "lohn", label: t("wiz.step.lohn") },
        { key: "springer", label: t("wiz.step.springer") },
        { key: "planung", label: t("wiz.step.planung") },
        { key: "datenschutz", label: t("wiz.step.datenschutz") },
    ];
    const steps = STEP_DEFS.map(s => s.label);
    const stepKey = STEP_DEFS[Math.min(step, STEP_DEFS.length - 1)]?.key ?? "welcome";
    const isLastStep = step >= STEP_DEFS.length - 1;
    function addStation() {
        if (!newStationName.trim())
            return;
        const updated = [...stations, { name: newStationName.trim(), color: newStationColor, type: JSON.stringify(newStationTypes) }];
        setStations(updated);
        persist({ stations: updated });
        setNewStationName("");
    }
    function removeStation(i: number) {
        const updated = stations.filter((_, idx) => idx !== i);
        setStations(updated);
        persist({ stations: updated });
    }
    function addBereich() {
        const name = newBereichName.trim();
        if (!name)
            return;
        const updated = [...bereiche, { name, color: newBereichColor }];
        setBereiche(updated);
        persist({ bereiche: updated });
        setNewBereichName("");
    }
    function addBereichPreset(name: string) {
        if (bereiche.find(b => b.name === name))
            return;
        const color = COLORS[(bereiche.length + 1) % COLORS.length];
        const updated = [...bereiche, { name, color }];
        setBereiche(updated);
        persist({ bereiche: updated });
    }
    function removeBereich(i: number) {
        const updated = bereiche.filter((_, idx) => idx !== i);
        setBereiche(updated);
        persist({ bereiche: updated });
    }
    async function sendTestAgencyEmail() {
        const adresse = testEmail.trim();
        if (!adresse)
            return;
        setTestEmailSending(true);
        setTestEmailError("");
        setTestEmailSent(false);
        try {
            const res = await fetch("/api/demo/test-agency-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: adresse }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok)
                setTestEmailError(json.error || t("wiz.springer.testFailed"));
            else
                setTestEmailSent(true);
        }
        catch {
            setTestEmailError(t("wiz.springer.testFailed"));
        }
        finally {
            setTestEmailSending(false);
        }
    }
    const fullAutomation = autoScheduling &&
        understaffingMode === "auto" &&
        shiftSwapMode === "automatic" &&
        overtimeRebalanceMode === "auto" &&
        autoPayrollEnabled &&
        vacationAutoApprove;
    function setFullAutomation(on: boolean) {
        setAutoScheduling(on);
        setUnderstaffingMode(on ? "auto" : "popup");
        setShiftSwapMode(on ? "automatic" : "manual");
        setOvertimeRebalanceMode(on ? "auto" : "off");
        setAutoPayrollEnabled(on);
        setVacationAutoApprove(on);
    }
    function goNext() {
        const next = step + 1;
        setStep(next);
        persist({ step: next });
    }
    function goBack() {
        const prev = Math.max(0, step - 1);
        setStep(prev);
        persist({ step: prev });
    }
    async function confirmSkip() {
        setShowSkipModal(false);
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skip: true }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? t("wiz.err.skip"));
                setSubmitting(false);
                return;
            }
            clearDraft();
            router.push("/dashboard");
        }
        catch {
            setError(t("wiz.err.connection"));
            setSubmitting(false);
        }
    }
    async function complete() {
        if (!bundesland) {
            const standortIndex = STEP_DEFS.findIndex(s => s.key === "standort");
            if (standortIndex >= 0)
                setStep(standortIndex);
            setError(t("wiz.standort.required"));
            return;
        }
        setSubmitting(true);
        setError("");
        setAnalyticsEnabled(analyticsEnabled);
        const demandOrder = ["frueh", "spaet", "nacht"];
        const demandTypes = demandOrder.filter(dt => shiftTimes.some(s => shiftTypeFromStart(s.start, s.end) === dt));
        const resolvedDemand: Record<string, Record<string, number>> = {};
        const praxisUnit = planCaps.multiStation ? [] : [facilityName || "Praxis"];
        const demandEntities = [
            ...(planCaps.multiStation ? stations.map(s => s.name) : praxisUnit),
            ...bereiche.map(b => b.name),
        ];
        for (const entity of demandEntities) {
            resolvedDemand[entity] = {};
            for (const dt of demandTypes)
                resolvedDemand[entity][dt] = getDemand(entity, dt);
        }
        const resolvedDoctorDemand: Record<string, Record<string, number>> = {};
        if (plan === "klinik" && planCaps.multiStation) {
            for (const st of stations) {
                resolvedDoctorDemand[st.name] = {};
                for (const dt of demandTypes)
                    resolvedDoctorDemand[st.name][dt] = getDoctors(st.name, dt);
            }
        }
        const praxisTeam: Record<string, number> = { ...(resolvedDemand[praxisEinheit] ?? {}) };
        if (plan === "praxis" && resolvedDemand[praxisEinheit]) {
            resolvedDoctorDemand[praxisEinheit] = {};
            for (const dt of demandTypes) {
                const aerzte = getPraxisAerzte(praxisEinheit, dt);
                resolvedDoctorDemand[praxisEinheit][dt] = aerzte;
                resolvedDemand[praxisEinheit][dt] = (praxisTeam[dt] ?? 0) + aerzte;
            }
        }
        const resolvedOverrides: Record<string, Record<string, {
            start: string;
            end: string;
        }>> = {};
        for (const entity of demandEntities) {
            const perType = shiftTimeOverrides[entity];
            if (!perType)
                continue;
            for (const dt of demandTypes) {
                const ov = perType[dt];
                if (ov && (ov.start || ov.end)) {
                    resolvedOverrides[entity] = resolvedOverrides[entity] ?? {};
                    resolvedOverrides[entity][dt] = { start: ov.start || "", end: ov.end || "" };
                }
            }
        }
        try {
            const res = await fetch("/api/onboarding/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, bundesland, ort: ort.trim() || null, stations, bereiche, payrollAuto, analyticsEnabled, brAcknowledged, springerEnabled, scheduleSpringerEnabled, availabilityEnabled, shiftTimes, shiftDemand: Object.keys(resolvedDemand).length ? resolvedDemand : null, doctorDemand: Object.keys(resolvedDoctorDemand).length ? resolvedDoctorDemand : null, shiftTimeOverrides: Object.keys(resolvedOverrides).length ? resolvedOverrides : null,
                    ...(plan === "praxis" ? {
                        closedSlots: Object.fromEntries(Object.entries(closedSlots).map(([d, arten]) => [d, (arten ?? []).filter(a => demandTypes.includes(a))]).filter(([, arten]) => (arten as string[]).length > 0)),
                        replacementMin: { [praxisEinheit]: Object.fromEntries(demandTypes.filter(dt => typeof replacementMin[dt] === "number").map(dt => [dt, Math.min(replacementMin[dt] as number, praxisTeam[dt] ?? 0) + getPraxisAerzte(praxisEinheit, dt)])) },
                        dayShiftTimes: {
                            ...dayShiftTimes,
                            ...(mittagspause ? { mittag: mittagspause } : {}),
                            ...(Object.keys(turnus).length ? { turnus } : {}),
                            ...(Object.keys(besetzungJeTag).length ? { besetzung: besetzungJeTag } : {}),
                        },
                        mitarbeitende: erkanntePersonen.filter(p => p.vorausgewaehlt && p.name.trim())
                            .map(p => ({ name: p.name.trim(), beruf: p.beruf, wochenstunden: p.wochenstunden })),
                    } : {}),
                    pauseThreshold, overtimeLimitPct, understaffingMode, overtimeRebalanceMode, shiftSwapMode, autoScheduling, wishReminderDays, planCreateDays, autoPayrollEnabled, vacationAutoApprove, defaultHourlyRate: defaultHourlyRate ? parseFloat(defaultHourlyRate) : null,
                    default_weekend_pct: defaultWeekendPct !== "" ? parseFloat(defaultWeekendPct) : null,
                    default_holiday_pct: defaultHolidayPct !== "" ? parseFloat(defaultHolidayPct) : null,
                    oncall_pay_enabled: oncallPayEnabled,
                    oncall_standby_pct: oncallStandbyPct !== "" ? parseFloat(oncallStandbyPct) : null,
                    oncall_hours_per_day: oncallHoursPerDay !== "" ? parseFloat(oncallHoursPerDay) : null,
                    oncall_work_pct: oncallWorkPct !== "" ? parseFloat(oncallWorkPct) : null,
                    overtimeCompensation, overtimeHoursPerDay,
                    default_max_hours_per_shift: contractLimits.max_hours_per_shift,
                    default_min_rest_hours: contractLimits.min_rest_hours,
                    default_max_consecutive_days: contractLimits.max_consecutive_days,
                    default_max_consecutive_nights: contractLimits.max_consecutive_nights,
                    default_max_shifts_per_week: contractLimits.max_shifts_per_week,
                    default_break_after_minutes: contractLimits.break_after_minutes,
                    default_break_min: contractLimits.break_min,
                    default_max_holiday_shifts_per_month: contractLimits.max_holiday_shifts_per_month,
                    default_min_days_off_per_week: contractLimits.min_days_off_per_week }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? t("wiz.err.complete"));
                setSubmitting(false);
                return;
            }
            const ergebnis = await res.json().catch(() => ({}));
            setNichtGespeichert(Array.isArray(ergebnis.nichtGespeichert) ? ergebnis.nichtGespeichert : []);
            clearDraft();
            setFinalizing(true);
        }
        catch {
            setError(t("wiz.err.connection"));
            setSubmitting(false);
        }
    }
    const visualStep = step;
    if (finalizing)
        return <OnboardingFinalizing nichtGespeichert={nichtGespeichert}/>;
    return (<div className="min-h-svh bg-[var(--papier-tief)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        
        <div className="flex items-center gap-2 mb-8 px-1">
          {steps.map((label, i) => (<div key={i} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-semibold transition-colors" style={{
                background: i < visualStep ? "var(--akzent)" : i === visualStep ? "var(--tinte)" : "var(--linie)",
                color: i <= visualStep ? "white" : "#94a3b8",
            }}>
                  {i < visualStep ? <Check size={11}/> : i + 1}
                </div>
                <span className="text-[13px] text-[var(--tinte-leise)] hidden sm:block whitespace-nowrap">{label}</span>
              </div>
              {i < steps.length - 1 && (<div className="flex-1 h-0.5 mb-4 rounded-full" style={{ background: i < visualStep ? "var(--akzent)" : "var(--linie)" }}/>)}
            </div>))}
        </div>

        
        <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)]  overflow-hidden max-h-[80vh] flex flex-col">

          
          {stepKey === "sprache" && (<div className="p-8 overflow-y-auto flex-1">
              <div className="w-12 h-12 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>language</span>
              </div>
              <h1 className="text-[22px] font-semibold text-[var(--tinte)] mb-2">Sprache wählen / Choose language</h1>
              <p className="text-[var(--tinte-matt)] text-[14px] leading-relaxed mb-6">
                {t("wiz.sprache.intro")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {LANGUAGES.map(l => (<button key={l.code} onClick={() => setLang(l.code)} className={`flex items-center gap-3 p-4 rounded-xl border-2 transition text-left ${lang === l.code ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:border-[#c7d2fe]"}`}>
                                        <span className="font-semibold text-[14px] text-[var(--tinte)] flex-1">{l.label}</span>
                    {lang === l.code && <Check size={16} className="text-[var(--akzent)] flex-shrink-0"/>}
                  </button>))}
              </div>
            </div>)}

          
          {stepKey === "welcome" && (<div className="p-8 overflow-y-auto flex-1">
              <Wortmarke className="block text-[26px] font-extrabold text-[var(--tinte)] tracking-tight mb-5"/>
              <h1 className="text-[22px] font-semibold text-[var(--tinte)] mb-2">
                {t("wiz.welcome.title")}{userName ? `, ${userName.split(" ")[0]}` : ""}
              </h1>
              <p className="text-[var(--tinte-matt)] text-[14px] leading-relaxed mb-6">
                {t("wiz.welcome.intro1")} <strong className="text-[var(--tinte)]">{facilityName || t("wiz.welcome.defaultFacility")}</strong>{t("wiz.welcome.intro2")}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
                  <Building2 size={15} className="text-[var(--akzent)] flex-shrink-0"/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.welcome.item1")}</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
                  <Layers size={15} className="text-[var(--akzent)] flex-shrink-0"/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.welcome.item2")}</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
                  <Shield size={15} className="text-[var(--akzent)] flex-shrink-0"/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.welcome.item3")}</span>
                </div>
              </div>
            </div>)}

          
          {stepKey === "vertrag" && (<div className="p-8 overflow-y-auto flex-1">
              <div className="w-12 h-12 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-5">
                <Clock size={22} className="text-[var(--akzent)]"/>
              </div>
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.vertrag.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
                {t("wiz.vertrag.intro")}
              </p>
              <div className="rounded-lg border border-[var(--linie)] bg-[var(--akzent-flaeche)] px-3 py-2.5 text-[13px] text-[var(--akzent)] mb-5 flex items-start gap-2">
                <Shield size={14} className="flex-shrink-0 mt-0.5"/>
                <span>Die <strong>{t("wiz.vertrag.hardLabel")}</strong> {t("wiz.vertrag.hardDesc")} Die <strong>{t("wiz.vertrag.softLabel")}</strong> {t("wiz.vertrag.softDesc")}</span>
              </div>

              <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-2">{t("wiz.vertrag.hardHeading")}</p>
              <div className="space-y-2.5 mb-5">
                {([
                ["max_hours_per_shift", t("wiz.vertrag.maxHoursShift"), t("wiz.unit.hours"), 1, 24, 0.5],
                ["min_rest_hours", t("wiz.vertrag.minRest"), t("wiz.unit.hours"), 0, 24, 0.5],
                ["max_consecutive_days", t("wiz.vertrag.maxConsecDays"), t("wiz.unit.days"), 1, 7, 1],
                ["max_consecutive_nights", t("wiz.vertrag.maxConsecNights"), t("wiz.unit.nights"), 1, 7, 1],
                ["max_shifts_per_week", t("wiz.vertrag.maxShiftsWeek"), "", 0, 7, 1],
            ] as [
                keyof typeof contractLimits,
                string,
                string,
                number,
                number,
                number
            ][]).map(([key, label, unit, min, max, step]) => (<div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
                    <span className="text-[13px] text-[var(--tinte)] flex-1">{label}</span>
                    <input type="number" min={min} max={max} step={step} value={contractLimits[key]} onChange={e => setContractLimits(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] text-center focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                    {unit && <span className="text-[13px] text-[var(--tinte-matt)] w-12">{unit}</span>}
                    {!unit && <span className="w-12"/>}
                  </div>))}
              </div>

              <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-2">{t("wiz.vertrag.softHeading")}</p>
              <div className="space-y-2.5">
                {([
                ["break_after_minutes", t("wiz.vertrag.breakAfter"), t("wiz.unit.min"), 0, 1440, 5],
                ["break_min", t("wiz.vertrag.breakLen"), t("wiz.unit.min"), 0, 240, 5],
                ["max_holiday_shifts_per_month", t("wiz.vertrag.maxHolidayShifts"), "", 0, 31, 1],
                ["min_days_off_per_week", t("wiz.vertrag.minDaysOff"), t("wiz.unit.days"), 0, 7, 1],
            ] as [
                keyof typeof contractLimits,
                string,
                string,
                number,
                number,
                number
            ][]).map(([key, label, unit, min, max, step]) => (<div key={key} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--linie)] bg-[var(--papier)]">
                    <span className="text-[13px] text-[var(--tinte)] flex-1">{label}</span>
                    <input type="number" min={min} max={max} step={step} value={contractLimits[key]} onChange={e => setContractLimits(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] text-center focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                    {unit && <span className="text-[13px] text-[var(--tinte-matt)] w-12">{unit}</span>}
                    {!unit && <span className="w-12"/>}
                  </div>))}
              </div>
            </div>)}

          
          {stepKey === "typ" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.typ.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-6">
                {t("wiz.typ.intro")}
              </p>
              <div className="space-y-3">
                {([
                { value: "klinik", icon: Building2, accent: "var(--akzent)", ring: "border-[var(--akzent)] bg-[var(--akzent-flaeche)]", hover: "hover:border-[var(--linie)]", titleKey: "wiz.typ.klinikTitle", descKey: "wiz.typ.klinikDesc" },
                { value: "pflege", icon: HeartHandshake, accent: "#0369a1", ring: "border-[#0369a1] bg-[var(--papier-tief)]", hover: "hover:border-[var(--linie)]", titleKey: "wiz.typ.pflegeTitle", descKey: "wiz.typ.pflegeDesc" },
                { value: "praxis", icon: Stethoscope, accent: "#059669", ring: "border-[var(--ok)] bg-[var(--ok-flaeche)]", hover: "hover:border-[var(--linie)]", titleKey: "wiz.typ.praxisTitle", descKey: "wiz.typ.praxisDesc" },
            ] as const).filter(opt => SELECTABLE_PLANS.includes(opt.value)).map(opt => {
                const Icon = opt.icon;
                const active = plan === opt.value;
                return (<button key={opt.value} onClick={() => { setPlan(opt.value); persist({ plan: opt.value }); }} className={`w-full text-left p-4 rounded-xl border-2 transition ${active ? opt.ring : `border-[var(--linie)] ${opt.hover}`}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: opt.accent }}>
                          <Icon size={14} className="text-white"/>
                        </div>
                        <div>
                          <div className="font-semibold text-[14px] text-[var(--tinte)] mb-0.5">{t(opt.titleKey)}</div>
                          <div className="text-[13px] text-[var(--tinte-matt)]">
                            {t(opt.descKey)}
                          </div>
                        </div>
                        {active && <Check size={16} className="ml-auto flex-shrink-0 mt-1" style={{ color: opt.accent }}/>}
                      </div>
                    </button>);
            })}
              </div>
            </div>)}

          
          {stepKey === "standort" && (<div className="p-8 overflow-y-auto flex-1">
              <div className="w-12 h-12 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>location_on</span>
              </div>
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.standort.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-6">{t("wiz.standort.intro")}</p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="onboardingwizard-bundeslandlabel" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">
                    {t("wiz.standort.bundeslandLabel")} <span className="text-[var(--gefahr)]">*</span>
                  </label>
                  <select id="onboardingwizard-bundeslandlabel" value={bundesland} onChange={e => { setBundesland(e.target.value); persist({ bundesland: e.target.value }); }} className="w-full px-3 py-2.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]">
                    <option value="">{t("wiz.standort.bundeslandPlaceholder")}</option>
                    {GERMAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="onboardingwizard-ort" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wiz.standort.ortLabel")}</label>
                  <input id="onboardingwizard-ort" type="text" value={ort} onChange={e => { setOrt(e.target.value); persist({ ort: e.target.value }); }} placeholder={t("wiz.standort.ortPlaceholder")} className="w-full px-3 py-2.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)]"/>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2.5">
                <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 15 }}>info</span>
                <span>{t("wiz.standort.hint")}</span>
              </div>
            </div>)}

          
          {stepKey === "stationen" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.stationen.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-3">{t("wiz.stationen.intro")}</p>
              <div className="rounded-lg border border-[var(--linie)] bg-[var(--akzent-flaeche)] px-3 py-2.5 text-[13px] text-[var(--akzent)] mb-5 flex items-start gap-2">
                <Shield size={14} className="flex-shrink-0 mt-0.5"/>
                <span>{t("wiz.stationen.infoPre")} <strong>{t("wiz.stationen.leadLabel")}</strong> {t("wiz.stationen.infoMid")} <strong>{t("wiz.leaveWishesLabel")}</strong> {t("wiz.stationen.infoSuffixWard")}</span>
              </div>
              {stations.length > 0 && (<p className="text-[13px] text-[var(--tinte-matt)] -mt-2 mb-3">{t("wiz.override.perStation")}</p>)}

              {stations.length > 0 && (<div className="space-y-2 mb-4">
                  {stations.map((s, i) => {
                    const key = `st:${i}`;
                    const open = expandedEntity === key;
                    return (<div key={i} className="rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)]">
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }}/>
                          <span className="text-[13px] font-medium text-[var(--tinte)] flex-1">{s.name}</span>
                          <span className="text-[13px] text-[var(--tinte-matt)]">{(() => { try {
                        const p = JSON.parse(s.type);
                        return Array.isArray(p) ? p.join(", ") : s.type;
                    }
                    catch {
                        return s.type;
                    } })()}</span>
                          
                          <span className="text-[13px] font-mono text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded px-1.5 py-0.5" title={t("wiz.override.defaultTitle")}>
                            {demandSlots.map(sl => getDemand(s.name, sl.type)).join("/")}
                          </span>
                          <button onClick={() => setExpandedEntity(open ? null : key)} className={`flex items-center gap-1 text-[13px] font-medium px-2 py-1 rounded-lg border transition-colors ${open ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:border-[var(--akzent)]"}`}>
                            <Clock size={11}/> {t("wiz.override.configLabel")}
                            <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`}/>
                          </button>
                          <button onClick={() => { if (open)
                        setExpandedEntity(null); removeStation(i); }} className="p-1 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                        {open && (<div className="px-3 pb-3">
                            <EntityShiftConfig name={s.name} slots={demandSlots} getDemand={getDemand} setDemand={setDemand} getOverride={getOverride} setOverride={setOverride} showDoctors={plan === "klinik"} getDoctors={getDoctors} setDoctors={setDoctors} t={t}/>
                          </div>)}
                      </div>);
                })}
                </div>)}

              <div className="border border-[var(--linie)] rounded-xl p-4 space-y-3">
                <input type="text" value={newStationName} onChange={e => setNewStationName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStation()} placeholder={t("wiz.stationen.namePlaceholder")} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)]"/>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <WizardTypeSelect value={newStationTypes} onChange={setNewStationTypes}/>
                  </div>
                  <div className="flex gap-1.5">
                    {COLORS.slice(0, 5).map(c => (<button key={c} onClick={() => setNewStationColor(c)} className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: newStationColor === c ? "var(--tinte)" : "transparent" }}/>))}
                  </div>
                </div>
                <button onClick={addStation} disabled={!newStationName.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-40" style={{ background: "var(--tinte)" }}>
                  <Plus size={13}/> {t("wiz.stationen.add")}
                </button>
              </div>
              {stations.length === 0 && (<p className="text-[13px] text-[var(--tinte-leise)] mt-3">{t("wiz.stationen.emptyHint")}</p>)}
            </div>)}

          
          {stepKey === "bereiche" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.bereiche.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-2">
                {plan === "praxis" ? t("wiz.bereiche.introPraxis") : t("wiz.bereiche.introStation")}
              </p>
              {planCaps.ppbv && (<p className="text-[13px] text-[var(--tinte-leise)] mb-3">{t("wiz.bereiche.ppbvHint")}</p>)}
              <div className="rounded-lg border border-[var(--linie)] bg-[var(--akzent-flaeche)] px-3 py-2.5 text-[13px] text-[var(--akzent)] mb-4 flex items-start gap-2">
                <Layers size={14} className="flex-shrink-0 mt-0.5"/>
                <span>{t("wiz.bereiche.infoPre")} <strong>{t("wiz.tasksLabel")}</strong> {t("wiz.bereiche.infoMid1")} <strong>{t("wiz.bereiche.leadLabel")}</strong> {t("wiz.bereiche.infoMid2")} <strong>{t("wiz.leaveWishesLabel")}</strong> {t("wiz.bereiche.infoSuffix")}</span>
              </div>

              
              <div className="flex flex-wrap gap-2 mb-4">
                {BEREICH_PRESETS.map(p => {
                const active = bereiche.find(b => b.name === p);
                return (<button key={p} onClick={() => active ? removeBereich(bereiche.findIndex(b => b.name === p)) : addBereichPreset(p)} className={`flex items-center gap-1 text-[13px] px-3 py-1.5 rounded-full border transition-colors ${active ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:border-[var(--akzent)]"}`}>
                      {active && <Check size={11}/>}
                      {p}
                    </button>);
            })}
              </div>

              {bereiche.length > 0 && (<p className="text-[13px] text-[var(--tinte-matt)] mb-3">{t("wiz.override.perBereich")}</p>)}

              {bereiche.length > 0 && (<div className="space-y-2 mb-4">
                  {bereiche.map((b, i) => {
                    const key = `be:${i}`;
                    const open = expandedEntity === key;
                    return (<div key={i} className="rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)]">
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: b.color }}/>
                          <span className="text-[13px] font-medium text-[var(--tinte)] flex-1">{b.name}</span>
                          <span className="text-[13px] font-mono text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded px-1.5 py-0.5" title={t("wiz.override.defaultTitle")}>
                            {demandSlots.map(sl => getDemand(b.name, sl.type)).join("/")}
                          </span>
                          <button onClick={() => setExpandedEntity(open ? null : key)} className={`flex items-center gap-1 text-[13px] font-medium px-2 py-1 rounded-lg border transition-colors ${open ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:border-[var(--akzent)]"}`}>
                            <Clock size={11}/> {t("wiz.override.configLabel")}
                            <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`}/>
                          </button>
                          <button onClick={() => { if (open)
                        setExpandedEntity(null); removeBereich(bereiche.indexOf(b)); }} className="p-1 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                        {open && (<div className="px-3 pb-3">
                            <EntityShiftConfig name={b.name} slots={demandSlots} getDemand={getDemand} setDemand={setDemand} getOverride={getOverride} setOverride={setOverride} t={t}/>
                          </div>)}
                      </div>);
                })}
                </div>)}

              <div className="border border-[var(--linie)] rounded-xl p-4 space-y-3">
                <input type="text" value={newBereichName} onChange={e => setNewBereichName(e.target.value)} onKeyDown={e => e.key === "Enter" && addBereich()} placeholder={t("wiz.bereiche.namePlaceholder")} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)]"/>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {COLORS.slice(0, 5).map(c => (<button key={c} onClick={() => setNewBereichColor(c)} className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110" style={{ background: c, borderColor: newBereichColor === c ? "var(--tinte)" : "transparent" }}/>))}
                  </div>
                  <button onClick={addBereich} disabled={!newBereichName.trim()} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-40" style={{ background: "var(--tinte)" }}>
                    <Plus size={13}/> {t("wiz.add")}
                  </button>
                </div>
              </div>
            </div>)}

          
          {stepKey === "mitarbeiter" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.mitarbeiter.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-6">
                {t("wiz.mitarbeiter.introPre")} <strong className="text-[var(--tinte)]">{t("nav.mitarbeiter")}</strong> {t("wiz.mitarbeiter.introSuffix")}
              </p>
              <div className="p-4 rounded-xl bg-[var(--papier-tief)] border border-[var(--linie)]">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 20 }}>group_add</span>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.mitarbeiter.howTitle")}</div>
                    <p className="text-[13px] text-[var(--tinte-matt)]">
                      {t("wiz.mitarbeiter.howPre")} <em>{t("wiz.mitarbeiter.inviteLink")}</em> {t("wiz.mitarbeiter.howMid")} <em>{t("wiz.mitarbeiter.vacationLink")}</em> {t("wiz.mitarbeiter.howSuffixPre")} <strong>{t("wiz.mitarbeiter.extraVacation")}</strong> {t("wiz.mitarbeiter.howSuffix")}
                    </p>
                  </div>
                </div>
              </div>
              {plan === "praxis" && erkanntePersonen.length > 0
                ? <ErkanntePersonen personen={erkanntePersonen} onChange={setErkanntePersonen}/>
                : <p className="text-[13px] text-[var(--tinte-leise)] mt-4">{t("wiz.mitarbeiter.noAction")}</p>}
            </div>)}

          
          {stepKey === "lohn" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.lohn.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
                {t("wiz.lohn.introPre")} <strong>{t("wiz.lohn.wholeFacility")}</strong> {t("wiz.lohn.introSuffix")}
              </p>
              <p className="text-[13px] text-[var(--tinte-matt)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2 mb-5">
                {t("wiz.lohn.noticePre")} <strong>{t("wiz.lohn.autoLabel")}</strong> {t("wiz.lohn.noticeSuffix")}
              </p>

              <div className="space-y-3">
                <button onClick={() => { setPayrollAuto(true); persist({ payrollAuto: true }); }} className={`w-full text-left p-4 rounded-xl border-2 transition ${payrollAuto ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:border-[#c7d2fe]"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--akzent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap size={14} className="text-white"/>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px] text-[var(--tinte)] mb-0.5 flex items-center gap-1.5">
                        {t("wiz.lohn.autoTitle")}
                      </div>
                      <div className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.lohn.autoDesc")}</div>
                    </div>
                    {payrollAuto && <Check size={16} className="text-[var(--akzent)] flex-shrink-0 mt-1"/>}
                  </div>
                </button>

                <button onClick={() => { setPayrollAuto(false); persist({ payrollAuto: false }); }} className={`w-full text-left p-4 rounded-xl border-2 transition ${!payrollAuto ? "border-[var(--tinte)] bg-[var(--papier-tief)]" : "border-[var(--linie)] hover:border-[var(--linie)]"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--tinte)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Settings size={14} className="text-white"/>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px] text-[var(--tinte)] mb-0.5">{t("wiz.lohn.laterTitle")}</div>
                      <div className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.lohn.laterDesc")}</div>
                    </div>
                    {!payrollAuto && <Check size={16} className="text-[var(--tinte)] flex-shrink-0 mt-1"/>}
                  </div>
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-[var(--linie)]">
                <label htmlFor="onboardingwizard-ratelabel" className="block text-[13px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.lohn.rateLabel")}</label>
                <p className="text-[13px] text-[var(--tinte-matt)] mb-2">{t("wiz.lohn.rateHint")}</p>
                <div className="flex items-center gap-2 max-w-[200px]">
                  <input id="onboardingwizard-ratelabel" type="number" min={0} step={0.01} value={defaultHourlyRate} onChange={e => setDefaultHourlyRate(e.target.value)} placeholder="z.B. 18.50" className="flex-1 px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">€/h</span>
                </div>

                <label htmlFor="onboardingwizard-surchargeslabel" className="block text-[13px] font-semibold text-[var(--tinte)] mt-5 mb-1">{t("wiz.lohn.surchargesLabel")}</label>
                <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">{t("wiz.lohn.surchargesHint")}</p>
                <div className="grid grid-cols-2 gap-3 max-w-[360px]">
                  <div>
                    <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("wiz.lohn.weekend")}</span>
                    <div className="flex items-center gap-1.5">
                      <input id="onboardingwizard-surchargeslabel" type="number" min={0} max={200} step={1} value={defaultWeekendPct} onChange={e => setDefaultWeekendPct(e.target.value)} placeholder="z.B. 25" className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                      <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("wiz.lohn.holiday")}</span>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} max={200} step={1} value={defaultHolidayPct} onChange={e => setDefaultHolidayPct(e.target.value)} placeholder="z.B. 100" className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                      <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                    </div>
                  </div>
                </div>

                
                <label className="mt-5 flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: oncallPayEnabled ? "var(--akzent)" : "var(--linie)", backgroundColor: oncallPayEnabled ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.lohn.oncallLabel")}</p>
                    <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("wiz.lohn.oncallHint")}</p>
                  </div>
                  <Schalter an={oncallPayEnabled} onClick={() => setOncallPayEnabled(v => !v)}/>
                </label>

                {oncallPayEnabled && (<div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 max-w-[360px]">
                      <div>
                        <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("wiz.lohn.oncallStandbyPct")}</span>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} max={100} step={1} value={oncallStandbyPct} onChange={e => setOncallStandbyPct(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                          <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                        </div>
                        <p className="text-[13px] text-[var(--tinte-leise)] mt-1">{t("wiz.lohn.oncallStandbyHint")}</p>
                      </div>
                      <div>
                        <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("wiz.lohn.oncallHours")}</span>
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={1} max={24} step={0.5} value={oncallHoursPerDay} onChange={e => setOncallHoursPerDay(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                          <span className="text-[13px] text-[var(--tinte-matt)]">h</span>
                        </div>
                        <p className="text-[13px] text-[var(--tinte-leise)] mt-1">{t("wiz.lohn.oncallHoursHint")}</p>
                      </div>
                    </div>
                    <div className="max-w-[174px]">
                      <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("wiz.lohn.oncallWorkPct")}</span>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={0} max={200} step={1} value={oncallWorkPct} onChange={e => setOncallWorkPct(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                        <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                      </div>
                      <p className="text-[13px] text-[var(--tinte-leise)] mt-1">{t("wiz.lohn.oncallWorkHint")}</p>
                    </div>
                    {(() => {
                    const rate = parseFloat(defaultHourlyRate);
                    const pct = parseFloat(oncallStandbyPct);
                    const hrs = parseFloat(oncallHoursPerDay);
                    if (!(rate > 0) || !(pct >= 0) || !(hrs > 0))
                        return null;
                    const eur = (rate * (pct / 100) * hrs).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (<p className="text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2">
                          <strong>{t("wiz.lohn.oncallExample")}:</strong> {hrs} h × {pct} % × {rate.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/h = <strong>{eur} €</strong>
                        </p>);
                })()}
                  </div>)}
              </div>
            </div>)}

          
          {stepKey === "springer" && (<div className="p-8 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[18px] font-semibold text-[var(--tinte)]">{t("wiz.springer.title")}</h2>
              </div>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
                {t("wiz.springer.intro")}
              </p>
              <p className="text-[13px] text-[var(--tinte-matt)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2 mb-6">
                {t("wiz.springer.notice")}
              </p>
              <div className="space-y-3">
                <button onClick={() => setSpringerEnabled(true)} className={`w-full text-left p-4 rounded-xl border-2 transition ${springerEnabled ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:border-[#c7d2fe]"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--akzent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap size={14} className="text-white"/>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px] text-[var(--tinte)] mb-0.5">{t("wiz.springer.enableTitle")}</div>
                      <div className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.springer.enableDesc")}</div>
                    </div>
                    {springerEnabled && <Check size={16} className="text-[var(--akzent)] flex-shrink-0 mt-1"/>}
                  </div>
                </button>
                <button onClick={() => setSpringerEnabled(false)} className={`w-full text-left p-4 rounded-xl border-2 transition ${!springerEnabled ? "border-[var(--tinte)] bg-[var(--papier-tief)]" : "border-[var(--linie)] hover:border-[var(--linie)]"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--tinte)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Settings size={14} className="text-white"/>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px] text-[var(--tinte)] mb-0.5">{t("wiz.springer.laterTitle")}</div>
                      <div className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.springer.laterDesc")}</div>
                    </div>
                    {!springerEnabled && <Check size={16} className="text-[var(--tinte)] flex-shrink-0 mt-1"/>}
                  </div>
                </button>
              </div>

              
              <label className="mt-4 flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: scheduleSpringerEnabled ? "var(--akzent)" : "var(--linie)", backgroundColor: scheduleSpringerEnabled ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.springer.scheduleTitle")}</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                    {t("wiz.springer.scheduleDesc")}
                  </p>
                </div>
                <Schalter an={scheduleSpringerEnabled} onClick={() => setScheduleSpringerEnabled(v => !v)}/>
              </label>

              
              <label className="mt-3 flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: availabilityEnabled ? "#0d9488" : "var(--linie)", backgroundColor: availabilityEnabled ? "#f0fdfa" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.springer.availTitle")}</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                    {t("wiz.springer.availDesc")}
                  </p>
                </div>
                <Schalter an={availabilityEnabled} onClick={() => setAvailabilityEnabled(v => !v)}/>
              </label>

              
              {isDemoCode && (<div className="mt-6 pt-5 border-t border-[var(--linie)]">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]">{t("wiz.springer.demoBadge")}</span>
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.springer.demoTitle")}</p>
                  </div>
                  <p className="text-[13px] text-[var(--tinte-matt)] mb-4">
                    {t("wiz.springer.demoText")}
                  </p>
                  {testEmailSent ? (<div className="flex items-start gap-2 text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2.5">
                      <Check size={15} className="flex-shrink-0 mt-0.5"/>
                      <div>
                        <p className="font-semibold">{t("wiz.springer.testSent")}</p>
                        <button type="button" onClick={() => { setTestEmailSent(false); setTestEmail(""); }} className="mt-1 text-[13px] underline underline-offset-2 hover:no-underline">
                          {t("wiz.springer.testAgain")}
                        </button>
                      </div>
                    </div>) : (<form onSubmit={e => { e.preventDefault(); sendTestAgencyEmail(); }} className="flex gap-2">
                      <input type="email" required value={testEmail} onChange={e => { setTestEmail(e.target.value); setTestEmailError(""); }} placeholder={t("wiz.springer.emailPlaceholder")} className="flex-1 px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier-tief)] focus:bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]"/>
                      <button type="submit" disabled={testEmailSending || !testEmail.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:bg-[var(--tinte-leise)] text-white text-[13px] font-semibold rounded-lg flex-shrink-0 transition-colors">
                        {testEmailSending ? t("wiz.springer.sendingTest") : t("wiz.springer.sendTest")}
                      </button>
                    </form>)}
                  {testEmailError && (<p className="mt-2 text-[13px] text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2">{testEmailError}</p>)}
                </div>)}
            </div>)}

          
          {stepKey === "praxisKi" && (<PraxisKiSchritt beschreibung={praxisBeschreibung} setBeschreibung={setPraxisBeschreibung} plan={praxisPlan} setPlan={setPraxisPlan} uebernommen={kiUebernommen} onUebernehmen={rasterUebernehmen}/>)}

          {stepKey === "zeiten" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.zeiten.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
                {t("wiz.zeiten.intro")}
              </p>
              <div className="flex items-start gap-2 mb-6 text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2">
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>info</span>
                <span>{t("wiz.zeiten.infoPre")} <strong>{t("wiz.areasLabel")}</strong> {t("wiz.and")} <strong>{t("wiz.doctorsLabel")}</strong> {t("wiz.zeiten.infoSuffix")}</span>
              </div>
              <div className="space-y-3">
                {shiftTimes.map((s, i) => (<div key={i} className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }}/>
                    <input type="text" value={s.name} onChange={e => setShiftTimes(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                    <input type="time" value={s.start} onChange={e => setShiftTimes(prev => prev.map((x, idx) => idx === i ? { ...x, start: e.target.value } : x))} className="px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                    <span className="text-[var(--tinte-leise)] text-[13px]">–</span>
                    <input type="time" value={s.end} onChange={e => setShiftTimes(prev => prev.map((x, idx) => idx === i ? { ...x, end: e.target.value } : x))} className="px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] focus:outline-none focus:border-[var(--akzent)] bg-[var(--papier)]"/>
                    {shiftTimes.length > 1 && (<button onClick={() => setShiftTimes(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors flex-shrink-0">
                        <Trash2 size={13}/>
                      </button>)}
                  </div>))}
              </div>
              
              {(() => {
                const byType = new Map<string, string[]>();
                for (const s of shiftTimes) {
                    const ty = shiftTypeFromStart(s.start, s.end);
                    byType.set(ty, [...(byType.get(ty) ?? []), s.name || "—"]);
                }
                const clashes = [...byType.values()].filter(names => names.length > 1);
                if (clashes.length === 0)
                    return null;
                return (<div className="mt-4 rounded-lg border border-[var(--linie)] bg-[var(--warnung-flaeche)] px-3 py-2.5 text-[13px] text-[var(--warnung)]">
                    <p className="font-semibold mb-1">Diese Schichten fallen zusammen</p>
                    {clashes.map((names, i) => (<p key={i} className="leading-relaxed">
                        {names.join(" + ")} starten im selben Zeitfenster. Geplant wird nur{" "}
                        <strong>{names[0]}</strong>, die übrigen werden nicht angelegt.
                      </p>))}
                    <p className="mt-1.5 text-[13px] text-[var(--warnung)]">
                      Der Dienstplan unterscheidet aktuell nur Früh (05–14 Uhr), Spät (14–21 Uhr) und
                      Nacht (21–05 Uhr) — jeweils nach der Startzeit. Mehrere Schichten pro Fenster
                      (z.&nbsp;B. Früh 1 und Früh 2) sind noch nicht möglich.
                    </p>
                  </div>);
            })()}
              {!shiftTimes.some(s => shiftTypeFromStart(s.start, s.end) === "nacht") && (<button type="button" onClick={() => setShiftTimes(prev => [...prev, { name: plan === "praxis" ? "Nachtdienst" : "Nachtschicht", start: "22:00", end: "06:00" }])} className="mt-3 mr-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] transition-colors">
                  <Plus size={13}/> Nachtschicht hinzufügen
                </button>)}
              {shiftTimes.length < 5 && (<button onClick={() => setShiftTimes(prev => [...prev, { name: `${t("wiz.zeiten.newShiftName")} ${prev.length + 1}`, start: "08:00", end: "16:00" }])} className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: "var(--tinte)" }}>
                  <Plus size={13}/> {t("wiz.zeiten.add")}
                </button>)}
              <p className="text-[13px] text-[var(--tinte-leise)] mt-4">{t("wiz.zeiten.hint")}</p>

              
              {plan === "praxis" && demandSlots.length > 0 && (<div className="mt-6 pt-5 border-t border-[var(--linie)]">
                  <h3 className="text-[15px] font-semibold text-[var(--tinte)] mb-1">Wochentage und Besetzung</h3>
                  <p className="text-[13px] text-[var(--tinte-matt)] mb-3">
                    An welchen Tagen findet welche Schicht statt, wie viele Ärztinnen und Ärzte und wie viele
                    aus dem Praxisteam arbeiten regulär, und ab wann sucht Nurvo bei einer Krankmeldung Ersatz? Liegt die Besetzung noch auf oder über dem
                    zweiten Wert, wird niemand behelligt.
                  </p>
                  <Wochenraster schichten={demandSlots.map(sl => ({ name: sl.name, start: sl.defStart, end: sl.defEnd, art: sl.type }))} geschlossen={closedSlots} turnus={turnus} bedarf={art => getDemand(praxisEinheit, art)} mindestens={art => replacementMin[art] ?? null} aerzte={art => getPraxisAerzte(praxisEinheit, art)} onAerzte={(art, n) => setDoctors(praxisEinheit, art, n)} onToggle={toggleClosed} onBedarf={(art, n) => setDemand(praxisEinheit, art, n)} onMindestens={(art, n) => setReplacementMin(prev => ({ ...prev, [art]: n }))}/>
                  {(() => {
                    const zeilen = WOCHENTAGE.flatMap(wt => demandSlots
                        .map(sl => ({ wt, sl, t: (closedSlots[String(wt.dow)] ?? []).includes(sl.type) ? null : turnus[String(wt.dow)]?.[sl.type as Schichtart] }))
                        .filter(z => z.t));
                    if (!zeilen.length)
                        return null;
                    const datum = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
                    return (<div className="mt-4 space-y-1.5">
                        {zeilen.map(({ wt, sl, t }) => {
                            let naechster = t!.ab;
                            const heute = naechsterWochentag(wt.dow);
                            while (naechster < heute)
                                naechster = addDaysISO(naechster, 7 * t!.alle);
                            return (<div key={`${wt.dow}-${sl.type}`} className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--tinte-matt)]">
                              <strong className="text-[var(--tinte)]">{wt.name} · {sl.name}</strong>
                              <select aria-label={`${wt.name} ${sl.name}: Turnus`} value={t!.alle} onChange={e => {
                                    const alle = Number(e.target.value);
                                    setTurnus(prev => ({ ...prev, [String(wt.dow)]: { ...prev[String(wt.dow)], [sl.type]: { ...t!, alle } } }));
                                }} className="px-1.5 py-0.5 rounded-md border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]">
                                {[2, 3, 4].map(n => <option key={n} value={n}>alle {n} Wochen</option>)}
                              </select>
                              <span>nächster Termin {datum(naechster)}</span>
                              <button type="button" onClick={() => turnusVerschieben(wt.dow, sl.type as Schichtart)} className="text-[var(--akzent)] font-medium hover:underline">eine Woche später</button>
                            </div>);
                        })}
                      </div>);
                })()}
                  <Personalbedarf raster={{
                    schichten: demandSlots.map(sl => ({
                        start: sl.defStart, end: sl.defEnd, art: sl.type,
                        bedarf: getDemand(praxisEinheit, sl.type), mindestens: replacementMin[sl.type] ?? null,
                        aerzte: getPraxisAerzte(praxisEinheit, sl.type),
                    })),
                    geschlossen: closedSlots, zeitenJeTag: dayShiftTimes, turnus, mittagspause, besetzungJeTag,
                }}/>
                  <TagesBesetzung schichten={demandSlots.map(sl => ({
                    art: sl.type, name: sl.name, bedarf: getDemand(praxisEinheit, sl.type),
                    mindestens: replacementMin[sl.type] ?? null, aerzte: getPraxisAerzte(praxisEinheit, sl.type),
                }))} besetzung={besetzungJeTag} geschlossen={closedSlots} onChange={setBesetzungJeTag}/>
                  {demandSlots.some(sl => sl.type === "frueh") && demandSlots.some(sl => sl.type === "spaet") && (<Mittagspause wert={mittagspause} onChange={setMittagspause}/>)}
                  <Tageszeiten schichten={demandSlots.map(sl => ({ art: sl.type, name: sl.name, start: sl.defStart, end: sl.defEnd }))} zeiten={dayShiftTimes} onChange={setDayShiftTimes}/>
                </div>)}
            </div>)}

          

          
          {stepKey === "planung" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.planung.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-6">{t("wiz.planung.intro")}</p>

              <div className="space-y-4">
                
                <div className="p-4 rounded-xl border-2" style={{ borderColor: fullAutomation ? "var(--akzent)" : "var(--linie)", background: fullAutomation ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                  <label className="flex items-center justify-between gap-4 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--akzent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Zap size={14} className="text-white"/>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-[var(--tinte)]">{t("wiz.planung.fullAutoTitle")}</span>
                          {!isDemoCode && (<span className="text-[13px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--akzent)] text-white">{t("wiz.planung.fullAutoRecommended")}</span>)}
                        </div>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("wiz.planung.fullAutoDesc")}</p>
                      </div>
                    </div>
                    <Schalter an={fullAutomation} onClick={() => setFullAutomation(!fullAutomation)}/>
                  </label>
                </div>
                <p className="text-[13px] text-[var(--tinte-leise)] -mt-2">{t("wiz.planung.fullAutoHint")}</p>

                
                <div className="p-4 rounded-xl border border-[var(--linie)]">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.pauseLabel")}</span>
                    <div className="flex items-center gap-1 px-3 py-1 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg">
                      <span className="text-[14px] font-semibold text-[var(--akzent)]">{pauseThreshold}</span>
                      <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.unit.min")}.</span>
                    </div>
                  </div>
                  <p className="text-[13px] text-[var(--tinte-matt)] mb-2">{t("wiz.planung.pauseHint")}</p>
                  <input type="range" min={5} max={60} step={5} value={pauseThreshold} onChange={e => setPauseThreshold(Number(e.target.value))} className="w-full accent-[var(--akzent)]"/>
                </div>

                
                <div className="p-4 rounded-xl border border-[var(--linie)]">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.overtimeLimitLabel")}</span>
                    <div className="flex items-center gap-1 px-3 py-1 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg">
                      <span className="text-[14px] font-semibold text-[var(--akzent)]">{overtimeLimitPct}</span>
                      <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                    </div>
                  </div>
                  <p className="text-[13px] text-[var(--tinte-matt)] mb-2">{t("wiz.planung.overtimeLimitHint")}</p>
                  <input type="range" min={5} max={50} step={5} value={overtimeLimitPct} onChange={e => setOvertimeLimitPct(Number(e.target.value))} className="w-full accent-[var(--akzent)]"/>
                </div>

                
                <div className="p-4 rounded-xl border border-[var(--linie)]">
                  <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.compLabel")}</span>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 mb-2.5">{t("wiz.planung.compHint")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["payout", t("wiz.planung.payoutTitle"), t("wiz.planung.payoutDesc")], ["vacation", t("wiz.planung.vacationTitle"), t("wiz.planung.vacationDesc")]] as const).map(([val, label, desc]) => (<button key={val} type="button" onClick={() => setOvertimeCompensation(val)} className={`text-left p-3 rounded-xl border transition-colors ${overtimeCompensation === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                        <p className="text-[13px] font-semibold text-[var(--tinte)]">{label}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{desc}</p>
                      </button>))}
                  </div>
                  {overtimeCompensation === "vacation" && (<div className="flex items-center gap-2 mt-3">
                      <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.planung.hoursPerDayLabel")}</span>
                      <input type="number" min={1} max={24} step={0.5} value={overtimeHoursPerDay} onChange={e => setOvertimeHoursPerDay(Math.max(1, Math.min(24, Number(e.target.value) || 8)))} className="w-20 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                      <span className="text-[13px] text-[var(--tinte-matt)]">{t("wiz.planung.hoursPerDaySuffix")}</span>
                    </div>)}
                </div>

                
                <div className="p-4 rounded-xl border border-[var(--linie)]">
                  <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.rebalanceLabel")}</span>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 mb-2.5">{t("wiz.planung.rebalanceHint")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                ["off", t("wiz.planung.rebOffTitle"), t("wiz.planung.rebOffDesc")],
                ["suggest", t("wiz.planung.rebSuggestTitle"), t("wiz.planung.rebSuggestDesc")],
                ["auto", t("wiz.planung.rebAutoTitle"), t("wiz.planung.rebAutoDesc")],
            ] as const).map(([val, label, desc]) => (<button key={val} type="button" onClick={() => setOvertimeRebalanceMode(val)} className={`text-left p-3 rounded-xl border transition-colors ${overtimeRebalanceMode === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                        <p className="text-[13px] font-semibold text-[var(--tinte)]">{label}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{desc}</p>
                      </button>))}
                  </div>
                </div>

                
                <div className="p-4 rounded-xl border border-[var(--linie)]">
                  <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.swapLabel")}</span>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 mb-2.5">{t("wiz.planung.swapHint")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                ["manual", t("wiz.planung.swapManualTitle"), t("wiz.planung.swapManualDesc")],
                ["automatic", t("wiz.planung.swapAutoTitle"), t("wiz.planung.swapAutoDesc")],
            ] as const).map(([val, label, desc]) => (<button key={val} type="button" onClick={() => setShiftSwapMode(val)} className={`text-left p-3 rounded-xl border transition-colors ${shiftSwapMode === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                        <p className="text-[13px] font-semibold text-[var(--tinte)]">{label}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{desc}</p>
                      </button>))}
                  </div>
                </div>

                
                <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: understaffingMode === "auto" ? "var(--akzent)" : "var(--linie)", backgroundColor: understaffingMode === "auto" ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.understaffTitle")}</p>
                    <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                      {understaffingMode === "auto" ? t("wiz.planung.understaffOn") : t("wiz.planung.understaffOff")}
                      {" " + t("wiz.planung.understaffSuffix")}
                    </p>
                  </div>
                  <Schalter an={understaffingMode === "auto"} onClick={() => setUnderstaffingMode(m => (m === "auto" ? "popup" : "auto"))}/>
                </label>

                
                <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: autoScheduling ? "var(--akzent)" : "var(--linie)", backgroundColor: autoScheduling ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.autoSchedTitle")}</p>
                    <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("wiz.planung.autoSchedDesc")}</p>
                  </div>
                  <Schalter an={autoScheduling} onClick={() => setAutoScheduling(v => !v)}/>
                </label>

                
                {autoScheduling && (<div className="p-4 rounded-xl border border-[var(--linie)]">
                    <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.planung.vorlaufTitle")}</span>
                    <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 mb-3">{t("wiz.planung.vorlaufHint")}</p>

                    {([
                    { key: "reminder" as const, label: t("wiz.planung.reminderLabel"), wert: wishReminderDays, min: 3, max: MAX_ERINNERUNG_TAGE,
                        setzen: (v: number) => { setWishReminderDays(v); if (planCreateDays >= v)
                            setPlanCreateDays(Math.max(1, v - 1)); } },
                    { key: "create" as const, label: t("wiz.planung.createLabel"), wert: planCreateDays, min: 1, max: MAX_PLAN_TAGE,
                        setzen: (v: number) => { setPlanCreateDays(v); if (wishReminderDays <= v)
                            setWishReminderDays(Math.min(MAX_ERINNERUNG_TAGE, v + 1)); } },
                ]).map(reg => (<div key={reg.key} className="mb-3 last:mb-0">
                        <label htmlFor={`onboardingwizard-${reg.key}`} className="flex items-baseline justify-between gap-3 mb-1.5">
                          <span className="text-[13px] font-medium text-[var(--tinte)]">{reg.label}</span>
                          <span className="text-[13px] text-[var(--tinte-matt)]">
                            <strong className="text-[13px] text-[var(--akzent)]">{reg.wert}</strong> {t("wiz.planung.beforeMonth")}
                          </span>
                        </label>
                        <input id={`onboardingwizard-${reg.key}`} type="range" min={reg.min} max={reg.max} step={1} value={reg.wert} onChange={e => reg.setzen(Number(e.target.value))} aria-label={`${reg.label} — ${t("wiz.planung.beforeMonth")}`} className="w-full accent-[var(--akzent)]"/>
                      </div>))}

                    
                    {(() => {
                    const m = monatsbeginnNach(new Date(), 1);
                    const tag = (tage: number) => new Date(m.jahr, m.monat - 1, 1 - tage).toLocaleDateString(locale, { day: "numeric", month: "long" });
                    const monatsName = new Date(m.jahr, m.monat - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
                    return (<p className="text-[13px] text-[var(--tinte-leise)] mt-2 pt-2 border-t border-[var(--linie)]">
                          {monatsName} — {t("wiz.planung.exampleReminder")} {tag(wishReminderDays)}, {t("wiz.planung.examplePlan")} {tag(planCreateDays)}.
                        </p>);
                })()}
                  </div>)}
              </div>
            </div>)}

          
          {stepKey === "datenschutz" && (<div className="p-8 overflow-y-auto flex-1">
              <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.datenschutz.title")}</h2>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-5">{t("wiz.datenschutz.intro")}</p>

              
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-[var(--akzent)]"/>
                  <span className="text-[13px] font-semibold text-[var(--tinte)]">{t("wiz.datenschutz.encTitle")}</span>
                </div>
                <div className="space-y-2">
                  {[
                { icon: "lock", label: t("wiz.datenschutz.transferLabel"), value: t("wiz.datenschutz.transferValue") },
                { icon: "storage", label: t("wiz.datenschutz.storageLabel"), value: t("wiz.datenschutz.storageValue") },
                { icon: "folder", label: t("wiz.datenschutz.localLabel"), value: t("wiz.datenschutz.localValue") },
                { icon: "verified_user", label: t("wiz.datenschutz.standardLabel"), value: t("wiz.datenschutz.standardValue") },
            ].map(item => (<div key={item.label} className="flex items-center gap-3 py-2 border-b border-[var(--linie)] last:border-0">
                      <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>{item.icon}</span>
                      <span className="text-[13px] text-[var(--tinte-matt)] w-28 flex-shrink-0">{item.label}</span>
                      <span className="text-[13px] text-[var(--tinte)]">{item.value}</span>
                    </div>))}
                </div>
              </div>

              
              <div className="p-4 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <BarChart2 size={16} className="text-[var(--akzent)] mt-0.5 flex-shrink-0"/>
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.datenschutz.analyticsTitle")}</div>
                      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">
                        {t("wiz.datenschutz.analyticsPre")} <strong className="text-[var(--tinte)]">{t("wiz.datenschutz.analyticsBold")}</strong>.
                        {" " + t("wiz.datenschutz.analyticsSuffix")}
                      </p>
                    </div>
                  </div>
                  <Schalter an={analyticsEnabled} name={t("wiz.datenschutz.analyticsTitle")} onClick={() => setAnalyticsState(v => !v)}/>
                </div>
                <p className="text-[13px] text-[var(--tinte-leise)] mt-2 ml-7">
                  {t("wiz.datenschutz.footnote")}
                </p>
              </div>

              
              <div className="mt-4 p-4 rounded-xl border border-[var(--linie)] bg-[var(--papier)]">
                <div className="flex items-start gap-3">
                  <Users size={16} className="text-[var(--akzent)] mt-0.5 flex-shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--tinte)] mb-1">{t("wiz.datenschutz.brTitle")}</div>
                    <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">{t("wiz.datenschutz.brText")}</p>
                    <label className="flex items-start gap-2 mt-3 cursor-pointer">
                      <input type="checkbox" checked={brAcknowledged} onChange={e => { setBrAcknowledged(e.target.checked); persist({ brAcknowledged: e.target.checked }); }} className="mt-0.5 w-4 h-4 accent-[var(--akzent)] flex-shrink-0"/>
                      <span className="text-[13px] text-[var(--tinte)] leading-relaxed">{t("wiz.datenschutz.brConfirm")}</span>
                    </label>
                    <p className="text-[13px] text-[var(--tinte-leise)] mt-2">
                      {t("wiz.datenschutz.brHint")}{" "}
                      <a href="/ki-transparenz" target="_blank" rel="noreferrer" className="text-[var(--akzent)] hover:underline">
                        nurvo.de/ki-transparenz
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {error && (<div className="mt-4 p-3 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{error}</div>)}
            </div>)}

          
          <div className="flex items-center justify-between px-8 pb-7 pt-2">
            <div className="flex items-center gap-4">
              <button onClick={goBack} disabled={step === 0} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors disabled:opacity-0">
                <ChevronLeft size={14}/> {t("common.back")}
              </button>
              {step > 0 && (<button onClick={() => setShowSkipModal(true)} disabled={submitting} className="text-[13px] text-[var(--tinte-leise)] hover:text-[var(--tinte-leise)] transition-colors disabled:opacity-40">
                  {t("wiz.skip")}
                </button>)}
            </div>

            {isLastStep ? (<button onClick={complete} disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-60" style={{ background: "var(--akzent)" }}>
                {submitting ? (<span className="flex items-center gap-2"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>{t("wiz.setup.submitting")}</span>) : (<><Check size={14}/> {t("wiz.setup.complete")}</>)}
              </button>) : (<button onClick={goNext} disabled={stepKey === "standort" && !bundesland} className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors disabled:opacity-40" style={{ background: "var(--tinte)" }}>
                {t("wiz.next")} <ChevronRight size={14}/>
              </button>)}
          </div>
        </div>

        
        <p className="text-center text-[13px] text-[var(--tinte-leise)] mt-4">
          <Wortmarke className="font-semibold text-[var(--tinte-leise)]"/> · {t("wiz.footer")}
        </p>
      </div>

      
      <Modal open={showSkipModal} onClose={() => setShowSkipModal(false)} title={t("wiz.skipModal.title")} description={isDemoCode ? t("wiz.skipModal.demoText") : t("wiz.skipModal.normalText")} widthClass="max-w-sm" footer={<>
            <button onClick={() => setShowSkipModal(false)} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
              {t("common.back")}
            </button>
            <button onClick={confirmSkip} disabled={submitting} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--warnung)] hover:bg-[var(--warnung)] transition-colors disabled:opacity-60">
              {submitting ? t("wiz.skipModal.confirming") : t("wiz.skipModal.confirm")}
            </button>
          </>}>
        <p className="text-[13px] text-[var(--warnung)] font-medium">{t("wiz.skipModal.notRecommended")}</p>
      </Modal>
    </div>);
}
function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
function OnboardingFinalizing({ nichtGespeichert }: {
    nichtGespeichert: string[];
}) {
    const router = useRouter();
    const { t, locale } = useLang();
    const [statusText, setStatusText] = useState(t("wiz.final.step0"));
    const [progress, setProgress] = useState(4);
    const [done, setDone] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const HORIZON = 24;
        (async () => {
            const intro = [t("wiz.final.stations"), t("wiz.final.bereiche"), t("wiz.final.shiftTemplates")];
            for (const msg of intro) {
                if (cancelled)
                    return;
                setStatusText(msg);
                await sleep(550);
            }
            const now = new Date();
            for (let m = 0; m < HORIZON; m++) {
                if (cancelled)
                    return;
                const start = new Date(now.getFullYear(), now.getMonth() + m, 1);
                const { from, to } = monatsBereichISO(now.getFullYear(), now.getMonth() + m);
                const label = start.toLocaleDateString(locale, { month: "long", year: "numeric" });
                setStatusText(`${t("wiz.final.scheduleMonth")}${label}`);
                setProgress(Math.round(((m + 1) / HORIZON) * 96) + 4);
                try {
                    await fetch("/api/onboarding/generate-shifts", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ from, to }),
                    });
                }
                catch { }
            }
            if (cancelled)
                return;
            setStatusText(t("wiz.final.done"));
            setProgress(100);
            setDone(true);
            await sleep(900);
            if (!cancelled && nichtGespeichert.length === 0)
                router.push("/dashboard");
        })();
        return () => { cancelled = true; };
    }, []);
    return (<div className="min-h-svh bg-[var(--papier-tief)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--akzent-flaeche)] flex items-center justify-center mx-auto mb-6">
          {done
            ? <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 30, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            : <span className="material-symbols-outlined text-[var(--akzent)] animate-spin" style={{ fontSize: 28 }}>progress_activity</span>}
        </div>
        <h1 className="text-[19px] font-semibold text-[var(--tinte)] mb-2">{t("wiz.final.title")}</h1>
        <p className="text-[var(--tinte-matt)] text-[14px] min-h-[42px]">{statusText}</p>
        <div className="h-2 rounded-full bg-[var(--akzent-flaeche)] overflow-hidden mt-5">
          <div className="h-full rounded-full bg-[var(--akzent)] transition-[width] duration-[240ms]" style={{ width: `${progress}%` }}/>
        </div>
        <p className="text-[13px] text-[var(--tinte-leise)] mt-3">{t("wiz.final.hint")}</p>
        {nichtGespeichert.length > 0 && (<p role="alert" className="mt-5 text-left text-[13px] text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg px-4 py-3">
            {t("wiz.final.notSaved")} <span className="font-mono">{nichtGespeichert.join(", ")}</span>
          </p>)}
        <button onClick={() => router.push("/dashboard")} className="mt-6 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors underline">
          {t("wiz.final.dashboardLink")}
        </button>
      </div>
    </div>);
}

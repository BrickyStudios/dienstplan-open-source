"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { normalizePlan, planFuerNeueEinrichtung, type Plan } from "@/lib/plan";
import BerufAuswahl from "@/components/BerufAuswahl";
import { CalendarDays, Plus, Trash2, Brain, AlertTriangle, ChevronLeft, ChevronRight, Users, Pencil, Check, X, Building2, Heart, CheckCircle, XCircle, Clock, Shield, Sparkles, BarChart2, Layers, LayoutDashboard, } from "lucide-react";
import ExcelImport from "@/components/ExcelImport";
import { PulseLoader } from "@/components/PulseLoader";
import Header from "@/components/Header";
import StationManager from "@/components/StationManager";
import PlanExportMenu, { type ExportTarget } from "@/components/PlanExportMenu";
import { type PlanExportDoc, SHIFT_LABEL_DE, fmtPlanDate, shiftTimeRange } from "@/lib/planExport";
import { useLang } from "@/lib/LanguageContext";
import { useIstPraxis } from "@/lib/PlanContext";
import { checkRuhezeiten } from "@/lib/arbzg";
import { pruefeWeitereArbeitszeit } from "@/lib/arbzg-weitere";
import { toLocalISODate, todayISO } from "@/lib/date";
import { useConfirm } from "@/components/ConfirmProvider";
import { KiLabel, KiDisclosureNote } from "@/components/KiLabel";
type MonthlyAiAdjustments = unknown;
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import Schalter from "@/components/Schalter";
import Modal from "@/components/Modal";
import PraxisRasterAssistent from "@/components/PraxisRasterAssistent";
import type { Fehlzeit } from "@/lib/nichterscheinen";
import { findetStatt, type PraxisRaster, type Turnus } from "@/lib/scheduling/praxis-raster";
import { JOB_TYPES, DEFAULT_HOURS, deriveShiftType, SHIFT_PRESETS, makeDayDefaults, standardTagCfg, generatorAusRaster, STATUS_LABEL, SHIFT_COLORS, complianceColor, weekRange, dateLabel, getMonthRange, getCalendarGrid, DAY_NAMES_SHORT, type Shift, type RebalanceSuggestion, type StaffMember, type StaffWish, type ShiftTypeConfig, type DayConfig } from "./schichtplan-daten";
import StaffAssign from "./StaffAssign";
import { istArzt } from "@/lib/berufe";
import { MONTH_NAMES_DE } from "@/lib/payroll/calculate-payroll";
export default function SchichtplanPage() {
    const { t, locale } = useLang();
    const istPraxis = useIstPraxis();
    const confirm = useConfirm();
    const SHIFT_LABELS: Record<string, string> = {
        frueh: t("mp.shift.early"), spaet: t("mp.shift.late"), nacht: t("mp.shift.night"),
    };
    const WISH_TYPE_LABELS: Record<string, {
        label: string;
        color: string;
    }> = {
        preference: { label: t("wue.preference"), color: "var(--akzent)" },
        avoid: { label: t("wue.avoid"), color: "var(--warnung)" },
        unavailable: { label: t("wue.unavailable"), color: "var(--gefahr)" },
    };
    const WISH_STATUS: Record<string, {
        label: string;
        icon: React.ElementType;
        color: string;
    }> = {
        offen: { label: t("wue.statusOpen"), icon: Clock, color: "var(--tinte-leise)" },
        berücksichtigt: { label: t("wue.statusConsidered"), icon: CheckCircle, color: "var(--ok)" },
        abgelehnt: { label: t("wue.statusRejected"), icon: XCircle, color: "var(--gefahr)" },
    };
    const [subNav, setSubNav] = useState<"dienstplan" | "personal" | "auswertung" | "wuensche">("dienstplan");
    useEffect(() => {
        const zuReiter = (e: Event) => {
            if ((e as CustomEvent).detail === "dienstplan")
                setSubNav("dienstplan");
        };
        window.addEventListener("nurvo-fuehrung-reiter", zuReiter);
        return () => window.removeEventListener("nurvo-fuehrung-reiter", zuReiter);
    }, []);
    const [rebalanceSuggestions, setRebalanceSuggestions] = useState<RebalanceSuggestion[]>([]);
    const [rebalanceBusyId, setRebalanceBusyId] = useState<string | null>(null);
    const [mainTab, setMainTab] = useState<"uebersicht" | "stationen" | string>("uebersicht");
    const [viewMode, setViewMode] = useState<"monat" | "woche">("monat");
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => {
            if (!aktiv)
                return;
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                setViewMode("woche");
            }
        });
        return () => { aktiv = false; };
    }, []);
    const [calYear, setCalYear] = useState(new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(new Date().getMonth());
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [facilityName, setFacilityName] = useState("");
    const [userName, setUserName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [facilities, setFacilities] = useState<string[]>([]);
    const [contextLoaded, setContextLoaded] = useState(false);
    const [userRole, setUserRole] = useState<string>("leitung");
    const [autoSchedulingEnabled, setAutoSchedulingEnabled] = useState(false);
    const [firstPlanGeneratedAt, setFirstPlanGeneratedAt] = useState<string | null>(null);
    const showGenerateButton = userRole === "demo" || firstPlanGeneratedAt === null || !autoSchedulingEnabled;
    const [showPpbv, setShowPpbv] = useState(false);
    const [einrichtungsTyp, setEinrichtungsTyp] = useState<Plan>(planFuerNeueEinrichtung());
    const showLoading = useDelayedLoading(!contextLoaded);
    const [stationFilter, setStationFilter] = useState<string>("");
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const ladeNr = useRef({ shifts: 0, staff: 0, wishes: 0 });
    const [ladeFehler, setLadeFehler] = useState("");
    const [weekOffset, setWeekOffset] = useState(0);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [staffLoading, setStaffLoading] = useState(false);
    const [assignFor, setAssignFor] = useState<string | null>(null);
    const [assignName, setAssignName] = useState("");
    const [assignBusy, setAssignBusy] = useState<string | null>(null);
    const [assignError, setAssignError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        station: "Station 1",
        date: todayISO(),
        start_time: "06:00",
        end_time: "14:00",
        planned_staff: "",
        actual_staff: "",
        notes: "",
        custom_name: "",
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Shift>>({});
    const [editSaving, setEditSaving] = useState(false);
    const [dayEditOpen, setDayEditOpen] = useState(false);
    const [dayEdits, setDayEdits] = useState<Record<string, Partial<Shift>>>({});
    const [dayEditSaving, setDayEditSaving] = useState(false);
    const [dayEditError, setDayEditError] = useState("");
    const [deleting, setDeleting] = useState<string | null>(null);
    const [filling, setFilling] = useState(false);
    const [fillMsg, setFillMsg] = useState("");
    const [showStaffForm, setShowStaffForm] = useState(false);
    const [staffForm, setStaffForm] = useState({ full_name: "", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 });
    const [staffSaving, setStaffSaving] = useState(false);
    const [staffError, setStaffError] = useState("");
    const [deletingStaff, setDeletingStaff] = useState<string | null>(null);
    const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
    const [editingStaffForm, setEditingStaffForm] = useState<Partial<StaffMember>>({});
    const [staffEditSaving, setStaffEditSaving] = useState(false);
    const [wishes, setWishes] = useState<StaffWish[]>([]);
    const [wishesLoading, setWishesLoading] = useState(false);
    const [wishFilter, setWishFilter] = useState<string>("all");
    const [updatingWish, setUpdatingWish] = useState<string | null>(null);
    const [wishView, setWishView] = useState<"liste" | "mitarbeiter">("mitarbeiter");
    const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
    type Optimization = {
        station: string;
        shift_type: string;
        current_planned_staff: number;
        recommended_planned_staff: number;
        recommended_start_time: string | null;
        recommended_end_time: string | null;
        reason: string;
    };
    const [optimizing, setOptimizing] = useState(false);
    const [optimizeResult, setOptimizeResult] = useState<{
        summary: string;
        optimizations: Optimization[];
    } | null>(null);
    const [optimizeError, setOptimizeError] = useState("");
    const [applying, setApplying] = useState(false);
    const [applyDone, setApplyDone] = useState(false);
    const [applyResult, setApplyResult] = useState<{
        effective: string;
        notified: number;
        updated: number;
    } | null>(null);
    const [selectedOpts, setSelectedOpts] = useState<Set<number>>(new Set());
    const [kiIsDemo, setKiIsDemo] = useState(false);
    const [kiDemoUsesLeft, setKiDemoUsesLeft] = useState(2);
    const [kiRecommendationId, setKiRecommendationId] = useState<string | null>(null);
    const [kiRejecting, setKiRejecting] = useState(false);
    const [kiIsDemoExample, setKiIsDemoExample] = useState(false);
    type PlanAssignment = {
        shift_id: string;
        shift_date: string;
        shift_type: string;
        station: string;
        staff_id: string;
        staff_name: string;
        score: number;
        reason: string;
        is_overtime?: boolean;
        understaffing_decision?: string;
    };
    type SpringerAssignment = {
        date: string;
        staff_id: string;
        staff_name: string;
        shift_type: string | null;
    };
    type PlanStats = {
        total_slots: number;
        filled: number;
        unfilled: number;
        staff_count: number;
        wish_count: number;
        burnout_warnings: string[];
    };
    type UnfilledSlot = {
        shift_id: string;
        shift_date: string;
        shift_type: string;
        station: string;
        slots_needed: number;
        slots_filled: number;
        slots_missing: number;
        overtime_candidates: Array<{
            staff_id: string;
            staff_name: string;
            score: number;
            reason: string;
        }>;
    };
    type ContractWarning = {
        staff_id: string;
        staff_name: string;
        rule: string;
        detail: string;
        date?: string;
    };
    type PendingUnderstaffingData = {
        assignments: PlanAssignment[];
        springer_assignments?: SpringerAssignment[];
        unfilled_slots: UnfilledSlot[];
        stats: PlanStats;
        contract_warnings?: ContractWarning[];
        fromCache?: boolean;
        cachedAt?: string;
    };
    const [planGenerating, setPlanGenerating] = useState(false);
    const [planResult, setPlanResult] = useState<{
        assignments: PlanAssignment[];
        springer_assignments?: SpringerAssignment[];
        stats: PlanStats;
        contract_warnings?: ContractWarning[];
        fromCache?: boolean;
        cachedAt?: string;
    } | null>(null);
    const [planError, setPlanError] = useState("");
    const [planSaving, setPlanSaving] = useState(false);
    const [planSaved, setPlanSaved] = useState(false);
    const [kiAnpassungen, setKiAnpassungen] = useState<MonthlyAiAdjustments | null>(null);
    const [zeroDemandFix, setZeroDemandFix] = useState<{
        from: string;
        to: string;
        station: string | null;
    } | null>(null);
    const [fixingDemand, setFixingDemand] = useState(false);
    const [pendingUnderstaffing, setPendingUnderstaffing] = useState<PendingUnderstaffingData | null>(null);
    const [slotDecisions, setSlotDecisions] = useState<Record<string, "overtime" | "understaffed">>({});
    const [planYear, setPlanYear] = useState(new Date().getFullYear());
    const [planMonth, setPlanMonth] = useState(new Date().getMonth());
    const [assignmentsByShift, setAssignmentsByShift] = useState<Record<string, string[]>>({});
    const [fehlzeitenByShift, setFehlzeitenByShift] = useState<Record<string, Fehlzeit[]>>({});
    const [springerByDate, setSpringerByDate] = useState<Record<string, string[]>>({});
    const [stationOptions, setStationOptions] = useState<{
        id: string;
        name: string;
        color: string;
    }[]>([]);
    const [customPresets, setCustomPresets] = useState<{
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        color: string;
    }[]>([]);
    const [showGeneratorModal, setShowGeneratorModal] = useState(false);
    const [genConfigMode, setGenConfigMode] = useState<"alle" | "pro-tag">("alle");
    const [genAlleConfig, setGenAlleConfig] = useState<DayConfig>(() => standardTagCfg());
    const [genProTagConfig, setGenProTagConfig] = useState<Record<string, DayConfig>>(() => makeDayDefaults());
    const praxisVorgabeGesetzt = useRef(false);
    const [praxisTurnus, setPraxisTurnus] = useState<Turnus | null>(null);
    const [showRasterAssistent, setShowRasterAssistent] = useState(false);
    function oeffneGenerator(aktion: "shifts-only" | "staff-only") {
        if (istPraxis && !praxisVorgabeGesetzt.current) {
            praxisVorgabeGesetzt.current = true;
            setGenAlleConfig(standardTagCfg(true));
            setGenProTagConfig(makeDayDefaults(true));
            setGenConfigMode("pro-tag");
            fetch("/api/leitung/praxis-raster").then(r => r.json()).then((j: {
                praxis?: boolean;
                raster?: PraxisRaster;
            }) => {
                if (!j?.praxis || !j.raster?.schichten?.length)
                    return;
                const proTag = generatorAusRaster(j.raster);
                setGenProTagConfig(proTag);
                setGenAlleConfig(proTag["0"]);
                setPraxisTurnus(j.raster.turnus ?? null);
            }).catch(() => { });
        }
        setPlanMonth(calMonth);
        setPlanYear(calYear);
        setGenAction(aktion);
        setShowGeneratorModal(true);
    }
    const [genPerDateConfig, setGenPerDateConfig] = useState<Record<string, DayConfig>>({});
    const [genAction, setGenAction] = useState<"both" | "shifts-only" | "staff-only">("staff-only");
    const [editingConfigDate, setEditingConfigDate] = useState<string | null>(null);
    const range = weekRange(weekOffset);
    const loadStationOptions = useCallback(() => {
        fetch("/api/leitung/stations")
            .then(r => r.json())
            .then(d => {
            const list = d.stations ?? [];
            setStationOptions(list);
            if (list.length > 0) {
                setForm(f => f.station ? f : { ...f, station: list[0].name });
            }
        });
    }, []);
    const refetchStations = useCallback(() => loadStationOptions(), [loadStationOptions]);
    useEffect(() => {
        fetch("/api/leitung/context")
            .then(r => { if (!r.ok)
            throw new Error(String(r.status)); return r.json(); })
            .then(d => {
            setFacilityName(d.facilityName ?? "");
            setUserName(d.userName ?? "");
            setIsAdmin(d.isAdmin ?? false);
            setFacilities(d.facilities ?? []);
            setShowPpbv(d.plan !== "praxis");
            setEinrichtungsTyp(normalizePlan(d.plan ?? null));
            setUserRole(d.role ?? "leitung");
            setAutoSchedulingEnabled(Boolean(d.autoSchedulingEnabled));
            setFirstPlanGeneratedAt(d.firstPlanGeneratedAt ?? null);
            setContextLoaded(true);
        })
            .catch(() => setLadeFehler("Die Einrichtung konnte nicht geladen werden. Bitte die Seite neu laden."));
        loadStationOptions();
        fetch("/api/leitung/shift-templates")
            .then(r => r.json())
            .then(d => {
            const list = d.templates ?? [];
            setCustomPresets(list);
            if (list.length > 0) {
                setForm(f => ({ ...f, start_time: list[0].start_time, end_time: list[0].end_time }));
            }
        });
    }, [loadStationOptions]);
    const loadShifts = useCallback(async () => {
        if (!facilityName || !contextLoaded)
            return;
        const nr = ++ladeNr.current.shifts;
        const aktuell = () => nr === ladeNr.current.shifts;
        setShiftsLoading(true);
        const { from, to } = viewMode === "monat"
            ? getMonthRange(calYear, calMonth)
            : weekRange(weekOffset);
        try {
            const [shiftsRes, assignRes, oncallRes, fehlRes] = await Promise.all([
                fetch(`/api/leitung/shifts?facility=${encodeURIComponent(facilityName)}&from=${from}&to=${to}`),
                fetch(`/api/leitung/generate-plan?from=${from}&to=${to}&facility=${encodeURIComponent(facilityName)}`),
                fetch(`/api/leitung/oncall-entries?from=${from}&to=${to}&facility=${encodeURIComponent(facilityName)}`).catch(() => null),
                fetch(`/api/leitung/fehlzeiten?from=${from}&to=${to}`).catch(() => null),
            ]);
            if (!shiftsRes.ok)
                throw new Error(`Schichten konnten nicht geladen werden (${shiftsRes.status}).`);
            const shiftsJson = await shiftsRes.json();
            const assignJson = await assignRes.json().catch(() => ({ assignments: [] }));
            const byShift: Record<string, string[]> = {};
            for (const a of assignJson.assignments ?? []) {
                if (!byShift[a.shift_id])
                    byShift[a.shift_id] = [];
                byShift[a.shift_id].push(a.staff_name);
            }
            const oncallJson = oncallRes?.ok ? await oncallRes.json().catch(() => ({ entries: [] })) : { entries: [] };
            const byDate: Record<string, string[]> = {};
            for (const e of oncallJson.entries ?? []) {
                (byDate[e.on_call_date] ??= []).push(e.staff_name);
            }
            const fehlJson = fehlRes?.ok ? await fehlRes.json().catch(() => ({ byShift: {} })) : { byShift: {} };
            if (!aktuell())
                return;
            setShifts(shiftsJson.shifts ?? []);
            setAssignmentsByShift(byShift);
            setSpringerByDate(byDate);
            setFehlzeitenByShift(fehlJson.byShift ?? {});
            setLadeFehler("");
        }
        catch (e) {
            if (aktuell())
                setLadeFehler(e instanceof Error && e.message ? e.message : "Der Dienstplan konnte nicht geladen werden.");
        }
        finally {
            if (aktuell())
                setShiftsLoading(false);
        }
    }, [facilityName, contextLoaded, viewMode, calYear, calMonth, weekOffset]);
    const loadStaff = useCallback(async () => {
        if (!facilityName || !contextLoaded)
            return;
        const nr = ++ladeNr.current.staff;
        setStaffLoading(true);
        try {
            const res = await fetch(`/api/leitung/staff?facility=${encodeURIComponent(facilityName)}`);
            if (!res.ok)
                throw new Error(`Mitarbeitende konnten nicht geladen werden (${res.status}).`);
            const json = await res.json();
            if (nr === ladeNr.current.staff)
                setStaff(json.staff ?? []);
        }
        catch (e) {
            if (nr === ladeNr.current.staff)
                setLadeFehler(e instanceof Error && e.message ? e.message : "Mitarbeitende konnten nicht geladen werden.");
        }
        finally {
            if (nr === ladeNr.current.staff)
                setStaffLoading(false);
        }
    }, [facilityName, contextLoaded]);
    const loadRebalanceSuggestions = useCallback(async () => {
        if (!facilityName || !contextLoaded)
            return;
        const res = await fetch("/api/leitung/rebalance-overtime").catch(() => null);
        const json = res?.ok ? await res.json().catch(() => ({ suggestions: [] })) : { suggestions: [] };
        setRebalanceSuggestions(json.suggestions ?? []);
    }, [facilityName, contextLoaded]);
    const resolveRebalanceSuggestion = useCallback(async (id: string, resolution: "accept" | "dismiss") => {
        setRebalanceBusyId(id);
        try {
            await fetch("/api/leitung/rebalance-overtime", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, resolution }),
            });
            setRebalanceSuggestions(prev => prev.filter(s => s.id !== id));
            if (resolution === "accept")
                loadShifts();
        }
        finally {
            setRebalanceBusyId(null);
        }
    }, [loadShifts]);
    const loadWishes = useCallback(async () => {
        if (!facilityName || !contextLoaded)
            return;
        const nr = ++ladeNr.current.wishes;
        setWishesLoading(true);
        try {
            const res = await fetch(`/api/leitung/wishes?facility=${encodeURIComponent(facilityName)}`);
            if (!res.ok)
                throw new Error(`Dienstwünsche konnten nicht geladen werden (${res.status}).`);
            const json = await res.json();
            if (nr === ladeNr.current.wishes)
                setWishes(json.wishes ?? []);
        }
        catch (e) {
            if (nr === ladeNr.current.wishes)
                setLadeFehler(e instanceof Error && e.message ? e.message : "Dienstwünsche konnten nicht geladen werden.");
        }
        finally {
            if (nr === ladeNr.current.wishes)
                setWishesLoading(false);
        }
    }, [facilityName, contextLoaded]);
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => { if (aktiv)
            loadShifts(); });
        return () => { aktiv = false; };
    }, [loadShifts]);
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => { if (aktiv)
            loadWishes(); });
        return () => { aktiv = false; };
    }, [loadWishes]);
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => { if (aktiv)
            loadRebalanceSuggestions(); });
        return () => { aktiv = false; };
    }, [loadRebalanceSuggestions]);
    useEffect(() => {
        if (subNav !== "personal")
            return;
        let aktiv = true;
        void Promise.resolve().then(() => { if (aktiv)
            loadStaff(); });
        return () => { aktiv = false; };
    }, [subNav, loadStaff]);
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => {
            if (!aktiv)
                return;
            if (mainTab !== "uebersicht" && mainTab !== "stationen") {
                setStationFilter(mainTab);
                setSubNav("dienstplan");
                setForm(f => ({ ...f, station: mainTab }));
            }
            else if (mainTab === "uebersicht") {
                setStationFilter("");
            }
        });
        return () => { aktiv = false; };
    }, [mainTab]);
    async function handleAutoFill(fromDate?: string, toDate?: string) {
        setFilling(true);
        setFillMsg("");
        const days: string[] = [];
        const { from: rangeFrom, to: rangeTo } = fromDate && toDate
            ? { from: fromDate, to: toDate }
            : viewMode === "monat"
                ? getMonthRange(calYear, calMonth)
                : weekRange(weekOffset);
        const cur = new Date(rangeFrom + "T00:00:00");
        const end = new Date(rangeTo + "T00:00:00");
        while (cur <= end) {
            days.push(toLocalISODate(cur));
            cur.setDate(cur.getDate() + 1);
        }
        const existingKeys = new Set(shifts.map(s => `${s.date}|${s.station}|${s.shift_type}`));
        const stations = stationOptions.length > 0 ? stationOptions.map(s => s.name) : ["Station 1", "Station 2", "Station 3"];
        const toCreate = [];
        for (const date of days) {
            const dow = String((new Date(date + "T00:00:00").getDay() + 6) % 7);
            const dayCfg: DayConfig = genPerDateConfig[date] ??
                (genConfigMode === "pro-tag" ? genProTagConfig[dow] ?? genAlleConfig : genAlleConfig);
            for (const station of stations) {
                const shiftTypes = ["frueh", "spaet", "nacht"] as const;
                for (const st of shiftTypes) {
                    const cfg = dayCfg[st];
                    if (!cfg.enabled)
                        continue;
                    if (!genPerDateConfig[date] && !findetStatt(praxisTurnus, date, st))
                        continue;
                    if (!existingKeys.has(`${date}|${station}|${st}`)) {
                        toCreate.push({
                            date, station, shift_type: st,
                            start_time: cfg.start, end_time: cfg.end,
                            planned_staff: cfg.staff, actual_staff: 0, notes: "",
                        });
                    }
                }
            }
        }
        let created = 0;
        let skipped = 0;
        if (toCreate.length > 0) {
            const res = await fetch("/api/leitung/shifts/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shifts: toCreate, facility_name: facilityName }),
            });
            const json = await res.json();
            if (res.ok) {
                created = json.inserted ?? 0;
                skipped = json.skipped ?? 0;
            }
        }
        await loadShifts();
        setFillMsg(skipped > 0
            ? `${created} Schichten angelegt, ${skipped} gab es schon.`
            : `${created} Schichten angelegt.`);
        setTimeout(() => setFillMsg(""), 4000);
        setFilling(false);
    }
    const [copying, setCopying] = useState(false);
    const [copyMsg, setCopyMsg] = useState("");
    async function copyPreviousWeek() {
        setCopying(true);
        setCopyMsg("");
        const prevRange = weekRange(weekOffset - 1);
        const currRange = weekRange(weekOffset);
        const res = await fetch(`/api/leitung/shifts?facility=${encodeURIComponent(facilityName)}&from=${prevRange.from}&to=${prevRange.to}`);
        const { shifts: prevShifts } = await res.json();
        if (!prevShifts || prevShifts.length === 0) {
            setCopyMsg("Keine Schichten in der Vorwoche gefunden.");
            setTimeout(() => setCopyMsg(""), 4000);
            setCopying(false);
            return;
        }
        const prevStart = new Date(prevRange.from + "T00:00:00");
        const currStart = new Date(currRange.from + "T00:00:00");
        const dayOffset = Math.round((currStart.getTime() - prevStart.getTime()) / 86400000);
        const existingKeys = new Set(shifts.map(s => `${s.date}|${s.station}|${s.shift_type}`));
        const toCreate = prevShifts
            .map((s: Shift) => {
            const d = new Date(s.date + "T00:00:00");
            d.setDate(d.getDate() + dayOffset);
            const newDate = toLocalISODate(d);
            return { ...s, date: newDate, actual_staff: 0, notes: "" };
        })
            .filter((s: Shift) => !existingKeys.has(`${s.date}|${s.station}|${s.shift_type}`));
        let created = 0;
        for (const s of toCreate) {
            const r = await fetch("/api/leitung/shifts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...s, facility_name: facilityName }),
            });
            if (r.ok)
                created++;
        }
        await loadShifts();
        setCopyMsg(`${created} Schichten aus Vorwoche übernommen.`);
        setTimeout(() => setCopyMsg(""), 4000);
        setCopying(false);
    }
    async function saveAssignments(assignments: PlanAssignment[], springer: SpringerAssignment[] = []): Promise<boolean> {
        setPlanSaving(true);
        const saveRes = await fetch("/api/leitung/generate-plan", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignments, springer_assignments: springer, facility_name: facilityName }),
        });
        const saveData = await saveRes.json();
        let ok = false;
        if (!saveRes.ok) {
            setPlanError(saveData.error ?? "Fehler beim Speichern");
        }
        else {
            setPlanSaved(true);
            setTimeout(() => setPlanSaved(false), 4000);
            loadShifts();
            ok = true;
            if (assignments.length > 0 && firstPlanGeneratedAt === null)
                setFirstPlanGeneratedAt(new Date().toISOString());
        }
        setPlanSaving(false);
        return ok;
    }
    async function resolveUnderstaffing() {
        if (!pendingUnderstaffing)
            return;
        const extra: PlanAssignment[] = [];
        for (const slot of pendingUnderstaffing.unfilled_slots) {
            const decision = slotDecisions[slot.shift_id] ?? "understaffed";
            if (decision === "overtime") {
                const picks = slot.overtime_candidates.slice(0, slot.slots_missing);
                for (const c of picks) {
                    extra.push({
                        shift_id: slot.shift_id,
                        shift_date: slot.shift_date,
                        shift_type: slot.shift_type,
                        station: slot.station,
                        staff_id: c.staff_id,
                        staff_name: c.staff_name,
                        score: c.score,
                        reason: c.reason,
                        is_overtime: true,
                        understaffing_decision: "overtime",
                    });
                }
            }
        }
        const finalAssignments = [...pendingUnderstaffing.assignments, ...extra];
        const finalStats = {
            ...pendingUnderstaffing.stats,
            filled: finalAssignments.length,
            unfilled: pendingUnderstaffing.stats.total_slots - finalAssignments.length,
        };
        setPlanResult({ assignments: finalAssignments, springer_assignments: pendingUnderstaffing.springer_assignments, stats: finalStats, contract_warnings: pendingUnderstaffing.contract_warnings, fromCache: pendingUnderstaffing.fromCache, cachedAt: pendingUnderstaffing.cachedAt });
        setPendingUnderstaffing(null);
        setSlotDecisions({});
        if (finalAssignments.length > 0 && !pendingUnderstaffing.fromCache) {
            await saveAssignments(finalAssignments, pendingUnderstaffing.springer_assignments ?? []);
        }
    }
    async function diagnoseEmptyPlan(from: string, to: string, station: string | null) {
        try {
            const res = await fetch(`/api/leitung/shifts?facility=${encodeURIComponent(facilityName)}&from=${from}&to=${to}`);
            if (!res.ok)
                return;
            const json = await res.json();
            const rows = (json.shifts as Shift[] | undefined) ?? [];
            const scoped = station ? rows.filter(s => s.station === station) : rows;
            if (scoped.length === 0)
                return;
            const zeroCount = scoped.filter(s => !s.planned_staff || s.planned_staff <= 0).length;
            if (zeroCount / scoped.length >= 0.5) {
                setZeroDemandFix({ from, to, station });
            }
        }
        catch { }
    }
    async function fixZeroDemand() {
        if (!zeroDemandFix)
            return;
        setFixingDemand(true);
        try {
            const res = await fetch("/api/leitung/resync-shift-demand", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    from: zeroDemandFix.from, to: zeroDemandFix.to,
                    station: zeroDemandFix.station ?? undefined, facility_name: facilityName,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                setPlanError(json.error ?? "Beheben fehlgeschlagen");
                return;
            }
            setZeroDemandFix(null);
            await loadShifts();
            await generatePlan();
        }
        finally {
            setFixingDemand(false);
        }
    }
    async function generatePlan() {
        setShowGeneratorModal(false);
        setPlanGenerating(true);
        setPlanError("");
        setPlanResult(null);
        setPlanSaved(false);
        setPendingUnderstaffing(null);
        setZeroDemandFix(null);
        setKiAnpassungen(null);
        const { from, to } = getMonthRange(planYear, planMonth);
        if (genAction === "both" || genAction === "shifts-only") {
            await handleAutoFill(from, to);
            if (genAction === "shifts-only") {
                setPlanGenerating(false);
                return;
            }
        }
        const res = await fetch("/api/leitung/generate-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start: from, week_end: to, station: stationFilter || undefined, facility_name: facilityName }),
        });
        const data: Record<string, unknown> = await res.json();
        if (!res.ok) {
            setPlanError((data.error as string) ?? "Fehler");
            setPlanGenerating(false);
            return;
        }
        if (data.error) {
            setPlanError((data.error as string) ?? "Fehler");
        }
        else {
            setKiAnpassungen((data.kiAnpassungen as MonthlyAiAdjustments | undefined) ?? null);
            const hasUnfilledPopup = data.understaffing_mode === "popup" && ((data.unfilled_slots as unknown[]) ?? []).length > 0;
            if (hasUnfilledPopup && !data.fromCache) {
                const defaults: Record<string, "overtime" | "understaffed"> = {};
                for (const slot of data.unfilled_slots as UnfilledSlot[]) {
                    defaults[slot.shift_id] = slot.overtime_candidates?.length > 0 ? "overtime" : "understaffed";
                }
                setSlotDecisions(defaults);
                setPendingUnderstaffing(data as unknown as PendingUnderstaffingData);
            }
            else {
                setPlanResult(data as unknown as {
                    assignments: PlanAssignment[];
                    springer_assignments?: SpringerAssignment[];
                    stats: PlanStats;
                    contract_warnings?: ContractWarning[];
                    fromCache?: boolean;
                    cachedAt?: string;
                });
                const resultAssignments = (data.assignments as PlanAssignment[]) ?? [];
                if (resultAssignments.length > 0 && !data.fromCache) {
                    await saveAssignments(resultAssignments, (data.springer_assignments as SpringerAssignment[]) ?? []);
                }
                else if (resultAssignments.length === 0 && !data.fromCache) {
                    await diagnoseEmptyPlan(from, to, stationFilter || null);
                }
            }
        }
        setPlanGenerating(false);
    }
    async function savePlan() {
        if (!planResult)
            return;
        const ok = await saveAssignments(planResult.assignments, planResult.springer_assignments ?? []);
        if (ok)
            setPlanResult(null);
    }
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!facilityName) {
            setSaveError("Einrichtung nicht ausgewählt.");
            return;
        }
        setSaving(true);
        setSaveError("");
        const res = await fetch("/api/leitung/shifts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...form,
                facility_name: facilityName,
                shift_type: form.custom_name.trim() || deriveShiftType(form.start_time, form.end_time),
                planned_staff: parseInt(form.planned_staff) || 0,
                actual_staff: parseInt(form.actual_staff) || 0,
            }),
        });
        const json = await res.json();
        if (json.error) {
            setSaveError(json.error);
        }
        else {
            setShifts(s => [...s, json.shift].sort((a, b) => a.date.localeCompare(b.date) || a.shift_type.localeCompare(b.shift_type)));
            setShowForm(false);
            setForm(f => ({ ...f, planned_staff: "", actual_staff: "", notes: "" }));
        }
        setSaving(false);
    }
    function startEdit(s: Shift) {
        setEditingId(s.id);
        setEditForm({ station: s.station, shift_type: s.shift_type, start_time: s.start_time, end_time: s.end_time, planned_staff: s.planned_staff, actual_staff: s.actual_staff, notes: s.notes });
    }
    async function saveEdit() {
        if (!editingId)
            return;
        setEditSaving(true);
        const res = await fetch("/api/leitung/shifts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...editForm }),
        });
        const json = await res.json();
        if (!json.error) {
            setShifts(ss => ss.map(s => s.id === editingId ? { ...s, ...json.shift } : s));
            setEditingId(null);
        }
        setEditSaving(false);
    }
    async function saveDayEdits() {
        const eintraege = Object.entries(dayEdits);
        if (eintraege.length === 0) {
            setDayEditOpen(false);
            return;
        }
        setDayEditSaving(true);
        setDayEditError("");
        const gespeichert: Shift[] = [];
        const fehler: string[] = [];
        for (const [id, felder] of eintraege) {
            const res = await fetch("/api/leitung/shifts", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, ...felder }),
            });
            const json = await res.json().catch(() => ({ error: "Server antwortete nicht" }));
            if (json?.error || !res.ok) {
                const s = shifts.find(x => x.id === id);
                fehler.push(`${s ? `${SHIFT_LABELS[s.shift_type] ?? s.shift_type} ${s.station}` : id}: ${json?.error ?? res.status}`);
            }
            else if (json.shift) {
                gespeichert.push(json.shift as Shift);
            }
        }
        if (gespeichert.length > 0) {
            setShifts(ss => ss.map(s => {
                const neu = gespeichert.find(g => g.id === s.id);
                return neu ? { ...s, ...neu } : s;
            }));
        }
        if (fehler.length > 0) {
            setDayEditError(`${fehler.length} von ${eintraege.length} nicht gespeichert — ${fehler.join(" · ")}`);
            setDayEdits(d => {
                const rest = { ...d };
                for (const g of gespeichert)
                    delete rest[g.id];
                return rest;
            });
        }
        else {
            setDayEdits({});
            setDayEditOpen(false);
        }
        setDayEditSaving(false);
    }
    async function handleDelete(id: string) {
        const shift = shifts.find(s => s.id === id);
        const assigned = assignmentsByShift[id] ?? [];
        const ok = await confirm({
            title: "Schicht löschen?",
            body: (<>
          {shift && (<p>
              <strong>{SHIFT_LABELS[shift.shift_type] ?? shift.shift_type}</strong> am{" "}
              <strong>{dateLabel(shift.date, locale)}</strong> · {shift.station}
            </p>)}
          <p className="mt-2">
            {assigned.length > 0
                    ? `${assigned.length === 1 ? "Eine Einteilung wird" : `${assigned.length} Einteilungen werden`} mit gelöscht: ${assigned.join(", ")}.`
                    : "Auf dieser Schicht ist niemand eingeteilt."}
          </p>
        </>),
            confirmLabel: "Schicht löschen",
        });
        if (!ok)
            return;
        setDeleting(id);
        await fetch("/api/leitung/shifts", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setShifts(s => s.filter(x => x.id !== id));
        setDeleting(null);
    }
    async function assignStaff(shiftId: string, rawName: string, trotzdem = false) {
        const name = rawName.trim();
        if (!name)
            return;
        if ((assignmentsByShift[shiftId] ?? []).includes(name)) {
            setAssignFor(null);
            setAssignName("");
            return;
        }
        setAssignBusy(shiftId);
        setAssignError("");
        setAssignmentsByShift(prev => ({ ...prev, [shiftId]: [...(prev[shiftId] ?? []), name] }));
        setAssignFor(null);
        setAssignName("");
        const match = staff.find(m => m.full_name === name);
        const res = await fetch("/api/leitung/shifts/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId, staff_name: name, staff_id: match?.id, trotzdem }),
        }).catch(() => null);
        if (res?.status === 409) {
            setAssignmentsByShift(prev => ({ ...prev, [shiftId]: (prev[shiftId] ?? []).filter(n => n !== name) }));
            setAssignBusy(null);
            const j = await res.json().catch(() => ({}));
            const befunde: {
                text: string;
                norm: string;
                schwere: string;
            }[] = j.pruefung ?? [];
            const ok = await confirm({
                title: `${name} trotzdem einteilen?`,
                body: (<div className="space-y-2">
            <ul className="space-y-1.5">
              {befunde.map((b, i) => (<li key={i} className={b.schwere === "blocker" ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}>
                  {b.text} <span className="text-[var(--tinte-leise)]">({b.norm})</span>
                </li>))}
            </ul>
            <p className="text-[var(--tinte-leise)]">Der automatische Plan würde so nie einteilen. Die Verantwortung für die Abweichung liegt bei Ihnen.</p>
          </div>),
                confirmLabel: "Trotzdem einteilen",
                danger: true,
            });
            if (ok)
                await assignStaff(shiftId, name, true);
            return;
        }
        if (!res?.ok) {
            setAssignmentsByShift(prev => ({
                ...prev,
                [shiftId]: (prev[shiftId] ?? []).filter(n => n !== name),
            }));
            const msg = await res?.json().then(j => j.error).catch(() => null);
            setAssignError(msg || `${name} konnte nicht eingeteilt werden — bitte erneut versuchen.`);
        }
        else {
            loadShifts();
        }
        setAssignBusy(null);
    }
    async function unassignStaff(shiftId: string, name: string) {
        setAssignBusy(shiftId);
        setAssignError("");
        const before = assignmentsByShift[shiftId] ?? [];
        setAssignmentsByShift(prev => ({
            ...prev,
            [shiftId]: (prev[shiftId] ?? []).filter(n => n !== name),
        }));
        const res = await fetch("/api/leitung/shifts/assign", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId, staff_name: name }),
        }).catch(() => null);
        if (!res?.ok) {
            setAssignmentsByShift(prev => ({ ...prev, [shiftId]: before }));
            setAssignError(`${name} konnte nicht ausgetragen werden — bitte erneut versuchen.`);
        }
        else {
            loadShifts();
        }
        setAssignBusy(null);
    }
    async function handleAddStaff(e: React.FormEvent) {
        e.preventDefault();
        setStaffSaving(true);
        setStaffError("");
        const res = await fetch("/api/leitung/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...staffForm, facility_name: facilityName }),
        });
        const json = await res.json();
        if (json.error) {
            setStaffError(json.error);
        }
        else {
            setStaff(s => [...s, json.member].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setShowStaffForm(false);
            setStaffForm({ full_name: "", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 });
        }
        setStaffSaving(false);
    }
    async function handleDeleteStaff(id: string) {
        const member = staff.find(m => m.id === id);
        const ok = await confirm({
            title: `${member?.full_name ?? "Mitarbeiter"} entfernen?`,
            body: "Die Person verschwindet aus der Personalliste und steht für neue Einteilungen nicht mehr zur Verfügung. Bereits erfasste Zeiten und bestehende Einteilungen bleiben erhalten.",
            confirmLabel: "Entfernen",
        });
        if (!ok)
            return;
        setDeletingStaff(id);
        await fetch("/api/leitung/staff", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setStaff(s => s.filter(x => x.id !== id));
        setDeletingStaff(null);
    }
    async function handleUpdateStaff(id: string) {
        setStaffEditSaving(true);
        const res = await fetch("/api/leitung/staff", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...editingStaffForm }),
        });
        const json = await res.json();
        if (!json.error) {
            setStaff(ss => ss.map(m => m.id === id ? { ...m, ...json.member } : m));
            setEditingStaffId(null);
        }
        setStaffEditSaving(false);
    }
    async function updateWishStatus(id: string, status: string) {
        setUpdatingWish(id);
        const res = await fetch("/api/leitung/wishes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        if (res.ok) {
            setWishes(ws => ws.map(w => w.id === id ? { ...w, status } : w));
        }
        setUpdatingWish(null);
    }
    async function handleOptimize() {
        setOptimizing(true);
        setOptimizeError("");
        setOptimizeResult(null);
        setApplyDone(false);
        setSelectedOpts(new Set());
        const { from, to } = viewMode === "monat"
            ? getMonthRange(calYear, calMonth)
            : weekRange(weekOffset);
        try {
            const res = await fetch("/api/leitung/optimize-plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from, to }),
            });
            const json = await res.json().catch(() => ({ error: `Analyse fehlgeschlagen (HTTP ${res.status})` }));
            if (json.error) {
                setOptimizeError(json.error);
            }
            else {
                setOptimizeResult(json);
                setKiIsDemoExample(false);
                setKiRecommendationId(json.id ?? null);
                setApplyResult(null);
                setSelectedOpts(new Set((json.optimizations ?? []).map((_: unknown, i: number) => i)));
                if (kiIsDemo)
                    setKiDemoUsesLeft(n => Math.max(0, n - 1));
            }
        }
        catch {
            setOptimizeError("Analyse fehlgeschlagen — bitte erneut versuchen.");
        }
        finally {
            setOptimizing(false);
        }
    }
    const loadKiRecommendations = useCallback(async () => {
        if (!facilityName || !contextLoaded)
            return;
        try {
            const res = await fetch("/api/leitung/optimize-plan");
            const json = await res.json();
            setKiIsDemo(!!json.isDemo);
            setKiDemoUsesLeft(json.demoUsesLeft ?? 2);
            const pending = (json.pending ?? [])[0];
            if (pending && Array.isArray(pending.recommendations) && pending.recommendations.length > 0) {
                setOptimizeResult({ summary: pending.summary ?? "", optimizations: pending.recommendations });
                setKiIsDemoExample(pending.source === "demo_sim");
                setKiRecommendationId(pending.id);
                setSelectedOpts(new Set(pending.recommendations.map((_: unknown, i: number) => i)));
                setSubNav("auswertung");
            }
        }
        catch { }
    }, [facilityName, contextLoaded]);
    useEffect(() => { loadKiRecommendations(); }, [facilityName, contextLoaded]);
    async function rejectKiRecommendation() {
        if (!kiRecommendationId) {
            setOptimizeResult(null);
            return;
        }
        setKiRejecting(true);
        try {
            await fetch("/api/leitung/optimize-plan", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: kiRecommendationId }),
            });
        }
        catch { }
        setKiRejecting(false);
        setOptimizeResult(null);
        setKiRecommendationId(null);
    }
    async function applyOptimizations() {
        if (!optimizeResult)
            return;
        setApplying(true);
        setOptimizeError("");
        const selected = optimizeResult.optimizations.filter((_, i) => selectedOpts.has(i));
        try {
            const res = await fetch("/api/leitung/optimize-plan", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ optimizations: selected, applyFrom: "next-unplanned", recommendation_id: kiRecommendationId }),
            });
            const json = await res.json().catch(() => ({ error: `Übernahme fehlgeschlagen (HTTP ${res.status})` }));
            if (json.error) {
                setOptimizeError(json.error);
            }
            else {
                setApplyDone(true);
                setApplyResult({ effective: json.effective ?? "", notified: json.notified ?? 0, updated: json.updated_shifts ?? 0 });
                setKiRecommendationId(null);
                loadShifts();
            }
        }
        catch {
            setOptimizeError("Übernahme fehlgeschlagen — bitte erneut versuchen.");
        }
        finally {
            setApplying(false);
        }
    }
    const displayShifts = stationFilter ? shifts.filter(s => s.station === stationFilter) : shifts;
    const avgCompliance = displayShifts.length > 0
        ? Math.round(displayShifts.reduce((sum, s) => sum + (s.planned_staff > 0 ? s.actual_staff / s.planned_staff : 1), 0) / displayShifts.length * 100)
        : 0;
    const compColor = avgCompliance >= 90 ? "var(--ok)" : avgCompliance >= 75 ? "var(--warnung)" : "var(--gefahr)";
    const arbZGViolations = useMemo(() => checkRuhezeiten(shifts, assignmentsByShift), [shifts, assignmentsByShift]);
    const arbZGViolatingShiftIds = useMemo(() => new Set(arbZGViolations.flatMap(v => [v.prevShiftId, v.nextShiftId])), [arbZGViolations]);
    const weitereArbzgBefunde = useMemo(() => pruefeWeitereArbeitszeit(shifts, assignmentsByShift), [shifts, assignmentsByShift]);
    const weitereVerstoesse = useMemo(() => weitereArbzgBefunde.filter(b => b.schwere !== "hinweis"), [weitereArbzgBefunde]);
    const arbzgBefundZeilen = useMemo(() => [
        ...arbZGViolations.map(v => ({
            person: v.staffName,
            text: `${Math.floor(v.restMinutes / 60)}h${v.restMinutes % 60 > 0 ? ` ${v.restMinutes % 60}min` : ""} Ruhezeit · ${v.prevEnd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`,
        })),
        ...weitereVerstoesse.map(b => ({
            person: b.person,
            text: `${b.norm}${b.datum ? ` · ${b.datum.slice(8, 10)}.${b.datum.slice(5, 7)}.` : ""}`,
        })),
    ], [arbZGViolations, weitereVerstoesse]);
    const staffNames = useMemo(() => staff.filter(m => m.active).map(m => m.full_name).sort((a, b) => a.localeCompare(b, "de")), [staff]);
    const aerzteNamen = useMemo(() => new Set(staff.filter(m => istArzt(m.role)).map(m => m.full_name)), [staff]);
    const currentWeekRange = weekRange(weekOffset);
    const fromLabel = new Date(currentWeekRange.from + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" });
    const toLabel = new Date(currentWeekRange.to + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
    const openWishes = wishes.filter(w => w.status === "offen");
    const calGrid = getCalendarGrid(calYear, calMonth);
    const periodLabel = viewMode === "monat"
        ? `${MONTH_NAMES_DE[calMonth]} ${calYear}`
        : `${fromLabel} – ${toLabel}`;
    const stationWort = t("sp.station");
    const periodKey = viewMode === "monat"
        ? `${calYear}-${String(calMonth + 1).padStart(2, "0")}`
        : currentWeekRange.from;
    const exportTargets: ExportTarget[] = useMemo(() => {
        const createdNote = `Erstellt am ${new Date().toLocaleDateString("de-DE")} · Nurvo`;
        const bySched = (a: Shift, b: Shift) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? "");
        const stationDoc = (stationName: string): PlanExportDoc => ({
            title: `Dienstplan — ${stationName}`,
            subtitle: `${facilityName} · ${periodLabel}`,
            columns: [
                { key: "date", label: "Datum", weight: 1.1 },
                { key: "type", label: "Schicht", weight: 1 },
                { key: "time", label: "Zeit", weight: 1.2 },
                { key: "staff", label: "Besetzung", weight: 3 },
            ],
            rows: shifts.filter(s => s.station === stationName).sort(bySched).map(s => ({
                date: fmtPlanDate(s.date),
                type: SHIFT_LABEL_DE[s.shift_type] ?? s.shift_type,
                time: shiftTimeRange(s),
                staff: (assignmentsByShift[s.id] ?? []).join(", ") || "—",
            })),
            footerNote: createdNote,
        });
        const names = Array.from(new Set(shifts.map(s => s.station).filter(Boolean))).sort();
        const targets: ExportTarget[] = [];
        const mine = userName
            ? shifts.filter(s => (assignmentsByShift[s.id] ?? []).includes(userName)).sort(bySched)
            : [];
        if (mine.length > 0) {
            targets.push({
                id: "own",
                label: "Mein eigener Plan",
                baseName: `nurvo-mein-plan-${periodKey}`,
                build: (): PlanExportDoc => ({
                    title: `Dienstplan — ${userName}`,
                    subtitle: `${facilityName} · ${periodLabel}`,
                    columns: [
                        { key: "date", label: "Datum", weight: 1.1 },
                        { key: "type", label: "Schicht", weight: 1 },
                        { key: "time", label: "Zeit", weight: 1.2 },
                        { key: "station", label: stationWort, weight: 1.6 },
                        { key: "notes", label: "Notiz", weight: 1.6 },
                    ],
                    rows: mine.map(s => ({
                        date: fmtPlanDate(s.date),
                        type: SHIFT_LABEL_DE[s.shift_type] ?? s.shift_type,
                        time: shiftTimeRange(s),
                        station: s.station,
                        notes: s.notes ?? "",
                    })),
                    footerNote: createdNote,
                }),
            });
        }
        if (names.length > 1) {
            targets.push({
                id: "all",
                label: `Alle Stationen einzeln (${names.length})`,
                baseName: `nurvo-dienstplan-${periodKey}`,
                build: () => names.map(stationDoc),
            });
        }
        for (const n of names) {
            targets.push({
                id: `st-${n}`,
                label: n,
                baseName: `nurvo-dienstplan-${n}-${periodKey}`,
                build: () => stationDoc(n),
            });
        }
        return targets;
    }, [shifts, assignmentsByShift, userName, facilityName, periodLabel, periodKey, stationWort]);
    const [recDismissed, setRecDismissed] = useState<boolean>(() => {
        try {
            const ts = localStorage.getItem("nurvo_staffrec_dismissed");
            if (!ts)
                return false;
            return (Date.now() - parseInt(ts)) < 7 * 24 * 60 * 60 * 1000;
        }
        catch {
            return false;
        }
    });
    function dismissRec() {
        setRecDismissed(true);
        try {
            localStorage.setItem("nurvo_staffrec_dismissed", Date.now().toString());
        }
        catch { }
    }
    type StaffingNeed = {
        id: string;
        station: string;
        shift_type: string;
        headcount: number;
        status: "offen" | "in_arbeit" | "erledigt" | "verworfen";
        created_at: string;
    };
    const [needs, setNeeds] = useState<StaffingNeed[]>([]);
    const [needsTableMissing, setNeedsTableMissing] = useState(false);
    const [needBusy, setNeedBusy] = useState<string | null>(null);
    const [needError, setNeedError] = useState("");
    useEffect(() => {
        let abgebrochen = false;
        fetch("/api/leitung/staffing-needs")
            .then(r => r.json())
            .then(d => {
            if (abgebrochen)
                return;
            setNeeds(Array.isArray(d?.needs) ? d.needs : []);
            setNeedsTableMissing(Boolean(d?.tableMissing));
        })
            .catch(() => { });
        return () => { abgebrochen = true; };
    }, []);
    const needFor = (station: string, shiftType: string) => needs.find(n => n.station === station && n.shift_type === shiftType);
    async function uebernehmeBedarf(rec: {
        station: string;
        shiftType: string;
        suggestedHires: number;
        avgGap: number;
        understaffedRatio: number;
        sampleCount: number;
    }) {
        const schluessel = `${rec.station}|${rec.shiftType}`;
        setNeedBusy(schluessel);
        setNeedError("");
        const res = await fetch("/api/leitung/staffing-needs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                station: rec.station, shift_type: rec.shiftType, headcount: rec.suggestedHires,
                avg_gap: rec.avgGap, understaffed_ratio: rec.understaffedRatio, sample_count: rec.sampleCount,
            }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d?.error) {
            setNeedError(d?.error ?? "Konnte nicht übernommen werden.");
            if (d?.tableMissing)
                setNeedsTableMissing(true);
        }
        else if (d?.need) {
            setNeeds(ns => [d.need, ...ns.filter(n => n.id !== d.need.id)]);
        }
        setNeedBusy(null);
    }
    async function setzeBedarfStatus(id: string, status: StaffingNeed["status"]) {
        setNeedBusy(id);
        setNeedError("");
        const res = await fetch("/api/leitung/staffing-needs", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d?.error)
            setNeedError(d?.error ?? "Status konnte nicht geändert werden.");
        else if (d?.need)
            setNeeds(ns => ns.map(n => (n.id === d.need.id ? d.need : n)));
        setNeedBusy(null);
    }
    const staffingRecs = useMemo(() => {
        if (shifts.length < 30)
            return [];
        type Group = {
            planned: number;
            understaffedCount: number;
            count: number;
            totalGap: number;
        };
        const groups: Record<string, Group> = {};
        for (const s of shifts) {
            if (!s.station || !s.shift_type)
                continue;
            const key = `${s.station}|||${s.shift_type}`;
            if (!groups[key])
                groups[key] = { planned: 0, understaffedCount: 0, count: 0, totalGap: 0 };
            groups[key].count++;
            groups[key].planned += s.planned_staff;
            if (s.actual_staff < s.planned_staff) {
                groups[key].understaffedCount++;
                groups[key].totalGap += s.planned_staff - s.actual_staff;
            }
        }
        const recs: {
            station: string;
            shiftType: string;
            avgGap: number;
            suggestedHires: number;
            understaffedRatio: number;
            sampleCount: number;
        }[] = [];
        for (const [key, g] of Object.entries(groups)) {
            if (g.count < 10)
                continue;
            const ratio = g.understaffedCount / g.count;
            if (ratio < 0.3)
                continue;
            const avgGap = g.understaffedCount > 0 ? g.totalGap / g.understaffedCount : 0;
            if (avgGap < 0.5)
                continue;
            const [station, shiftType] = key.split("|||");
            recs.push({ station, shiftType, avgGap, suggestedHires: Math.ceil(avgGap), understaffedRatio: ratio, sampleCount: g.count });
        }
        return recs.sort((a, b) => b.avgGap - a.avgGap);
    }, [shifts]);
    if (!contextLoaded) {
        if (!showLoading)
            return null;
        return (<div className="flex flex-col items-center justify-center h-full gap-3">
        <PulseLoader size={24}/>
        <span className="text-sm text-[var(--tinte-leise)]">Schichtplan wird geladen…</span>
      </div>);
    }
    function renderShiftRow(s: Shift) {
        const isEditing = editingId === s.id;
        const compliance = s.planned_staff > 0 ? Math.round(s.actual_staff / s.planned_staff * 100) : 100;
        const col = complianceColor(s.planned_staff, s.actual_staff);
        if (isEditing) {
            return (<tr key={s.id} className="bg-[var(--akzent-flaeche)]">
          <td className="px-4 py-2 font-medium text-[var(--tinte-matt)] text-xs">{dateLabel(s.date)}</td>
          <td className="px-4 py-2">
            {stationOptions.length > 0 ? (<select value={editForm.station ?? s.station} onChange={e => setEditForm(f => ({ ...f, station: e.target.value }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs w-28">
                {stationOptions.map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
              </select>) : (<input type="text" value={editForm.station ?? s.station} onChange={e => setEditForm(f => ({ ...f, station: e.target.value }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs w-28"/>)}
          </td>
          <td className="px-4 py-2">
            <div className="flex items-center gap-1">
              <input type="time" value={editForm.start_time ?? s.start_time ?? "06:00"} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value, shift_type: deriveShiftType(e.target.value, f.end_time) }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs w-24"/>
              <span className="text-[var(--tinte-leise)] text-xs">–</span>
              <input type="time" value={editForm.end_time ?? s.end_time ?? "14:00"} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs w-24"/>
            </div>
          </td>
          <td className="px-4 py-2">
            <input type="number" min={0} value={editForm.planned_staff ?? s.planned_staff} onChange={e => setEditForm(f => ({ ...f, planned_staff: parseInt(e.target.value) || 0 }))} className="w-14 px-2 py-1 border border-[var(--linie)] rounded text-xs"/>
          </td>
          <td className="px-4 py-2">
            <input type="number" min={0} value={editForm.actual_staff ?? s.actual_staff} onChange={e => setEditForm(f => ({ ...f, actual_staff: parseInt(e.target.value) || 0 }))} className="w-14 px-2 py-1 border border-[var(--linie)] rounded text-xs"/>
          </td>
          <td className="px-4 py-2 text-xs text-[var(--tinte-leise)]">—</td>
          <td className="px-4 py-2">
            <input type="text" value={editForm.notes ?? s.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-32 px-2 py-1 border border-[var(--linie)] rounded text-xs"/>
          </td>
          <td className="px-4 py-2 text-xs text-[var(--tinte-leise)]">—</td>
          <td className="px-4 py-2">
            <div className="flex gap-1">
              <button onClick={saveEdit} disabled={editSaving} aria-label="Änderungen speichern" data-tooltip="Änderungen speichern" className="p-1.5 text-[var(--ok)] hover:bg-[var(--ok-flaeche)] rounded transition-colors disabled:opacity-50">
                {editSaving ? <PulseLoader size={13}/> : <Check size={13}/>}
              </button>
              <button onClick={() => setEditingId(null)} aria-label="Bearbeitung abbrechen" data-tooltip="Bearbeitung abbrechen" className="p-1.5 text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] rounded transition-colors">
                <X size={13}/>
              </button>
            </div>
          </td>
        </tr>);
        }
        return (<tr key={s.id} className="hover:bg-[var(--papier-tief)] transition-colors">
        <td className="px-4 py-3 font-medium text-[var(--tinte)] text-sm">{dateLabel(s.date, locale)}</td>
        <td className="px-4 py-3 text-[var(--tinte-matt)]">{s.station}</td>
        <td className="px-4 py-3">
          {s.start_time && s.end_time ? (<span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SHIFT_COLORS[s.shift_type]}`}>
              {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
            </span>) : (<span className={`text-xs px-2.5 py-1 rounded-full font-medium ${SHIFT_COLORS[s.shift_type]}`}>
              {SHIFT_LABELS[s.shift_type]}
            </span>)}
        </td>
        <td className="px-4 py-3 text-[var(--tinte-matt)]">{s.planned_staff}</td>
        <td className="px-4 py-3 text-[var(--tinte-matt)]">{s.actual_staff}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-14 bg-[var(--papier-tief)] rounded-full h-1.5">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(compliance, 100)}%`, background: col }}/>
            </div>
            <span className="text-xs font-semibold" style={{ color: col }}>{compliance}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-[var(--tinte-leise)] text-xs max-w-[120px] truncate">{s.notes || "—"}</td>
        <td className="px-4 py-3 max-w-[220px]">
          <StaffAssign shiftId={s.id} assigned={assignmentsByShift[s.id] ?? []} fehlt={fehlzeitenByShift[s.id]} staffNames={staffNames} aerzte={aerzteNamen} open={assignFor === s.id} onOpen={() => { setAssignFor(s.id); setAssignName(""); setAssignError(""); }} onClose={() => { setAssignFor(null); setAssignName(""); }} value={assignName} onChange={setAssignName} busy={assignBusy === s.id} onAssign={assignStaff} onUnassign={unassignStaff}/>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <button onClick={() => startEdit(s)} aria-label="Schicht bearbeiten" data-tooltip="Schicht bearbeiten" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] rounded transition-colors">
              <Pencil size={13}/>
            </button>
            <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} aria-label="Schicht löschen" data-tooltip="Schicht löschen" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] rounded transition-colors disabled:opacity-40">
              {deleting === s.id ? <PulseLoader size={13}/> : <Trash2 size={13}/>}
            </button>
          </div>
        </td>
      </tr>);
    }
    return (<div className="flex flex-col h-full">
      <Header title={t("sp.title")} subtitle={t("sp.subtitle")}/>

      
      {(!istPraxis || facilities.length > 1) && (<div className="flex items-center border-b border-[var(--linie)] bg-[var(--papier)] flex-shrink-0 overflow-x-auto px-3">
        <button onClick={() => setMainTab("uebersicht")} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${mainTab === "uebersicht" ? "border-[var(--linie)] text-[var(--tinte)]" : "border-transparent text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"}`}>
          <LayoutDashboard size={14}/>
          Übersicht
        </button>
        {!istPraxis && (<button onClick={() => setMainTab("stationen")} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${mainTab === "stationen" ? "border-[var(--linie)] text-[var(--tinte)]" : "border-transparent text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"}`}>
          <Layers size={14}/>
          Stationen
        </button>)}
        {!istPraxis && stationOptions.map(s => (<button key={s.id} onClick={() => setMainTab(s.name)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${mainTab === s.name ? "border-[var(--linie)] text-[var(--tinte)]" : "border-transparent text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"}`}>
            <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block" style={{ background: s.color }}/>
            {s.name}
          </button>))}

        
        {facilities.length > 1 && (<div className="ml-auto pl-4 flex items-center gap-2 flex-shrink-0 border-b-2 border-transparent py-2">
            <Building2 size={13} className="text-[var(--tinte-leise)]"/>
            <select value={facilityName} onChange={e => setFacilityName(e.target.value)} className="text-sm text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg px-2 py-1 bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
              {facilities.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>)}
      </div>)}

      {mainTab === "stationen" ? (<div className="flex-1 overflow-y-auto p-5 max-w-2xl">
          <StationManager onStationsChanged={refetchStations}/>
        </div>) : (<div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
        
        
        {mainTab === "uebersicht" && (<nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible md:w-44 border-b md:border-b-0 md:border-r border-[var(--linie)] bg-[var(--papier)] flex-shrink-0 py-2 md:pt-4 md:pb-0 px-2">
          {([
                    { id: "dienstplan" as const, label: "Dienstplan", icon: CalendarDays, tip: "Kalender mit allen Schichten" },
                    { id: "personal" as const, label: "Personal", icon: Users, tip: "Team für diesen Dienstplan verwalten" },
                    { id: "auswertung" as const, label: "Auswertung", icon: BarChart2, tip: "KI-gestützte Analyse der Besetzung" },
                    { id: "wuensche" as const, label: `Wünsche${openWishes.length > 0 ? ` (${openWishes.length})` : ""}`, icon: Heart, tip: "Schichtwünsche des Teams" },
                ]).map(({ id, label, icon: Icon, tip }) => (<button key={id} onClick={() => setSubNav(id)} data-tooltip={tip} className={`flex shrink-0 items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap md:w-full ${subNav === id ? "bg-[var(--tinte-leise)] text-white" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] hover:text-[var(--tinte)]"}`}>
              <Icon size={15}/>
              {label}
            </button>))}
        </nav>)}

        
        <div className="flex flex-col xl:flex-row flex-1 min-w-0 md:overflow-y-auto xl:overflow-hidden">
          <div className="flex-1 min-w-0 xl:overflow-y-auto p-4 md:p-5">

            
            {stationOptions.length > 0 && mainTab === "uebersicht" && (<div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-[var(--tinte-leise)]"/>
                  <select value={stationFilter} onChange={e => setStationFilter(e.target.value)} className="px-3 py-2 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                    <option value="">{istPraxis ? "Alle Standorte" : "Alle Stationen"}</option>
                    {stationOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>)}

      
      {subNav === "dienstplan" && (<>
          

          {rebalanceSuggestions.length > 0 && (<div className="mb-5 space-y-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--warnung)]">
                <AlertTriangle size={15} className="text-[var(--warnung)]"/>
                Überstunden-Ausgleich — {rebalanceSuggestions.length} Vorschlag{rebalanceSuggestions.length > 1 ? "e" : ""}
              </div>
              {rebalanceSuggestions.map(s => (<div key={s.id} className="border border-[var(--linie)] bg-[var(--warnung-flaeche)] rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--tinte)] truncate">
                        {s.staff_name}{s.action === "swap" && s.replacement_staff_name ? ` → ${s.replacement_staff_name}` : ""}
                      </p>
                      <p className="text-[12px] text-[var(--tinte-matt)] mt-0.5 tabular-nums">
                        {new Date(s.shift_date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        {s.overtime_hours != null ? ` · ${s.overtime_hours}h über der Grenze` : ""}
                      </p>
                      {s.reason && <p className="text-[11px] text-[var(--tinte-matt)] mt-1">{s.reason}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => resolveRebalanceSuggestion(s.id, "accept")} disabled={rebalanceBusyId === s.id} className="p-2 rounded-lg bg-[var(--akzent)] text-white disabled:opacity-50" aria-label="Übernehmen" data-tooltip="Übernehmen">
                        <Check size={14}/>
                      </button>
                      <button onClick={() => resolveRebalanceSuggestion(s.id, "dismiss")} disabled={rebalanceBusyId === s.id} className="p-2 rounded-lg border border-[var(--linie)] text-[var(--tinte-matt)] disabled:opacity-50" aria-label="Verwerfen" data-tooltip="Verwerfen">
                        <X size={14}/>
                      </button>
                    </div>
                  </div>
                </div>))}
            </div>)}
          
          <div className="flex flex-wrap items-center gap-3 mb-5">
            
            <div className="flex items-center bg-[var(--papier)] border border-[var(--linie)] rounded-lg overflow-hidden">
              <button aria-label="Zurück" data-tooltip="Zurück" onClick={() => {
                    if (viewMode === "monat") {
                        const d = new Date(calYear, calMonth - 1, 1);
                        setCalYear(d.getFullYear());
                        setCalMonth(d.getMonth());
                        setSelectedDay(null);
                    }
                    else {
                        setWeekOffset(o => o - 1);
                    }
                }} className="px-3 py-2 text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]">
                <ChevronLeft size={16}/>
              </button>
              <span className="px-3 py-2 text-sm font-medium text-[var(--tinte-matt)] whitespace-nowrap">
                {viewMode === "monat"
                    ? `${MONTH_NAMES_DE[calMonth]} ${calYear}`
                    : `${fromLabel} – ${toLabel}`}
              </span>
              <button aria-label="Vor" data-tooltip="Vor" onClick={() => {
                    if (viewMode === "monat") {
                        const d = new Date(calYear, calMonth + 1, 1);
                        setCalYear(d.getFullYear());
                        setCalMonth(d.getMonth());
                        setSelectedDay(null);
                    }
                    else {
                        setWeekOffset(o => o + 1);
                    }
                }} className="px-3 py-2 text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]">
                <ChevronRight size={16}/>
              </button>
              <button aria-label="Zum heutigen Monat/Woche springen" data-tooltip="Zum heutigen Monat/Woche springen" onClick={() => {
                    const now = new Date();
                    setCalYear(now.getFullYear());
                    setCalMonth(now.getMonth());
                    setWeekOffset(0);
                    setSelectedDay(null);
                }} className="px-3 py-2 text-xs text-[var(--akzent)] font-medium border-l border-[var(--linie)] hover:bg-[var(--akzent-flaeche)]">
                {t("common.today")}
              </button>
            </div>

            
            <div className="flex items-center bg-[var(--papier)] border border-[var(--linie)] rounded-lg overflow-hidden text-xs font-medium">
              {(["monat", "woche"] as const).map(m => (<button key={m} onClick={() => { setViewMode(m); setSelectedDay(null); }} data-tooltip={m === "monat" ? "Kalender-Monatsansicht" : "Tabellarische Wochenansicht"} className={`px-3 py-2 transition-colors ${viewMode === m ? "bg-[var(--tinte-leise)] text-white" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  {m === "monat" ? "Monat" : "Woche"}
                </button>))}
            </div>

            <div className="flex-1"/>
            {exportTargets.length > 0 && <PlanExportMenu targets={exportTargets}/>}
            <ExcelImport facilityName={facilityName} onImported={loadShifts}/>
            {viewMode === "woche" && (<button onClick={copyPreviousWeek} disabled={copying || !facilityName} aria-label="Schichtstruktur der Vorwoche in die aktuelle Woche kopieren" data-tooltip="Schichtstruktur der Vorwoche in die aktuelle Woche kopieren" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] disabled:opacity-50 transition-colors">
                {copying ? <PulseLoader size={14}/> : <ChevronLeft size={14}/>}
                Vorwoche kopieren
              </button>)}
            <button onClick={() => oeffneGenerator("shifts-only")} disabled={filling || !facilityName} aria-label="Schichten für den Monat mit konfigurierbaren Zeiten und Besetzung anlegen" data-tooltip="Schichten für den Monat mit konfigurierbaren Zeiten und Besetzung anlegen" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] disabled:opacity-50 transition-colors">
              {filling
                    ? <PulseLoader size={14}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_add_on</span>}
              {t("sp.week.fill")}
            </button>
            {showGenerateButton && (<button onClick={() => oeffneGenerator("staff-only")} disabled={planGenerating || !facilityName} aria-label="Mitarbeiter automatisch in bestehende Schichten einteilen" data-fuehrung="dienstplan-generieren" data-tooltip="Mitarbeiter automatisch in bestehende Schichten einteilen" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--linie)] bg-[var(--akzent-flaeche)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] disabled:opacity-50 transition-colors">
                {planGenerating
                        ? <PulseLoader size={14}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>}
                Dienstplan generieren
              </button>)}
            <button onClick={() => {
                    setForm(f => ({ ...f, date: selectedDay ?? todayISO() }));
                    setShowForm(v => !v);
                    setSaveError("");
                }} aria-label="Neue Schicht manuell anlegen" data-tooltip="Neue Schicht manuell anlegen" className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
              <Plus size={15}/>
              {t("sp.shift.add")}
            </button>
          </div>

          {fillMsg && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-4">
              <Check size={14}/>{fillMsg}
            </div>)}
          {copyMsg && (<div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg mb-4 ${copyMsg.includes("gefunden") ? "text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)]" : "text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)]"}`}>
              <Check size={14}/>{copyMsg}
            </div>)}

          {ladeFehler && (<div role="alert" className="flex items-start gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-4">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
              <span className="flex-1">{ladeFehler}</span>
              <button onClick={() => { setLadeFehler(""); loadShifts(); loadWishes(); }} className="font-medium underline">
                Erneut laden
              </button>
            </div>)}

          {assignError && (<div role="alert" className="flex items-start gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-4">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0"/>
              <span className="flex-1">{assignError}</span>
              <button onClick={() => setAssignError("")} aria-label="Meldung schließen" className="text-[var(--gefahr)] hover:text-[var(--gefahr)]">
                <X size={14}/>
              </button>
            </div>)}

          {planError && (<div role="alert" className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-4">
              <div className="flex items-center gap-2 font-medium"><AlertTriangle size={14}/>Fehler beim Speichern</div>
              <pre className="mt-1 text-xs whitespace-pre-wrap font-mono">{planError}</pre>
            </div>)}
          {planSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-4">
              <Check size={14}/>Belegungsplan gespeichert!
            </div>)}

          {planResult && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden mb-4">
              <div className="px-6 py-4 border-b border-[var(--linie)] flex items-center justify-between bg-[var(--akzent-flaeche)]">
                <div className="flex items-center gap-3">
                  <Users size={16} className="text-[var(--akzent)]"/>
                  <div>
                    <h3 className="font-semibold text-[var(--akzent)]">Automatischer Belegungsplan — {MONTH_NAMES_DE[planMonth]} {planYear}</h3>
                    <p className="text-[var(--akzent)] text-xs mt-0.5">
                      {planResult.stats.filled}/{planResult.stats.total_slots} Plätze belegt
                      · {planResult.stats.staff_count} Mitarbeiter
                      · {planResult.stats.wish_count} Wünsche berücksichtigt
                      {planResult.stats.unfilled > 0 && ` · ${planResult.stats.unfilled} unbesetzt`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPlanResult(null)} className="p-1.5 rounded-lg hover:bg-[var(--akzent-flaeche)] text-[var(--akzent)] hover:text-[var(--akzent)] transition-colors">
                    <X size={16}/>
                  </button>
                  <button onClick={savePlan} disabled={planSaving} className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent)] transition-colors disabled:opacity-50">
                    {planSaving ? <PulseLoader size={13}/> : <Check size={13}/>}
                    Bestätigen & Speichern
                  </button>
                </div>
              </div>

              {planResult.fromCache && (<div className="px-6 py-2 bg-[var(--papier-tief)] border-b border-[var(--linie)] flex items-center gap-2">
                  <AlertTriangle size={13} className="text-[var(--tinte-leise)] flex-shrink-0"/>
                  <p className="text-[var(--tinte-matt)] text-xs">
                    Offline-Modus — Daten vom {planResult.cachedAt ? new Date(planResult.cachedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "letzten Sync"}. Plan wird erst nach Internetverbindung gespeichert.
                  </p>
                </div>)}
              {planResult.stats.burnout_warnings.length > 0 && (<div className="px-6 py-2 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] flex items-center gap-2">
                  <AlertTriangle size={13} className="text-[var(--warnung)] flex-shrink-0"/>
                  <p className="text-[var(--warnung)] text-xs">
                    Burnout-Warnung: {planResult.stats.burnout_warnings.join(", ")} haben viele Nachtschichten
                  </p>
                </div>)}
              {(planResult.contract_warnings?.length ?? 0) > 0 && (<div className="px-6 py-2 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] flex items-start gap-2">
                  <AlertTriangle size={13} className="text-[var(--warnung)] flex-shrink-0 mt-0.5"/>
                  <div className="text-[var(--warnung)] text-xs space-y-0.5">
                    <p className="font-semibold">Vertragshinweise (nur Warnung, Plan bleibt gültig):</p>
                    {planResult.contract_warnings!.map((w, i) => (<p key={i}>{w.staff_name}: {w.detail}</p>))}
                  </div>
                </div>)}

              {planResult.assignments.length === 0 && zeroDemandFix && (<div className="px-6 py-3 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] flex flex-wrap items-center gap-3">
                  <AlertTriangle size={14} className="text-[var(--warnung)] flex-shrink-0"/>
                  <p className="text-[var(--warnung)] text-xs flex-1 min-w-[240px]">
                    Kein Soll-Bedarf {zeroDemandFix.station ? <>für Station „<strong>{zeroDemandFix.station}</strong>“ </> : null}
                    im gewählten Zeitraum konfiguriert — die betroffenen Schichten haben <code>planned_staff = 0</code>,
                    deshalb konnte niemand eingeteilt werden.
                  </p>
                  <button onClick={fixZeroDemand} disabled={fixingDemand} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 flex-shrink-0" style={{ background: "var(--akzent)" }}>
                    {fixingDemand ? <PulseLoader size={12}/> : <Sparkles size={13}/>}
                    Jetzt beheben
                  </button>
                </div>)}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                      {["Datum", t("sp.station"), "Schicht", "Mitarbeiter", "Score", "Hinweis"].map(h => (<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wider">{h}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {planResult.assignments.length === 0 ? (<tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[var(--tinte-leise)] text-sm">
                          {zeroDemandFix
                            ? "Kein Soll-Bedarf konfiguriert — siehe Hinweis oben."
                            : "Keine Mitarbeiter konnten zugeordnet werden — prüfe ob aktives Personal und Schichten für diesen Monat vorhanden sind."}
                        </td>
                      </tr>) : (() => {
                        const byStation = planResult.assignments.reduce((acc, a) => {
                            (acc[a.station] ??= []).push(a);
                            return acc;
                        }, {} as Record<string, typeof planResult.assignments>);
                        return Object.entries(byStation).flatMap(([station, entries]) => [
                            <tr key={`hdr-${station}`} className="bg-[var(--papier-tief)] border-t border-b border-[var(--linie)]">
                          <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">{station}</td>
                        </tr>,
                            ...entries.map((a, i) => (<tr key={`${station}-${i}`} className={`border-b border-[var(--linie)] last:border-b-0 hover:bg-[var(--papier-tief)] ${a.is_overtime ? "bg-[var(--warnung-flaeche)]/50" : a.reason.includes("Wunsch") ? "bg-[var(--ok-flaeche)]/40" : ""}`}>
                            <td className="px-4 py-2.5 text-[var(--tinte-matt)] tabular-nums text-xs">
                              {new Date(a.shift_date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--tinte-leise)] text-xs">—</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SHIFT_COLORS[a.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                                {SHIFT_LABELS[a.shift_type] ?? a.shift_type}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-[var(--tinte)] text-xs">
                              {a.staff_name}
                              {a.is_overtime && (<span className="ml-1.5 text-[10px] font-semibold text-[var(--warnung)] bg-[var(--warnung-flaeche)] px-1.5 py-0.5 rounded-full">ÜS</span>)}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--tinte-leise)] tabular-nums text-xs">{a.score}</td>
                            <td className="px-4 py-2.5 text-[var(--tinte-leise)] text-xs">{a.reason}</td>
                          </tr>)),
                        ]);
                    })()}
                  </tbody>
                </table>
              </div>

              
              {(planResult.springer_assignments?.length ?? 0) > 0 && (<div className="border-t border-[var(--linie)] px-4 py-3 bg-[var(--papier-tief)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>bolt</span>
                    <p className="text-xs font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">Springer / Bereitschaft ({planResult.springer_assignments!.length})</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {planResult.springer_assignments!.map((s, i) => (<span key={`${s.date}-${i}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-[var(--papier)] border border-[var(--linie)] text-[var(--tinte-matt)]">
                        <span className="font-medium text-[var(--tinte)]">{s.staff_name}</span>
                        <span className="text-[var(--tinte-leise)]">·</span>
                        {new Date(s.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </span>))}
                  </div>
                  <p className="text-[11px] text-[var(--tinte-leise)] mt-2">Bei einem Ausfall greift das Springer-System automatisch zuerst auf diese Bereitschaft zu.</p>
                </div>)}
            </div>)}

          
          {kiAnpassungen && (<div className="mb-4">
              
            </div>)}

          
          {viewMode === "monat" && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden mb-4">
              <div className="grid grid-cols-7 border-b border-[var(--linie)]">
                {DAY_NAMES_SHORT.map(d => (<div key={d} className="py-2.5 text-center text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">{d}</div>))}
              </div>
              {calGrid.map((week, wi) => (<div key={wi} className="grid grid-cols-7 border-b border-[var(--linie)] last:border-b-0">
                  {week.map((day, di) => {
                            if (!day)
                                return <div key={di} className="min-h-[80px] bg-[var(--papier-tief)]/40"/>;
                            const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const dayShifts = displayShifts.filter(s => s.date === iso);
                            const isToday = iso === todayISO();
                            const isSelected = selectedDay === iso;
                            const frueh = dayShifts.filter(s => s.shift_type === "frueh");
                            const spaet = dayShifts.filter(s => s.shift_type === "spaet");
                            const nacht = dayShifts.filter(s => s.shift_type === "nacht");
                            const underStaffed = dayShifts.some(s => s.planned_staff > 0 && s.actual_staff < s.planned_staff);
                            return (<div key={di} onClick={() => setSelectedDay(isSelected ? null : iso)} className={`min-h-[80px] p-1.5 cursor-pointer transition-colors border-r border-[var(--linie)] last:border-r-0 ${isSelected ? "bg-[var(--akzent-flaeche)] ring-2 ring-[var(--akzent)] ring-inset" :
                                    isToday ? "bg-[var(--akzent-flaeche)]/40" : "hover:bg-[var(--papier-tief)]"}`}>
                        <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-[var(--akzent)] text-white" : "text-[var(--tinte-matt)]"}`}>{day}</div>
                        {frueh.length > 0 && (<div className={`text-[10px] px-1.5 py-0.5 rounded mb-0.5 font-medium ${frueh.some(s => s.planned_staff > 0 && s.actual_staff < s.planned_staff)
                                        ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" : "bg-[var(--warnung-flaeche)] text-[var(--warnung)]"}`}>
                            F: {frueh.reduce((a, s) => a + s.actual_staff, 0)}/{frueh.reduce((a, s) => a + s.planned_staff, 0)}
                          </div>)}
                        {spaet.length > 0 && (<div className={`text-[10px] px-1.5 py-0.5 rounded mb-0.5 font-medium ${spaet.some(s => s.planned_staff > 0 && s.actual_staff < s.planned_staff)
                                        ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" : "bg-[var(--warnung-flaeche)] text-[var(--warnung)]"}`}>
                            S: {spaet.reduce((a, s) => a + s.actual_staff, 0)}/{spaet.reduce((a, s) => a + s.planned_staff, 0)}
                          </div>)}
                        {nacht.length > 0 && (<div className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${nacht.some(s => s.planned_staff > 0 && s.actual_staff < s.planned_staff)
                                        ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]"}`}>
                            N: {nacht.reduce((a, s) => a + s.actual_staff, 0)}/{nacht.reduce((a, s) => a + s.planned_staff, 0)}
                          </div>)}
                        {(springerByDate[iso]?.length ?? 0) > 0 && (<div className="text-[10px] px-1.5 py-0.5 rounded mt-0.5 font-medium bg-[var(--akzent-flaeche)] text-[var(--akzent)] truncate" title={`Bereitschaft: ${springerByDate[iso].join(", ")}`}>
                            <span className="material-symbols-outlined align-[-2px] mr-0.5" style={{ fontSize: 11 }}>notifications_active</span>{springerByDate[iso].join(", ")}
                          </div>)}
                        {underStaffed && dayShifts.length === 0 && (<div className="w-1.5 h-1.5 rounded-full bg-[var(--gefahr)] mt-1"/>)}
                      </div>);
                        })}
                </div>))}
            </div>)}

          
          {viewMode === "woche" && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] mb-4 overflow-hidden">
              
              <div className="px-4 sm:px-5 py-3 border-b border-[var(--linie)] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-semibold text-[var(--tinte)] text-sm">{fromLabel} – {toLabel}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--ok)]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] inline-block"/>{showPpbv ? "PPBV-Konform" : "Im Soll"}</span>
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--gefahr)]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--gefahr)] inline-block"/>Unterbesetzt</span>
                  <span className="flex items-center gap-1.5 text-[13px] text-[var(--warnung)]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--warnung)] inline-block"/>Burnout-Risiko</span>
                  <span className="text-[13px] text-[var(--tinte-matt)]">{displayShifts.length} {t("sp.entries")}</span>
                </div>
              </div>

              {shiftsLoading ? (<div className="flex items-center justify-center gap-3 py-16">
                  <PulseLoader size={28}/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">Schichten werden geladen…</span>
                </div>) : displayShifts.length === 0 ? (<div className="py-14 text-center">
                  <span className="material-symbols-outlined text-[var(--linie)] mb-3 block" style={{ fontSize: 36 }}>calendar_month</span>
                  <p className="text-[var(--tinte-matt)] text-sm">{t("sp.noShifts")}</p>
                </div>) : (<>
                
                <div className="overflow-x-auto hidden md:block">
                  {(() => {
                            const weekDates = Array.from({ length: 7 }, (_, i) => {
                                const d = new Date(range.from + "T00:00:00");
                                d.setDate(d.getDate() + i);
                                return d;
                            });
                            const byStationDate = displayShifts.reduce((acc, s) => {
                                (acc[s.station] ??= {})[s.date] ??= [];
                                acc[s.station]![s.date]!.push(s);
                                return acc;
                            }, {} as Record<string, Record<string, Shift[]>>);
                            const stationKeys = stationOptions.length > 0
                                ? stationOptions.map(st => st.name)
                                : Object.keys(byStationDate);
                            const extraStations = Object.keys(byStationDate).filter(n => !stationKeys.includes(n));
                            const allStations = [...stationKeys, ...extraStations].filter(n => displayShifts.some(s => s.station === n));
                            const CELL_BG: Record<string, string> = {
                                frueh: "bg-[var(--warnung-flaeche)] border-[var(--linie)]",
                                spaet: "bg-[var(--warnung-flaeche)] border-[var(--linie)]",
                                nacht: "bg-[var(--akzent-flaeche)] border-[var(--linie)]",
                            };
                            const CELL_TEXT: Record<string, string> = {
                                frueh: "text-[var(--warnung)]",
                                spaet: "text-[var(--warnung)]",
                                nacht: "text-[var(--akzent)]",
                            };
                            const SHIFT_ABBR: Record<string, string> = {
                                frueh: "FRÜH", spaet: "SPÄT", nacht: "NACHT",
                            };
                            return (<div style={{ display: "grid", gridTemplateColumns: `160px repeat(7, minmax(110px, 1fr))`, minWidth: 940 }}>

                        
                        <div className="px-3 py-2.5 text-[10px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide border-b border-r border-[var(--linie)] bg-[var(--papier-tief)]">{t("sp.station")} / Tag</div>
                        {weekDates.map((d, i) => {
                                    const isWE = d.getDay() === 0 || d.getDay() === 6;
                                    const label = d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "").toUpperCase()
                                        + " " + d.getDate();
                                    return (<div key={i} className={`px-2 py-2.5 text-center text-[10px] font-semibold border-b border-r border-[var(--linie)] last:border-r-0 bg-[var(--papier-tief)] ${isWE ? "text-[var(--tinte-matt)]" : "text-[var(--tinte)]"}`}>
                              {label}
                            </div>);
                                })}

                        
                        {allStations.map(station => {
                                    const staShifts = displayShifts.filter(s => s.station === station && s.planned_staff > 0);
                                    const ppbvPct = staShifts.length > 0
                                        ? Math.round(staShifts.reduce((sum, s) => sum + s.actual_staff / s.planned_staff, 0) / staShifts.length * 100)
                                        : 100;
                                    const ppbvCls = ppbvPct >= 90 ? "text-[var(--ok)] bg-[var(--ok-flaeche)]" : ppbvPct >= 75 ? "text-[var(--warnung)] bg-[var(--warnung-flaeche)]" : "text-[var(--gefahr)] bg-[var(--gefahr-flaeche)]";
                                    return [
                                        <div key={`sta-${station}`} className="p-2.5 border-b border-r border-[var(--linie)] bg-[var(--papier)]">
                              <p className="text-[11px] font-semibold text-[var(--tinte)] leading-tight">{station}</p>
                              {staShifts.length > 0 && (<span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold mt-1 inline-block ${ppbvCls}`}>
                                  {showPpbv ? `PPBV ${ppbvPct}%` : `${ppbvPct}%`}
                                </span>)}
                            </div>,
                                        ...weekDates.map((d, dayIdx) => {
                                            const iso = toLocalISODate(d);
                                            const cellShifts = byStationDate[station]?.[iso] ?? [];
                                            return (<div key={`${station}-${dayIdx}`} className="p-1.5 border-b border-r border-[var(--linie)] last:border-r-0 min-h-[80px]">
                                  {cellShifts.map(s => {
                                                    const compliance = s.planned_staff > 0 ? Math.round(s.actual_staff / s.planned_staff * 100) : 100;
                                                    const isUnder = compliance < 75;
                                                    const isWarn = compliance >= 75 && compliance < 90;
                                                    const bg = isUnder ? "bg-[var(--gefahr-flaeche)] border-[var(--linie)]" : CELL_BG[s.shift_type] ?? "bg-[var(--papier-tief)] border-[var(--linie)]";
                                                    const txt = isUnder ? "text-[var(--gefahr)]" : CELL_TEXT[s.shift_type] ?? "text-[var(--tinte-matt)]";
                                                    const timeStr = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : SHIFT_ABBR[s.shift_type] ?? s.shift_type;
                                                    const assigned = assignmentsByShift[s.id] ?? [];
                                                    return (<div key={s.id} className={`rounded-lg p-1.5 mb-1 last:mb-0 border group ${bg}`}>
                                        <div className="flex items-start justify-between gap-0.5">
                                          <p className={`text-[9px] font-semibold uppercase leading-tight ${txt}`}>{timeStr}</p>
                                          <div className="flex gap-0.5 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0">
                                            <button onClick={() => startEdit(s)} className="p-0.5 rounded hover:bg-white/60" title="Bearbeiten">
                                              <Pencil size={8} className="text-[var(--tinte-matt)]"/>
                                            </button>
                                            <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className="p-0.5 rounded hover:bg-white/60" title="Löschen">
                                              {deleting === s.id ? <PulseLoader size={8}/> : <Trash2 size={8} className="text-[var(--gefahr)]"/>}
                                            </button>
                                          </div>
                                        </div>
                                        <StaffAssign shiftId={s.id} assigned={assigned} fehlt={fehlzeitenByShift[s.id]} staffNames={staffNames} aerzte={aerzteNamen} dense open={assignFor === s.id} onOpen={() => { setAssignFor(s.id); setAssignName(""); setAssignError(""); }} onClose={() => { setAssignFor(null); setAssignName(""); }} value={assignName} onChange={setAssignName} busy={assignBusy === s.id} onAssign={assignStaff} onUnassign={unassignStaff}/>
                                        {isUnder && <span className="text-[8px] font-semibold text-[var(--gefahr)]">Unterbesetzt</span>}
                                        {isWarn && <span className={`text-[8px] font-semibold ${txt}`}>Burnout-Risiko</span>}
                                        {arbZGViolatingShiftIds.has(s.id) && (<span className="text-[8px] font-semibold text-[var(--warnung)]">⚠ §5 ArbZG</span>)}
                                      </div>);
                                                })}
                                  {cellShifts.length === 0 && (<button onClick={() => { setForm(f => ({ ...f, date: iso, station })); setShowForm(true); setSaveError(""); }} className="w-full min-h-[60px] rounded-lg border border-dashed border-[var(--linie)] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                      <Plus size={11} className="text-[var(--linie)]"/>
                                    </button>)}
                                </div>);
                                        }),
                                    ];
                                })}

                        
                        <div className="px-3 py-2 text-[10px] font-semibold text-[var(--tinte-matt)] border-t border-r border-[var(--linie)] bg-[var(--papier-tief)]">Netto Auslastung</div>
                        {weekDates.map((d, i) => {
                                    const iso = toLocalISODate(d);
                                    const dayShifts = displayShifts.filter(s => s.date === iso && s.planned_staff > 0);
                                    if (dayShifts.length === 0)
                                        return (<div key={i} className="px-2 py-2 text-center text-[10px] font-semibold border-t border-r border-[var(--linie)] last:border-r-0 bg-[var(--papier-tief)] text-[var(--tinte-leise)]">—</div>);
                                    const avg = dayShifts.reduce((sum, s) => sum + s.actual_staff / s.planned_staff, 0) / dayShifts.length;
                                    const pct = Math.round(avg * 100);
                                    const col = pct >= 90 ? "text-[var(--ok)]" : pct >= 75 ? "text-[var(--warnung)]" : "text-[var(--gefahr)]";
                                    return (<div key={i} className={`px-2 py-2 text-center text-[10px] font-semibold border-t border-r border-[var(--linie)] last:border-r-0 bg-[var(--papier-tief)] ${col}`}>{pct}%</div>);
                                })}
                      </div>);
                        })()}
                </div>

                
                <div className="md:hidden divide-y divide-[var(--linie)]">
                  {(() => {
                            const weekDates = Array.from({ length: 7 }, (_, i) => {
                                const d = new Date(range.from + "T00:00:00");
                                d.setDate(d.getDate() + i);
                                return d;
                            });
                            const byDate = displayShifts.reduce((acc, s) => {
                                (acc[s.date] ??= []).push(s);
                                return acc;
                            }, {} as Record<string, Shift[]>);
                            return weekDates.map((d, i) => {
                                const iso = toLocalISODate(d);
                                const dayShifts = (byDate[iso] ?? []).filter(s => s.planned_staff > 0);
                                const isWE = d.getDay() === 0 || d.getDay() === 6;
                                const label = d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" });
                                return (<div key={i} className="px-4 py-3">
                          <p className={`text-[13px] font-semibold mb-2 ${isWE ? "text-[var(--tinte-matt)]" : "text-[var(--tinte)]"}`}>{label}</p>
                          {dayShifts.length === 0 ? (<p className="text-[12px] text-[var(--tinte-leise)]">Keine Schichten</p>) : (<div className="space-y-1.5">
                              {dayShifts.map(s => {
                                            const compliance = s.planned_staff > 0 ? Math.round(s.actual_staff / s.planned_staff * 100) : 100;
                                            const isUnder = compliance < 75;
                                            const isWarn = compliance >= 75 && compliance < 90;
                                            const bg = isUnder ? "bg-[var(--gefahr-flaeche)] border-[var(--linie)]" : "bg-[var(--papier-tief)] border-[var(--linie)]";
                                            const timeStr = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : s.shift_type;
                                            return (<button key={s.id} onClick={() => startEdit(s)} className={`w-full text-left rounded-xl border p-3 ${bg} active:scale-[0.99] transition-transform`}>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-[14px] font-semibold text-[var(--tinte)] truncate">{s.station}</p>
                                        <p className="text-[13px] text-[var(--tinte-matt)] tabular-nums">{timeStr}</p>
                                      </div>
                                      <span className={`text-[15px] font-semibold tabular-nums flex-shrink-0 ${isUnder ? "text-[var(--gefahr)]" : isWarn ? "text-[var(--warnung)]" : "text-[var(--ok)]"}`}>
                                        {s.actual_staff}/{s.planned_staff}
                                      </span>
                                    </div>
                                  </button>);
                                        })}
                            </div>)}
                        </div>);
                            });
                        })()}
                </div>
                </>)}

              
              {editingId && (<div className="border-t border-[var(--akzent)] bg-[var(--akzent-flaeche)] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">Schicht bearbeiten</p>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded text-[var(--tinte-matt)] hover:bg-[var(--papier)]">
                      <X size={14}/>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label htmlFor="schichtplan-station" className="block text-[11px] font-medium text-[var(--tinte-matt)] mb-1">{t("sp.station")}</label>
                      {stationOptions.length > 0 ? (<select id="schichtplan-station" value={editForm.station ?? ""} onChange={e => setEditForm(f => ({ ...f, station: e.target.value }))} className="w-full px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                          {stationOptions.map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
                        </select>) : (<input type="text" value={editForm.station ?? ""} onChange={e => setEditForm(f => ({ ...f, station: e.target.value }))} className="w-full px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>)}
                    </div>
                    <div>
                      <label htmlFor="schichtplan-zeit" className="block text-[11px] font-medium text-[var(--tinte-matt)] mb-1">Zeit</label>
                      <div className="flex items-center gap-1">
                        <input id="schichtplan-zeit" type="time" value={editForm.start_time ?? ""} onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value, shift_type: deriveShiftType(e.target.value, f.end_time) }))} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none"/>
                        <span className="text-[var(--tinte-matt)] text-xs">–</span>
                        <input type="time" value={editForm.end_time ?? ""} onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none"/>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="schichtplan-geplant-ist" className="block text-[11px] font-medium text-[var(--tinte-matt)] mb-1">Geplant / Ist</label>
                      <div className="flex items-center gap-1">
                        <input id="schichtplan-geplant-ist" type="number" min={0} value={editForm.planned_staff ?? 0} onChange={e => setEditForm(f => ({ ...f, planned_staff: parseInt(e.target.value) || 0 }))} className="w-14 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none"/>
                        <span className="text-[var(--tinte-matt)] text-xs">/</span>
                        <input type="number" min={0} value={editForm.actual_staff ?? 0} onChange={e => setEditForm(f => ({ ...f, actual_staff: parseInt(e.target.value) || 0 }))} className="w-14 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier)] focus:outline-none"/>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <button onClick={saveEdit} disabled={editSaving} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--akzent)] text-white text-xs font-semibold rounded-lg hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                        {editSaving ? <PulseLoader size={12}/> : <Check size={12}/>}
                        Speichern
                      </button>
                      <button onClick={() => { handleDelete(editingId); setEditingId(null); }} className="px-3 py-2 border border-[var(--linie)] text-[var(--gefahr)] text-xs rounded-lg hover:bg-[var(--gefahr-flaeche)] transition-colors">
                        Löschen
                      </button>
                    </div>
                  </div>
                </div>)}
            </div>)}

          
          {selectedDay && viewMode === "monat" && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] mb-4 overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--linie)] flex items-center justify-between">
                <h2 className="font-semibold text-[var(--tinte)] text-sm">
                  {new Date(selectedDay + "T00:00:00").toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" })}
                </h2>
                
                <button onClick={() => {
                        setDayEditOpen(v => !v);
                        setDayEdits({});
                        setDayEditError("");
                        setEditingId(null);
                    }} aria-label={dayEditOpen ? "Bearbeiten beenden" : "Schichten dieses Tages bearbeiten"} data-tooltip={dayEditOpen ? "Bearbeiten beenden" : "Schichten dieses Tages bearbeiten"} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${dayEditOpen
                        ? "border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"
                        : "text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]"}`}>
                  {dayEditOpen ? <X size={12}/> : <Pencil size={12}/>}
                  {dayEditOpen ? "Bearbeiten beenden" : "Schichten bearbeiten"}
                </button>
              </div>
              {(springerByDate[selectedDay]?.length ?? 0) > 0 && (<div className="px-5 py-2.5 border-b border-[var(--linie)] bg-[var(--akzent-flaeche)] flex items-center gap-2 text-[12px] text-[var(--akzent)]">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bolt</span>
                  <span><span className="font-semibold">Bereitschaft / Springer:</span> {springerByDate[selectedDay].join(", ")}</span>
                </div>)}
              {shiftsLoading ? (<div className="flex items-center justify-center py-8"><PulseLoader size={20}/></div>) : dayEditOpen ? (<div className="px-5 py-4">
                  {(() => {
                            const tagesSchichten = displayShifts.filter(s => s.date === selectedDay);
                            const wert = (sch: Shift, feld: keyof Shift): unknown => dayEdits[sch.id]?.[feld] ?? sch[feld];
                            const setzen = (id: string, feld: keyof Shift, v: unknown) => setDayEdits(d => ({ ...d, [id]: { ...d[id], [feld]: v } }));
                            if (tagesSchichten.length === 0) {
                                return (<p className="text-[13px] text-[var(--tinte-matt)]">
                          Für diesen Tag gibt es noch keine Schichten. Unten anlegen.
                        </p>);
                            }
                            return (<div className="space-y-2">
                        {tagesSchichten.map(sch => {
                                    const geaendert = Boolean(dayEdits[sch.id]);
                                    return (<div key={sch.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${geaendert ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] bg-[var(--papier)]"}`}>
                              <div className="min-w-[9rem] flex-1">
                                <p className="text-[13px] font-semibold text-[var(--tinte)] truncate">{sch.station}</p>
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${SHIFT_COLORS[sch.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                                  {SHIFT_LABELS[sch.shift_type] ?? sch.shift_type}
                                </span>
                              </div>

                              <label className="flex items-center gap-1.5 text-[12px] text-[var(--tinte-matt)]">
                                Soll
                                <input type="number" min={0} max={99} value={String((wert(sch, "planned_staff") as number | null) ?? 0)} onChange={e => setzen(sch.id, "planned_staff", Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="w-16 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                              </label>

                              <label className="flex items-center gap-1.5 text-[12px] text-[var(--tinte-matt)]">
                                Von
                                <input type="time" value={(wert(sch, "start_time") as string | null) ?? ""} onChange={e => setzen(sch.id, "start_time", e.target.value || null)} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                              </label>
                              <label className="flex items-center gap-1.5 text-[12px] text-[var(--tinte-matt)]">
                                Bis
                                <input type="time" value={(wert(sch, "end_time") as string | null) ?? ""} onChange={e => setzen(sch.id, "end_time", e.target.value || null)} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                              </label>

                              <input type="text" placeholder="Notiz" value={(wert(sch, "notes") as string | null) ?? ""} onChange={e => setzen(sch.id, "notes", e.target.value)} className="flex-1 min-w-[8rem] px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>

                              
                              <span className="text-[11px] text-[var(--tinte-matt)] tabular-nums whitespace-nowrap">
                                {(assignmentsByShift[sch.id] ?? []).length} eingeteilt
                              </span>

                              <button onClick={() => handleDelete(sch.id)} disabled={deleting === sch.id} aria-label="Schicht löschen" data-tooltip="Schicht löschen" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] rounded transition-colors disabled:opacity-40">
                                {deleting === sch.id ? <PulseLoader size={13}/> : <Trash2 size={13}/>}
                              </button>
                            </div>);
                                })}
                      </div>);
                        })()}

                  {dayEditError && (<p className="mt-3 text-[12px] text-[var(--gefahr)] font-medium">{dayEditError}</p>)}

                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[var(--linie)]">
                    <button onClick={saveDayEdits} disabled={dayEditSaving || Object.keys(dayEdits).length === 0} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--akzent)] rounded-lg hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-40">
                      {dayEditSaving ? <PulseLoader size={12}/> : <Check size={12}/>}
                      {Object.keys(dayEdits).length === 0
                            ? "Keine Änderungen"
                            : `${Object.keys(dayEdits).length} Änderung${Object.keys(dayEdits).length === 1 ? "" : "en"} speichern`}
                    </button>
                    <button onClick={() => {
                            setForm(f => ({ ...f, date: selectedDay }));
                            setShowForm(true);
                            setSaveError("");
                        }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--tinte)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                      <Plus size={12}/>
                      Schicht hinzufügen
                    </button>
                    {Object.keys(dayEdits).length > 0 && (<button onClick={() => { setDayEdits({}); setDayEditError(""); }} className="px-3 py-2 text-xs font-medium text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors">
                        Änderungen verwerfen
                      </button>)}
                  </div>
                </div>) : displayShifts.filter(s => s.date === selectedDay).length === 0 ? (<div className="py-10 text-center">
                  <CalendarDays size={24} className="mx-auto text-[var(--tinte-leise)] mb-2"/>
                  <p className="text-[var(--tinte-leise)] text-sm">Keine Schichten für diesen Tag</p>
                </div>) : (<div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                        {[t("sp.station"), "Schicht", t("sp.planned"), t("sp.actual"), t("sp.compliance"), t("sp.note"), "Eingeteilt", ""].map(h => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                            const dayShifts = displayShifts.filter(s => s.date === selectedDay);
                            const byStation = dayShifts.reduce((acc, s) => {
                                (acc[s.station] ??= []).push(s);
                                return acc;
                            }, {} as Record<string, Shift[]>);
                            return Object.entries(byStation).flatMap(([station, stationShifts]) => [
                                <tr key={`hdr-${station}`} className="bg-[var(--papier-tief)] border-b border-t border-[var(--linie)]">
                            <td colSpan={8} className="px-4 py-1.5 text-xs font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">
                              {station}
                            </td>
                          </tr>,
                                ...stationShifts.map(s => renderShiftRow(s)),
                            ]);
                        })()}
                    </tbody>
                  </table>
                </div>)}
            </div>)}

          
          {showForm && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-6 mb-5">
              <h2 className="font-semibold text-[var(--tinte)] mb-4">{t("sp.shift.new")}</h2>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="schichtplan-station-2" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">{t("sp.station")}</label>
                  {mainTab !== "uebersicht" && mainTab !== "stationen" ? (<input id="schichtplan-station-2" type="text" value={mainTab} readOnly className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] text-[var(--tinte-matt)] cursor-not-allowed"/>) : stationOptions.length > 0 ? (<select value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                      {stationOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>) : (<input type="text" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} placeholder="Stationsname…" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>)}
                </div>
                <div>
                  <label htmlFor="schichtplan-date" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">{t("sp.date")}</label>
                  <input id="schichtplan-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div className="col-span-2">
                  <p className="block text-xs font-medium text-[var(--tinte-matt)] mb-2">{t("sp.shiftTime")}</p>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {(customPresets.length > 0
                        ? customPresets.map(p => ({ label: p.name, start: p.start_time, end: p.end_time, color: p.color }))
                        : SHIFT_PRESETS.map(p => ({ label: p.label, start: p.start, end: p.end, color: undefined }))).map(p => {
                        const active = form.start_time === p.start && form.end_time === p.end;
                        return (<button key={p.label} type="button" onClick={() => setForm(f => ({ ...f, start_time: p.start, end_time: p.end, custom_name: customPresets.length > 0 ? p.label : "" }))} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${active ? "text-white border-transparent" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`} style={active && p.color ? { background: p.color } : active ? { background: "#1e293b" } : {}}>
                          {p.label} {p.start}–{p.end}
                        </button>);
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="flex-1 px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                    <span className="text-[var(--tinte-leise)] font-medium text-sm">–</span>
                    <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="flex-1 px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  </div>
                </div>
                <div className="col-span-2">
                  <label htmlFor="schichtplan-schichtname-optional" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">Schichtname <span className="font-normal text-[var(--tinte-matt)]">(optional)</span></label>
                  <input id="schichtplan-schichtname-optional" type="text" value={form.custom_name} onChange={e => setForm(f => ({ ...f, custom_name: e.target.value }))} placeholder="z.B. Nachtschicht A, 24h-Dienst, Kurzdienst …" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  <p className="text-[11px] text-[var(--tinte-matt)] mt-1">Leer lassen → wird aus der Startzeit automatisch als Früh/Spät/Nacht erkannt</p>
                </div>
                <div>
                  <label htmlFor="schichtplan-planned" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">{t("sp.planned")}</label>
                  <input id="schichtplan-planned" type="number" min={0} value={form.planned_staff} onChange={e => setForm(f => ({ ...f, planned_staff: e.target.value }))} placeholder="z.B. 4" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div>
                  <label htmlFor="schichtplan-actual" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">{t("sp.actual")}</label>
                  <input id="schichtplan-actual" type="number" min={0} value={form.actual_staff} onChange={e => setForm(f => ({ ...f, actual_staff: e.target.value }))} placeholder="z.B. 3" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div className="col-span-2">
                  <label htmlFor="schichtplan-note" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">{t("sp.note")}</label>
                  <input id="schichtplan-note" type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={istPraxis ? "z.B. zwei Krankmeldungen am Empfang" : "z.B. Krankmeldung Station 2"} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div className="col-span-2">
                  {saveError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mb-3">
                      <AlertTriangle size={14}/>{saveError}
                    </div>)}
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving} aria-label="Schicht in der Datenbank speichern" data-tooltip="Schicht in der Datenbank speichern" className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors">
                      {saving ? <PulseLoader size={14}/> : <Plus size={14}/>}
                      {saving ? t("common.saving") : t("common.save")}
                    </button>
                    <button type="button" onClick={() => { setShowForm(false); setSaveError(""); }} aria-label="Formular schließen ohne zu speichern" data-tooltip="Formular schließen ohne zu speichern" className="px-5 py-2.5 text-[var(--tinte-matt)] text-sm font-medium rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)]">
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              </form>
            </div>)}

          
          {shiftsLoading && viewMode === "monat" && (<div className="flex items-center justify-center py-6">
              <PulseLoader size={20}/>
            </div>)}
        </>)}

      
      {subNav === "auswertung" && (<div className="space-y-4">
          
          <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Brain size={18} style={{ color: "#7c3aed" }}/>
                <h2 className="font-semibold text-[var(--tinte)]">KI-Analyse & Planoptimierung</h2>
                
                <KiLabel />
              </div>
              
              {kiIsDemo ? (<button type="button" onClick={handleOptimize} disabled={optimizing || !facilityName || kiDemoUsesLeft <= 0} data-tooltip={kiDemoUsesLeft <= 0 ? "In der Demo auf 2 Läufe begrenzt" : "KI analysiert die Besetzungsmuster und schlägt Optimierungen vor"} style={optimizing || !facilityName || kiDemoUsesLeft <= 0 ? {} : { background: "#7c3aed" }} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-opacity ${optimizing || !facilityName || kiDemoUsesLeft <= 0 ? "bg-[var(--papier-tief)] text-[var(--tinte-leise)] cursor-not-allowed" : "text-white hover:opacity-90"}`}>
                  {optimizing ? <PulseLoader size={14}/> : <Brain size={14}/>}
                  {optimizing ? "KI analysiert…" : `KI-Check (Demo · ${kiDemoUsesLeft} übrig)`}
                </button>) : (<span className="text-[11px] text-[var(--tinte-leise)] bg-[var(--papier-tief)] border border-[var(--linie)] px-3 py-2 rounded-lg">Läuft automatisch 1×/Monat</span>)}
            </div>
            <p className="text-[var(--tinte-leise)] text-xs mt-1">
              Die KI prüft die Besetzungsmuster einmal im Monat (kurz vor der Planerstellung) über den Vormonat und ihre früheren Notizen und legt Empfehlungen zur Entscheidung vor. Bei Annahme greifen sie ab dem nächsten ungeplanten Monat; betroffene Mitarbeiter werden informiert.
            </p>
            
            <KiDisclosureNote className="mt-2"/>

            {kiIsDemo && (<div className="flex items-center gap-3 rounded-xl border border-[var(--linie)] bg-[var(--ki-flaeche)] px-4 py-3 mt-4">
                <Brain size={16} className="text-[var(--ki)] flex-shrink-0"/>
                <p className="text-[13px] text-[var(--ki)]">
                  <strong>Demo:</strong> Du kannst den KI-Check zweimal pro Demo selbst auslösen, um den Ablauf zu sehen. Produktiv läuft er vollautomatisch jeden Monat.
                </p>
              </div>)}

            {optimizeError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mt-4">
                <AlertTriangle size={14}/>{optimizeError}
              </div>)}

            {optimizing && (<div className="flex items-center gap-3 py-5 text-[var(--tinte-leise)] text-sm mt-2">
                <PulseLoader size={18}/>
                Claude analysiert Schichtmuster und berechnet Empfehlungen…
              </div>)}

            {applyDone && (<div className="flex items-start gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg mt-4">
                <Check size={14} className="mt-0.5 flex-shrink-0"/>
                <span>
                  Empfehlungen übernommen{applyResult?.effective ? ` — wirksam ab ${applyResult.effective}` : ""}.
                  {applyResult && ` ${applyResult.updated} Schicht${applyResult.updated === 1 ? "" : "en"} angepasst.`}
                  {applyResult && applyResult.notified > 0 && ` ${applyResult.notified} betroffene Mitarbeiter benachrichtigt (In-App + E-Mail).`}
                  {applyResult && applyResult.updated === 0 && " Hinweis: Es gab keine passenden kommenden Schichten zum Anpassen — lege/generiere zuerst Schichten für den Zeitraum."}
                </span>
              </div>)}
          </div>

          
          {optimizeResult && !applyDone && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--linie)] bg-[var(--ki-flaeche)] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-[var(--ki)]">Empfehlungen der KI</h3>
                    <KiLabel variant={kiIsDemoExample ? "demo" : "ai"}/>
                  </div>
                  <p data-ai-generated={kiIsDemoExample ? "false" : "true"} className="text-[var(--ki)] text-xs mt-0.5">
                    {optimizeResult.summary}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--ki)]">
                    {selectedOpts.size}/{optimizeResult.optimizations.length} ausgewählt
                  </span>
                  <button type="button" onClick={rejectKiRecommendation} disabled={applying || kiRejecting} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-[var(--linie)] text-[var(--ki)] hover:bg-[var(--ki-flaeche)] transition-colors disabled:opacity-50">
                    {kiRejecting ? <PulseLoader size={13}/> : <X size={13}/>}
                    Ablehnen
                  </button>
                  <button type="button" onClick={applyOptimizations} disabled={applying || selectedOpts.size === 0} className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--ki)] hover:bg-[var(--ki)] transition-colors disabled:opacity-50">
                    {applying ? <PulseLoader size={13}/> : <Check size={13}/>}
                    Annehmen & anwenden
                  </button>
                </div>
              </div>

              {optimizeResult.optimizations.length === 0 ? (<div className="py-10 text-center text-[var(--tinte-leise)] text-sm">
                  <Shield size={24} className="mx-auto mb-2 text-[var(--ok)]"/>
                  Der aktuelle Plan ist bereits optimal — keine Änderungen notwendig.
                </div>) : (<div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                        {["", t("sp.station"), "Schicht", "Aktuell", "Empfohlen", "Zeit (empfohlen)", "Begründung"].map(h => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wider">{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {optimizeResult.optimizations.map((opt, i) => {
                            const diff = opt.recommended_planned_staff - opt.current_planned_staff;
                            const diffColor = diff > 0 ? "var(--ok)" : diff < 0 ? "var(--gefahr)" : "var(--tinte-leise)";
                            const selected = selectedOpts.has(i);
                            return (<tr key={i} onClick={() => setSelectedOpts(prev => {
                                    const next = new Set(prev);
                                    if (next.has(i))
                                        next.delete(i);
                                    else
                                        next.add(i);
                                    return next;
                                })} className={`border-b border-[var(--linie)] last:border-b-0 cursor-pointer transition-colors ${selected ? "bg-[var(--ki-flaeche)]/60 hover:bg-[var(--ki-flaeche)]" : "hover:bg-[var(--papier-tief)] opacity-60"}`}>
                            <td className="px-4 py-3">
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected ? "bg-[var(--ki)] border-[var(--ki)]" : "border-[var(--linie)]"}`}>
                                {selected && <Check size={10} className="text-white"/>}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--tinte)] text-xs">{opt.station}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SHIFT_COLORS[opt.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                                {opt.shift_type === "frueh" ? "Früh" : opt.shift_type === "spaet" ? "Spät" : "Nacht"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--tinte-leise)] text-xs tabular-nums">{opt.current_planned_staff} MA</td>
                            <td className="px-4 py-3 text-xs tabular-nums font-semibold" style={{ color: diffColor }}>
                              {opt.recommended_planned_staff} MA
                              {diff !== 0 && <span className="ml-1">({diff > 0 ? "+" : ""}{diff})</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--tinte-leise)]">
                              {opt.recommended_start_time && opt.recommended_end_time
                                    ? `${opt.recommended_start_time}–${opt.recommended_end_time}`
                                    : <span className="text-[var(--tinte-leise)]">unverändert</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--tinte-leise)] max-w-[200px]">{opt.reason}</td>
                          </tr>);
                        })}
                    </tbody>
                  </table>
                </div>)}
            </div>)}

          
          {staffingRecs.length > 0 && !recDismissed && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden">
              <div className="px-6 py-4 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Users size={16} className="text-[var(--warnung)] flex-shrink-0"/>
                  <h3 className="font-semibold text-[var(--warnung)]">Personalbedarf-Empfehlung</h3>
                  <span className="text-xs bg-[var(--warnung-flaeche)] text-[var(--warnung)] px-2 py-0.5 rounded-full">
                    {shifts.length} Schichten analysiert
                  </span>
                </div>
                <button onClick={dismissRec} className="text-[var(--warnung)] hover:text-[var(--warnung)] p-1.5 hover:bg-[var(--warnung-flaeche)] rounded-lg transition-colors flex-shrink-0 ml-2" aria-label="Empfehlung 7 Tage ausblenden" data-tooltip="Empfehlung 7 Tage ausblenden">
                  <X size={14}/>
                </button>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-[var(--tinte-leise)] mb-4">
                  Das System hat in Ihren bisherigen Schichtdaten Unterbesetzungsmuster erkannt. Diese Stellen sind regelmäßig unterbesetzt — eine Einstellung würde den Dienstplan entlasten.
                </p>
                <div className="space-y-2.5">
                  {staffingRecs.map((rec, i) => (<div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--warnung-flaeche)] border border-[var(--linie)]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-semibold text-[var(--tinte)] text-sm">{rec.station}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${SHIFT_COLORS[rec.shiftType] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                            {SHIFT_LABELS[rec.shiftType] ?? rec.shiftType}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--tinte-leise)]">
                          {Math.round(rec.understaffedRatio * 100)}% der Schichten unterbesetzt · ⌀ {rec.avgGap.toFixed(1)} MA unter Soll
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[var(--warnung)] font-semibold text-xl leading-none">+{rec.suggestedHires}</p>
                        <p className="text-xs text-[var(--warnung)] mt-0.5">empfohlen</p>
                      </div>
                      {(() => {
                            const vorhanden = needFor(rec.station, rec.shiftType);
                            const schluessel = `${rec.station}|${rec.shiftType}`;
                            if (vorhanden) {
                                return (<span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--papier)] border border-[var(--linie)] text-[var(--warnung)] whitespace-nowrap">
                              {STATUS_LABEL[vorhanden.status]}
                            </span>);
                            }
                            return (<button onClick={() => uebernehmeBedarf(rec)} disabled={needBusy === schluessel || needsTableMissing} title={needsTableMissing ? "Migration 20260909_staffing_needs.sql ausstehend" : undefined} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--warnung)] rounded-lg hover:bg-[var(--warnung)] transition-colors disabled:opacity-40">
                            {needBusy === schluessel ? <PulseLoader size={12}/> : <Check size={12}/>}
                            Übernehmen
                          </button>);
                        })()}
                    </div>))}
                </div>

                {needError && <p className="mt-3 text-[12px] text-[var(--gefahr)] font-medium">{needError}</p>}
                {needsTableMissing && (<p className="mt-3 text-[12px] text-[var(--warnung)]">
                    Übernehmen ist noch nicht möglich — die Migration
                    <code className="mx-1 px-1 py-0.5 rounded bg-[var(--warnung-flaeche)]">20260909_staffing_needs.sql</code>
                    muss im Supabase SQL-Editor ausgeführt werden.
                  </p>)}

                
                {needs.filter(n => n.status !== "verworfen").length > 0 && (<div className="mt-5 pt-4 border-t border-[var(--linie)]">
                    <p className="text-[12px] font-semibold text-[var(--tinte)] mb-2.5">
                      Übernommener Personalbedarf
                    </p>
                    <div className="space-y-1.5">
                      {needs.filter(n => n.status !== "verworfen").map(n => (<div key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
                          <span className="text-[13px] font-medium text-[var(--tinte)]">{n.station}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${SHIFT_COLORS[n.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                            {SHIFT_LABELS[n.shift_type] ?? n.shift_type}
                          </span>
                          <span className="text-[12px] text-[var(--tinte-matt)] tabular-nums">+{n.headcount}</span>
                          <span className="text-[11px] text-[var(--tinte-matt)]">
                            seit {new Date(n.created_at).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            {(["offen", "in_arbeit", "erledigt"] as const).map(st => (<button key={st} onClick={() => setzeBedarfStatus(n.id, st)} disabled={needBusy === n.id} className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-40 ${n.status === st
                                    ? "bg-[var(--akzent)] text-white"
                                    : "text-[var(--tinte-matt)] hover:bg-[var(--papier)] border border-[var(--linie)]"}`}>
                                {STATUS_LABEL[st]}
                              </button>))}
                            <button onClick={() => setzeBedarfStatus(n.id, "verworfen")} disabled={needBusy === n.id} aria-label="Vorgang verwerfen" data-tooltip="Vorgang verwerfen" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] rounded transition-colors disabled:opacity-40">
                              <X size={12}/>
                            </button>
                          </div>
                        </div>))}
                    </div>
                  </div>)}
              </div>
            </div>)}

          {shifts.length < 30 && shifts.length > 0 && subNav === "auswertung" && (<div className="bg-[var(--papier-tief)] rounded-2xl border border-[var(--linie)] px-6 py-5 text-sm text-[var(--tinte-leise)] flex items-center gap-3">
              <Brain size={18} className="text-[var(--tinte-leise)] flex-shrink-0"/>
              <span>
                Personalbedarfs-Empfehlung steht ab <strong className="text-[var(--tinte-matt)]">30 Schichten</strong> zur Verfügung — aktuell {shifts.length}.
              </span>
            </div>)}
        </div>)}

      
      {subNav === "wuensche" && (<div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[var(--tinte-matt)] font-medium">{t("sp.wishes.staff")}</p>
              <p className="text-[var(--tinte-leise)] text-xs mt-0.5">{t("wue.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[var(--linie)] overflow-hidden bg-[var(--papier)]">
                <button onClick={() => setWishView("mitarbeiter")} className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${wishView === "mitarbeiter" ? "bg-[var(--tinte-leise)] text-white" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  <Users size={11}/> Pro Mitarbeiter
                </button>
                <button onClick={() => setWishView("liste")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${wishView === "liste" ? "bg-[var(--tinte-leise)] text-white" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  Liste
                </button>
              </div>
              {wishView === "liste" && (["all", "offen", "berücksichtigt", "abgelehnt"] as const).map(f => (<button key={f} onClick={() => setWishFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${wishFilter === f ? "bg-[var(--tinte-leise)] text-white" : "bg-[var(--papier)] border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  {f === "all" ? t("sp.wishes.all") : f === "offen" ? t("sp.wishes.open") : f === "berücksichtigt" ? t("sp.wishes.considered") : t("sp.wishes.rejected")}
                </button>))}
            </div>
          </div>

          {wishesLoading ? (<div className="flex items-center justify-center py-14">
              <PulseLoader size={24}/>
            </div>) : wishView === "mitarbeiter" ? (() => {
                    const byName = new Map<string, StaffWish[]>();
                    for (const w of wishes) {
                        if (!byName.has(w.full_name))
                            byName.set(w.full_name, []);
                        byName.get(w.full_name)!.push(w);
                    }
                    const allNames = new Set<string>([
                        ...staff.map(s => s.full_name),
                        ...byName.keys(),
                    ]);
                    const rows = [...allNames].sort((a, b) => a.localeCompare(b, "de"));
                    if (rows.length === 0)
                        return (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] py-14 text-center">
                <Heart size={32} className="mx-auto text-[var(--tinte-leise)] mb-3"/>
                <p className="text-[var(--tinte-leise)] text-sm font-medium">{t("sp.wishes.empty")}</p>
              </div>);
                    return (<div className="space-y-2">
                {rows.map(name => {
                            const memberWishes = byName.get(name) ?? [];
                            const staffMember = staff.find(s => s.full_name === name);
                            const isExpanded = expandedStaff.has(name);
                            const openCount = memberWishes.filter(w => w.status === "offen").length;
                            const blockedCount = memberWishes.filter(w => w.wish_type === "unavailable").length;
                            const prefCount = memberWishes.filter(w => w.wish_type === "preference").length;
                            const avoidCount = memberWishes.filter(w => w.wish_type === "avoid").length;
                            return (<div key={name} className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden">
                      <button onClick={() => setExpandedStaff(prev => {
                                    const next = new Set(prev);
                                    if (next.has(name))
                                        next.delete(name);
                                    else
                                        next.add(name);
                                    return next;
                                })} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--papier-tief)] transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--papier-tief)] flex items-center justify-center text-[var(--tinte-matt)] text-sm font-semibold flex-shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--tinte)]">{name}</p>
                            {staffMember && (<p className="text-xs text-[var(--tinte-leise)]">{staffMember.role}</p>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {blockedCount > 0 && (<span className="text-xs bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)] px-2 py-0.5 rounded-full font-medium">
                              {blockedCount}× nicht verfügbar
                            </span>)}
                          {avoidCount > 0 && (<span className="text-xs bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)] px-2 py-0.5 rounded-full font-medium">
                              {avoidCount}× vermeiden
                            </span>)}
                          {prefCount > 0 && (<span className="text-xs bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)] px-2 py-0.5 rounded-full font-medium">
                              {prefCount}× Wunsch
                            </span>)}
                          {openCount > 0 && (<span className="w-5 h-5 rounded-full bg-[var(--warnung)] text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                              {openCount}
                            </span>)}
                          {memberWishes.length === 0 && (<span className="text-xs text-[var(--tinte-leise)]">Keine Wünsche</span>)}
                          <ChevronRight size={14} className={`text-[var(--tinte-leise)] transition-transform ${isExpanded ? "rotate-90" : ""}`}/>
                        </div>
                      </button>

                      {isExpanded && memberWishes.length > 0 && (<div className="border-t border-[var(--linie)] divide-y divide-[var(--linie)]">
                          {memberWishes.map(w => {
                                        const wishType = WISH_TYPE_LABELS[w.wish_type] ?? WISH_TYPE_LABELS.preference;
                                        const statusInfo = WISH_STATUS[w.status] ?? WISH_STATUS.offen;
                                        const StatusIcon = statusInfo.icon;
                                        const isUpdating = updatingWish === w.id;
                                        return (<div key={w.id} className="px-5 py-3 flex items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span style={{ background: `color-mix(in srgb, ${wishType.color} 8%, var(--papier))`, color: wishType.color, border: "1px solid var(--linie)" }} className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                                      {wishType.label}
                                    </span>
                                    {(w.date_from || w.date_to) && (<span className="text-xs font-medium text-[var(--tinte-matt)] tabular-nums">
                                        {w.date_from && new Date(w.date_from + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" })}
                                        {w.date_from && w.date_to && w.date_from !== w.date_to && " – "}
                                        {w.date_to && w.date_from !== w.date_to && new Date(w.date_to + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" })}
                                      </span>)}
                                    <span className="text-xs text-[var(--tinte-leise)]">
                                      {w.shift_type === "all" ? t("wue.shift.all") : w.shift_type === "frueh" ? t("wue.shift.early") : w.shift_type === "spaet" ? t("wue.shift.late") : t("wue.shift.night")}
                                    </span>
                                  </div>
                                  <p className="text-[var(--tinte-matt)] text-xs leading-relaxed">{w.message}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className="flex items-center gap-1" style={{ color: statusInfo.color }}>
                                    <StatusIcon size={12}/>
                                    <span className="text-xs font-medium">{statusInfo.label}</span>
                                  </span>
                                  {w.status === "offen" ? (<>
                                      <button onClick={() => updateWishStatus(w.id, "berücksichtigt")} disabled={isUpdating} aria-label="Berücksichtigen" data-tooltip="Berücksichtigen" className="p-1.5 rounded-lg text-[var(--ok)] hover:bg-[var(--ok-flaeche)] transition-colors disabled:opacity-50">
                                        {isUpdating ? <PulseLoader size={13}/> : <CheckCircle size={13}/>}
                                      </button>
                                      <button onClick={() => updateWishStatus(w.id, "abgelehnt")} disabled={isUpdating} aria-label="Ablehnen" data-tooltip="Ablehnen" className="p-1.5 rounded-lg text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                                        <XCircle size={13}/>
                                      </button>
                                    </>) : (<button onClick={() => updateWishStatus(w.id, "offen")} disabled={isUpdating} aria-label="Zurücksetzen" data-tooltip="Zurücksetzen" className="p-1.5 rounded-lg text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-50">
                                      <Clock size={13}/>
                                    </button>)}
                                </div>
                              </div>);
                                    })}
                        </div>)}
                      {isExpanded && memberWishes.length === 0 && (<div className="border-t border-[var(--linie)] px-5 py-3">
                          <p className="text-[var(--tinte-leise)] text-xs">Keine Wünsche oder Sperren eingetragen.</p>
                        </div>)}
                    </div>);
                        })}
              </div>);
                })() : (<div className="space-y-3">
              {wishes
                        .filter(w => wishFilter === "all" || w.status === wishFilter)
                        .map(w => {
                        const wishType = WISH_TYPE_LABELS[w.wish_type] ?? WISH_TYPE_LABELS.preference;
                        const statusInfo = WISH_STATUS[w.status] ?? WISH_STATUS.offen;
                        const StatusIcon = statusInfo.icon;
                        const isUpdating = updatingWish === w.id;
                        return (<div key={w.id} className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-[var(--tinte)] text-sm">{w.full_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span style={{ background: `color-mix(in srgb, ${wishType.color} 8%, var(--papier))`, color: wishType.color, border: "1px solid var(--linie)" }} className="text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              {wishType.label}
                            </span>
                            <span className="text-xs text-[var(--tinte-leise)]">
                              {w.shift_type === "all" ? t("wue.shift.all") : w.shift_type === "frueh" ? t("wue.shift.early") : w.shift_type === "spaet" ? t("wue.shift.late") : t("wue.shift.night")}
                            </span>
                            {(w.date_from || w.date_to) && (<span className="text-xs text-[var(--tinte-leise)]">
                                {w.date_from && new Date(w.date_from + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                                {w.date_from && w.date_to && " – "}
                                {w.date_to && new Date(w.date_to + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                              </span>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5" style={{ color: statusInfo.color }}>
                          <StatusIcon size={13}/>
                          <span className="text-xs font-medium">{statusInfo.label}</span>
                        </div>
                      </div>
                      <p className="text-[var(--tinte-matt)] text-sm mb-3">{w.message}</p>
                      {w.status === "offen" && (<div className="flex gap-2">
                          <button onClick={() => updateWishStatus(w.id, "berücksichtigt")} disabled={isUpdating} aria-label="Wunsch als berücksichtigt markieren" data-tooltip="Wunsch als berücksichtigt markieren" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-lg hover:bg-[var(--ok-flaeche)] transition-colors disabled:opacity-50">
                            {isUpdating ? <PulseLoader size={11}/> : <CheckCircle size={11}/>}
                            {t("sp.wishes.consider")}
                          </button>
                          <button onClick={() => updateWishStatus(w.id, "abgelehnt")} disabled={isUpdating} aria-label="Wunsch ablehnen" data-tooltip="Wunsch ablehnen" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                            {isUpdating ? <PulseLoader size={11}/> : <XCircle size={11}/>}
                            {t("sp.wishes.reject")}
                          </button>
                        </div>)}
                      {w.status !== "offen" && (<button onClick={() => updateWishStatus(w.id, "offen")} disabled={isUpdating} aria-label="Status zurücksetzen auf offen" data-tooltip="Status zurücksetzen auf offen" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--tinte-matt)] bg-[var(--papier-tief)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-50">
                          {isUpdating ? <PulseLoader size={11}/> : <Clock size={11}/>}
                          {t("sp.wishes.reset")}
                        </button>)}
                      <p className="text-[var(--tinte-leise)] text-xs mt-3">
                        {t("ula.submitted")} {new Date(w.created_at).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </p>
                    </div>);
                    })}
              {wishes.filter(w => wishFilter === "all" || w.status === wishFilter).length === 0 && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] py-14 text-center">
                  <Heart size={32} className="mx-auto text-[var(--tinte-leise)] mb-3"/>
                  <p className="text-[var(--tinte-leise)] text-sm font-medium">{t("sp.wishes.empty")}</p>
                  <p className="text-[var(--tinte-leise)] text-xs mt-1">{t("sp.wishes.emptyHint")}</p>
                </div>)}
            </div>)}
        </div>)}

      
      
      {subNav === "personal" && (<div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[var(--tinte-matt)] font-medium">{staff.length} {t("sp.wishes.staff")}</p>
              <p className="text-[var(--tinte-leise)] text-xs mt-0.5">{t("ma.subtitle")}</p>
            </div>
            <button onClick={() => { setShowStaffForm(v => !v); setStaffError(""); }} aria-label="Neues Teammitglied hinzufügen" data-tooltip="Neues Teammitglied hinzufügen" className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
              <Plus size={15}/>
              {t("sp.team.add")}
            </button>
          </div>

          {showStaffForm && (<div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-5 mb-5">
              <h2 className="font-semibold text-[var(--tinte)] mb-4">{t("sp.team.add")}</h2>
              <form onSubmit={handleAddStaff} className="grid grid-cols-2 gap-3">
                <div className="col-span-2 md:col-span-1">
                  <label htmlFor="schichtplan-name" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">Name</label>
                  <input id="schichtplan-name" type="text" required value={staffForm.full_name} onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Vorname Nachname" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div>
                  <label htmlFor="schichtplan-rolle" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">Beruf</label>
                  <BerufAuswahl id="schichtplan-rolle" value={staffForm.role} plan={einrichtungsTyp} onChange={v => setStaffForm(f => ({ ...f, role: v }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div>
                  <label htmlFor="schichtplan-beschaeftigungsart" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">Beschäftigungsart</label>
                  <select id="schichtplan-beschaeftigungsart" value={staffForm.job_type} onChange={e => setStaffForm(f => ({
                        ...f, job_type: e.target.value, max_hours_per_week: DEFAULT_HOURS[e.target.value] ?? 40,
                    }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                    {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="schichtplan-max-std-woche" className="block text-xs font-medium text-[var(--tinte-matt)] mb-1.5">Max. Std/Woche</label>
                  <input id="schichtplan-max-std-woche" type="number" min={1} max={60} value={staffForm.max_hours_per_week} onChange={e => setStaffForm(f => ({ ...f, max_hours_per_week: parseInt(e.target.value) || 40 }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                {staffError && <p className="col-span-2 text-[var(--gefahr)] text-xs">{staffError}</p>}
                <div className="col-span-2 flex gap-2">
                  <button type="submit" disabled={staffSaving} aria-label="Mitarbeiter speichern" data-tooltip="Mitarbeiter speichern" className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors">
                    {staffSaving ? <PulseLoader size={14}/> : <Plus size={14}/>}
                    Speichern
                  </button>
                  <button type="button" onClick={() => setShowStaffForm(false)} aria-label="Formular schließen" data-tooltip="Formular schließen" className="px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]">
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>)}

          <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] overflow-hidden">
            {staffLoading ? (<div className="flex items-center justify-center py-12">
                <PulseLoader size={24}/>
              </div>) : staff.length === 0 ? (<div className="py-14 text-center">
                <Users size={32} className="mx-auto text-[var(--tinte-leise)] mb-3"/>
                <p className="text-[var(--tinte-leise)] text-sm font-medium">{t("sp.team.empty")}</p>
                <p className="text-[var(--tinte-leise)] text-xs mt-1">{t("ma.noStaff")}</p>
              </div>) : (<table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Rolle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Beschäftigung</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Std/Wo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--linie)]">
                  {staff.map(m => {
                        const isEditingStaff = editingStaffId === m.id;
                        if (isEditingStaff) {
                            return (<tr key={m.id} className="bg-[var(--akzent-flaeche)]">
                          <td className="px-4 py-2 font-medium text-[var(--tinte)]">{m.full_name}</td>
                          <td className="px-4 py-2">
                            <BerufAuswahl value={editingStaffForm.role ?? m.role} plan={einrichtungsTyp} onChange={v => setEditingStaffForm(f => ({ ...f, role: v }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs"/>
                          </td>
                          <td className="px-4 py-2">
                            <select value={editingStaffForm.job_type ?? m.job_type} onChange={e => setEditingStaffForm(f => ({
                                    ...f, job_type: e.target.value,
                                    max_hours_per_week: DEFAULT_HOURS[e.target.value] ?? f.max_hours_per_week,
                                }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs">
                              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" min={1} max={60} value={editingStaffForm.max_hours_per_week ?? m.max_hours_per_week} onChange={e => setEditingStaffForm(f => ({ ...f, max_hours_per_week: parseInt(e.target.value) || 40 }))} className="w-16 px-2 py-1 border border-[var(--linie)] rounded text-xs"/>
                          </td>
                          <td className="px-4 py-2">
                            <select value={String(editingStaffForm.active ?? m.active)} onChange={e => setEditingStaffForm(f => ({ ...f, active: e.target.value === "true" }))} className="px-2 py-1 border border-[var(--linie)] rounded text-xs">
                              <option value="true">Aktiv</option>
                              <option value="false">Inaktiv</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => handleUpdateStaff(m.id)} disabled={staffEditSaving} aria-label="Änderungen speichern" data-tooltip="Änderungen speichern" className="p-1.5 text-[var(--ok)] hover:bg-[var(--ok-flaeche)] rounded transition-colors disabled:opacity-50">
                                {staffEditSaving ? <PulseLoader size={13}/> : <Check size={13}/>}
                              </button>
                              <button onClick={() => setEditingStaffId(null)} aria-label="Bearbeitung abbrechen" data-tooltip="Bearbeitung abbrechen" className="p-1.5 text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] rounded transition-colors">
                                <X size={13}/>
                              </button>
                            </div>
                          </td>
                        </tr>);
                        }
                        return (<tr key={m.id} className="hover:bg-[var(--papier-tief)] transition-colors">
                        <td className="px-4 py-3 font-medium text-[var(--tinte)]">{m.full_name}</td>
                        <td className="px-4 py-3 text-[var(--tinte-leise)]">{m.role}</td>
                        <td className="px-4 py-3 text-[var(--tinte-leise)]">{m.job_type || "Vollzeit"}</td>
                        <td className="px-4 py-3 text-[var(--tinte-leise)]">{m.max_hours_per_week || 40}h</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.active ? "bg-[var(--ok-flaeche)] text-[var(--ok)]" : "bg-[var(--papier-tief)] text-[var(--tinte-leise)]"}`}>
                            {m.active ? "Aktiv" : "Inaktiv"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setEditingStaffId(m.id); setEditingStaffForm({}); }} aria-label="Mitarbeiter bearbeiten" data-tooltip="Mitarbeiter bearbeiten" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] rounded transition-colors">
                              <Pencil size={13}/>
                            </button>
                            <button onClick={() => handleDeleteStaff(m.id)} disabled={deletingStaff === m.id} aria-label="Mitarbeiter entfernen" data-tooltip="Mitarbeiter entfernen" className="p-1.5 text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] rounded transition-colors disabled:opacity-40">
                              {deletingStaff === m.id ? <PulseLoader size={13}/> : <Trash2 size={13}/>}
                            </button>
                          </div>
                        </td>
                      </tr>);
                    })}
                </tbody>
              </table>)}
          </div>
        </div>)}

          </div>

          
          {subNav === "dienstplan" && (<aside className="w-full xl:w-72 flex-shrink-0 border-t xl:border-t-0 xl:border-l border-[var(--linie)] bg-[var(--papier)] xl:overflow-y-auto flex flex-col gap-4 p-4">

              
              
              <button type="button" className="w-full text-left rounded-2xl p-4 bg-[var(--ki-flaeche)] border border-[var(--linie)] transition-transform duration-[120ms] ease-out active:scale-[0.98]" onClick={() => setSubNav("auswertung")}>
                <span className="flex items-center gap-2 mb-2">
                  <Sparkles size={15} className="text-[var(--ki)]"/>
                  <span className="text-[var(--ki)] font-semibold text-sm">KI-Analyse</span>
                </span>
                {optimizeResult ? (<span className="grid grid-cols-2 gap-2">
                    <span className="block bg-[var(--papier)] rounded-lg p-2 text-center">
                      <span className="block text-[var(--tinte)] font-semibold text-lg">{optimizeResult.optimizations.length}</span>
                      <span className="block text-[var(--tinte-leise)] text-[13px]">Empfehlungen</span>
                    </span>
                    <span className="block bg-[var(--papier)] rounded-lg p-2 text-center">
                      <span className="block text-[var(--tinte)] font-semibold text-lg">{applyDone ? "✓" : "—"}</span>
                      <span className="block text-[var(--tinte-leise)] text-[13px]">{applyDone ? "Angewendet" : "Ausstehend"}</span>
                    </span>
                  </span>) : (<span className="block text-[var(--tinte-leise)] text-[13px]">Schichtplan analysieren und optimieren →</span>)}
              </button>

              
              {istPraxis && (<button type="button" className="w-full text-left rounded-2xl p-4 bg-[var(--ki-flaeche)] border border-[var(--linie)] transition-transform duration-[120ms] ease-out active:scale-[0.98]" onClick={() => setShowRasterAssistent(true)}>
                  <span className="flex items-center gap-2 mb-1">
                    <Sparkles size={15} className="text-[var(--ki)]"/>
                    <span className="text-[var(--ki)] font-semibold text-sm">Raster ändern</span>
                  </span>
                  <span className="block text-[var(--tinte-leise)] text-[13px]">Schreiben oder sagen, was sich an Zeiten, Tagen oder Besetzung ändern soll →</span>
                </button>)}

              
              <div data-fuehrung="rechtssicherheit" className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-[var(--tinte-matt)]"/>
                  <span className="font-semibold text-[var(--tinte)] text-sm">Rechtssicherheit</span>
                </div>
                <div className="w-full bg-[var(--papier-tief)] rounded-full h-1.5 mb-3">
                  <div className="h-1.5 rounded-full transition-[width,background-color] duration-[240ms]" style={{ width: `${avgCompliance}%`, background: compColor }}/>
                </div>
                {([
                    { label: "Besetzungsquote", ok: avgCompliance >= 90, count: undefined as number | undefined },
                    { label: "Ruhezeiten §5 ArbZG", ok: arbZGViolations.length === 0, count: arbZGViolations.length },
                    { label: "Arbeitszeit §§3, 6, 11 ArbZG", ok: weitereVerstoesse.length === 0, count: weitereVerstoesse.length },
                    ...(showPpbv ? [{ label: "PPR 2.0", ok: shifts.length > 0, count: undefined as number | undefined }] : []),
                ] satisfies {
                    label: string;
                    ok: boolean;
                    count: number | undefined;
                }[]).map(({ label, ok, count }) => (<div key={label} className="flex items-center gap-2 mb-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-[var(--ok)]" : count !== undefined ? "bg-[var(--gefahr)]" : "bg-[var(--warnung)]"}`}/>
                    <span className="text-xs text-[var(--tinte-matt)]">{label}</span>
                    <span className={`text-xs font-medium ml-auto ${ok ? "text-[var(--ok)]" : count !== undefined ? "text-[var(--gefahr)]" : "text-[var(--warnung)]"}`}>
                      {ok ? "OK" : count !== undefined ? `${count} Verstoß${count !== 1 ? "e" : ""}` : "Prüfen"}
                    </span>
                  </div>))}
                {arbzgBefundZeilen.length > 0 && (<div className="mt-3 space-y-1.5 border-t border-[var(--linie)] pt-3">
                    {arbzgBefundZeilen.slice(0, 3).map((b, i) => (<div key={i} className="bg-[var(--gefahr-flaeche)] rounded-lg p-2">
                        <p className="text-[10px] font-semibold text-[var(--gefahr)]">{b.person}</p>
                        <p className="text-[10px] text-[var(--gefahr)] mt-0.5">{b.text}</p>
                      </div>))}
                    {arbzgBefundZeilen.length > 3 && (<p className="text-[10px] text-[var(--gefahr)] text-center">
                        +{arbzgBefundZeilen.length - 3} weitere Verstöße
                      </p>)}
                  </div>)}
              </div>

              
              <div className="bg-[var(--papier)] rounded-2xl border border-[var(--linie)] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-[var(--gefahr)]"/>
                    <span className="font-semibold text-[var(--tinte)] text-sm">Wünsche</span>
                  </div>
                  {openWishes.length > 0 && (<span className="bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] text-xs font-semibold px-2 py-0.5 rounded-full">
                      {openWishes.length} offen
                    </span>)}
                </div>
                {openWishes.length === 0 ? (<p className="text-[var(--tinte-leise)] text-xs">Keine offenen Wünsche</p>) : (<div className="space-y-2">
                    {openWishes.slice(0, 3).map(w => (<div key={w.id} onClick={() => setSubNav("wuensche")} className="bg-[var(--papier-tief)] rounded-lg p-2.5 cursor-pointer hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <p className="text-xs font-medium text-[var(--tinte)]">{w.full_name}</p>
                        <p className="text-[10px] text-[var(--tinte-leise)] mt-0.5 truncate">{w.message || w.wish_type}</p>
                      </div>))}
                    {openWishes.length > 3 && (<button onClick={() => setSubNav("wuensche")} aria-label="Alle offenen Wünsche anzeigen" data-tooltip="Alle offenen Wünsche anzeigen" className="text-xs text-[var(--akzent)] font-medium w-full text-center pt-1">
                        +{openWishes.length - 3} weitere →
                      </button>)}
                  </div>)}
              </div>
            </aside>)}

        </div>
      </div>)}

      
      
      {istPraxis && (<Modal open={showRasterAssistent} onClose={() => setShowRasterAssistent(false)} title="Dienstplanraster ändern" description="Das Raster bestimmt, welche Schichten der Generator anlegt. Bereits angelegte Schichten bleiben, wie sie sind." widthClass="max-w-2xl">
          
          <PraxisRasterAssistent imDialog onGespeichert={() => { praxisVorgabeGesetzt.current = false; }}/>
        </Modal>)}
      
      <Modal open={!!(pendingUnderstaffing)} onClose={() => { }} title={"Unterbesetzung aufgetreten"} description={pendingUnderstaffing ? `${pendingUnderstaffing.unfilled_slots.length} Schicht${pendingUnderstaffing.unfilled_slots.length !== 1 ? "en" : ""} konnten nicht vollständig besetzt werden` : undefined} widthClass="max-w-xl" requireDecision hideCloseButton>
        {pendingUnderstaffing && (<>
            <div className="space-y-4">
              
              <div className="flex gap-2">
                <button onClick={() => {
                const d: Record<string, "overtime" | "understaffed"> = {};
                for (const s of pendingUnderstaffing.unfilled_slots) {
                    d[s.shift_id] = s.overtime_candidates.length > 0 ? "overtime" : "understaffed";
                }
                setSlotDecisions(d);
            }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                  Alle: Überstunden
                </button>
                <button onClick={() => {
                const d: Record<string, "overtime" | "understaffed"> = {};
                for (const s of pendingUnderstaffing.unfilled_slots)
                    d[s.shift_id] = "understaffed";
                setSlotDecisions(d);
            }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person_off</span>
                  Alle: Unterbesetzt lassen
                </button>
              </div>

              
              <div className="space-y-3">
                {pendingUnderstaffing.unfilled_slots.map(slot => {
                const decision = slotDecisions[slot.shift_id] ?? "understaffed";
                const fmt = new Date(slot.shift_date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
                const shiftLabel: Record<string, string> = { frueh: "Früh", spaet: "Spät", nacht: "Nacht" };
                return (<div key={slot.shift_id} className="border border-[var(--linie)] rounded-xl p-4 bg-[var(--papier-tief)]">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--tinte)]">{slot.station} · {shiftLabel[slot.shift_type] ?? slot.shift_type}</div>
                          <div className="text-[11px] text-[var(--tinte-matt)]">{fmt} · {slot.slots_missing} Platz{slot.slots_missing !== 1 ? "  fehlen" : " fehlt"} ({slot.slots_filled}/{slot.slots_needed} besetzt)</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setSlotDecisions(d => ({ ...d, [slot.shift_id]: "overtime" }))} disabled={slot.overtime_candidates.length === 0} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${decision === "overtime"
                        ? "bg-[var(--warnung)] border-[var(--warnung)] text-white"
                        : "bg-[var(--papier)] border-[var(--linie)] text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)]"}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                          {slot.overtime_candidates.length > 0
                        ? `Überstunden (${slot.overtime_candidates[0].staff_name}${slot.overtime_candidates.length > 1 ? ` +${slot.overtime_candidates.length - 1}` : ""})`
                        : "Keine Kandidaten"}
                        </button>
                        <button onClick={() => setSlotDecisions(d => ({ ...d, [slot.shift_id]: "understaffed" }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg border transition-colors ${decision === "understaffed"
                        ? "bg-[var(--tinte-leise)] border-[var(--linie)] text-white"
                        : "bg-[var(--papier)] border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>person_off</span>
                          Unterbesetzt lassen
                        </button>
                      </div>
                    </div>);
            })}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={resolveUnderstaffing} disabled={planSaving} className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-white text-[13px] font-semibold rounded-xl bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                  {planSaving ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span>}
                  Plan bestätigen & speichern
                </button>
              </div>
            </div>
          </>)}
      </Modal>

      <Modal open={showGeneratorModal} onClose={() => setShowGeneratorModal(false)} title={genAction === "shifts-only" ? "Plan befüllen" : "Dienstplan generieren"} widthClass="max-w-2xl">
        {showGeneratorModal && (<>
            <div className="space-y-6">

              
              <div>
                <p className="text-[12px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-2">Zeitraum</p>
                <div className="flex gap-2">
                  <select value={planMonth} onChange={e => setPlanMonth(Number(e.target.value))} className="flex-1 px-3 py-2.5 text-sm border border-[var(--linie)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
                    {MONTH_NAMES_DE.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select value={planYear} onChange={e => setPlanYear(Number(e.target.value))} className="w-28 px-3 py-2.5 text-sm border border-[var(--linie)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
                    {[-1, 0, 1].map(off => { const y = new Date().getFullYear() + off; return <option key={y} value={y}>{y}</option>; })}
                  </select>
                </div>
              </div>

              {istPraxis && (<p className="mb-3 text-[13px] text-[var(--tinte-matt)]">
                  Vorbelegt aus Ihrem Dienstplanraster{praxisTurnus ? ", Schichten im Turnus nur in ihren Wochen" : ""}.{" "}
                  <a href="/einstellungen#dienstplanraster" className="text-[var(--akzent)] font-medium hover:underline">Raster dauerhaft ändern, auch per KI</a>
                </p>)}

              
              <div>
                <p className="text-[12px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-2">Besetzungsregeln</p>
                <div className="flex rounded-lg border border-[var(--linie)] overflow-hidden w-fit mb-4">
                  {(["alle", "pro-tag"] as const).map(m => (<button key={m} onClick={() => setGenConfigMode(m)} className={`px-4 py-2 text-sm font-medium transition-colors ${genConfigMode === m ? "bg-[var(--tinte)] text-white" : "text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                      {m === "alle" ? "Alle Tage gleich" : "Pro Wochentag"}
                    </button>))}
                </div>

                
                {genConfigMode === "alle" && (<div className="space-y-3">
                    {(["frueh", "spaet", "nacht"] as const).map(st => {
                    const cfg = genAlleConfig[st];
                    const label = st === "frueh" ? "Frühschicht" : st === "spaet" ? "Spätschicht" : "Nachtschicht";
                    const accent = st === "frueh" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : st === "spaet" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]";
                    return (<div key={st} className={`rounded-xl border p-4 transition-opacity ${cfg.enabled ? "border-[var(--linie)] bg-[var(--papier)]" : "border-[var(--linie)] bg-[var(--papier-tief)] opacity-60"}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <Schalter an={cfg.enabled} name={label} onClick={() => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], enabled: !c[st].enabled } }))}/>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${accent}`}>{label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[12px] text-[var(--tinte-matt)]">
                              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 13 }}>group</span>
                              <span className="font-medium">Mitarbeiter:</span>
                              <input type="number" min={0} max={50} value={cfg.staff} onChange={e => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], staff: Math.max(0, parseInt(e.target.value) || 0) } }))} className="w-14 px-2 py-1 border border-[var(--linie)] rounded-lg text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-medium text-[var(--tinte-matt)] w-6">Von</span>
                            <input type="time" value={cfg.start} onChange={e => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], start: e.target.value } }))} className="flex-1 px-3 py-2 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                            <span className="text-[var(--tinte-matt)]">–</span>
                            <input type="time" value={cfg.end} onChange={e => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], end: e.target.value } }))} className="flex-1 px-3 py-2 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                          </div>
                        </div>);
                })}
                  </div>)}

                
                {genConfigMode === "pro-tag" && (<div className="space-y-4">
                    
                    <div className="space-y-3">
                      {(["frueh", "spaet", "nacht"] as const).map(st => {
                    const cfg = genAlleConfig[st];
                    const label = st === "frueh" ? "Frühschicht" : st === "spaet" ? "Spätschicht" : "Nachtschicht";
                    const accent = st === "frueh" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : st === "spaet" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]";
                    return (<div key={st} className="rounded-xl border border-[var(--linie)] bg-[var(--papier)] p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${accent}`}>{label}</span>
                              <span className="text-[11px] text-[var(--tinte-matt)]">Zeiten (für alle Tage):</span>
                              <div className="flex items-center gap-2 ml-auto">
                                <input type="time" value={cfg.start} onChange={e => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], start: e.target.value } }))} className="w-24 px-2 py-1 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                                <span className="text-[var(--tinte-matt)] text-xs">–</span>
                                <input type="time" value={cfg.end} onChange={e => setGenAlleConfig(c => ({ ...c, [st]: { ...c[st], end: e.target.value } }))} className="w-24 px-2 py-1 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1">
                              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day, i) => {
                            const dow = String(i);
                            const dayCfg = genProTagConfig[dow] ?? genAlleConfig;
                            const stCfg = dayCfg[st];
                            return (<div key={day} className="flex flex-col items-center gap-1">
                                    <span className="text-[10px] font-semibold text-[var(--tinte-matt)]">{day}</span>
                                    <div className="flex flex-col items-center gap-1">
                                      <button onClick={() => setGenProTagConfig(p => ({
                                    ...p,
                                    [dow]: { ...(p[dow] ?? genAlleConfig), [st]: { ...(p[dow]?.[st] ?? stCfg), enabled: !stCfg.enabled } }
                                }))} className={`w-full text-[10px] font-semibold px-1 py-0.5 rounded transition-colors ${stCfg.enabled ? "bg-[var(--akzent)] text-white" : "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
                                        {stCfg.enabled ? "✓" : "–"}
                                      </button>
                                      <input type="number" min={0} max={50} value={stCfg.staff} onChange={e => setGenProTagConfig(p => ({
                                    ...p,
                                    [dow]: { ...(p[dow] ?? genAlleConfig), [st]: { ...(p[dow]?.[st] ?? stCfg), staff: Math.max(0, parseInt(e.target.value) || 0) } }
                                }))} className="w-full px-1 py-1 border border-[var(--linie)] rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
                                    </div>
                                  </div>);
                        })}
                            </div>
                          </div>);
                })}
                    </div>
                    <p className="text-[11px] text-[var(--tinte-matt)] flex items-center gap-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>info</span>
                      Klicke ✓/– um eine Schicht für einen bestimmten Tag zu aktivieren/deaktivieren. Die Zahl ist der Personalbedarf.
                    </p>
                  </div>)}
              </div>

              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide">Einzelne Tage anpassen</p>
                  {Object.keys(genPerDateConfig).length > 0 && (<button onClick={() => { setGenPerDateConfig({}); setEditingConfigDate(null); }} className="text-[11px] text-[var(--gefahr)] hover:text-[var(--gefahr)] transition-colors">
                      Alle Ausnahmen löschen
                    </button>)}
                </div>
                <p className="text-[11px] text-[var(--tinte-matt)] mb-3">
                  Klicke auf einen Tag um Zeiten und Besetzung für diesen spezifischen Tag zu überschreiben. Überschriebene Tage haben Vorrang vor allen anderen Einstellungen.
                </p>

                
                {(() => {
                const grid = getCalendarGrid(planYear, planMonth);
                return (<div className="border border-[var(--linie)] rounded-xl overflow-hidden bg-[var(--papier)]">
                      <div className="grid grid-cols-7 border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(d => (<div key={d} className="py-1.5 text-center text-[10px] font-semibold text-[var(--tinte-matt)] uppercase">{d}</div>))}
                      </div>
                      {grid.map((week, wi) => (<div key={wi} className="grid grid-cols-7 border-b border-[var(--linie)] last:border-b-0">
                          {week.map((day, di) => {
                            if (!day)
                                return <div key={di} className="min-h-[48px] bg-[var(--papier)]"/>;
                            const iso = `${planYear}-${String(planMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const hasOverride = !!genPerDateConfig[iso];
                            const isEditing = editingConfigDate === iso;
                            const isToday = iso === todayISO();
                            return (<div key={di} className={`min-h-[48px] p-1 border-r border-[var(--linie)] last:border-r-0 cursor-pointer transition-colors ${isEditing ? "bg-[var(--akzent-flaeche)] ring-2 ring-[var(--akzent)] ring-inset" : hasOverride ? "bg-[var(--warnung-flaeche)]" : "hover:bg-[var(--papier-tief)]"}`} onClick={() => setEditingConfigDate(isEditing ? null : iso)}>
                                <div className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${isToday ? "bg-[var(--akzent)] text-white" : hasOverride ? "text-[var(--warnung)]" : "text-[var(--tinte)]"}`}>{day}</div>
                                {hasOverride && (<div className="space-y-0.5">
                                    {(["frueh", "spaet", "nacht"] as const).map(st => {
                                        const cfg = genPerDateConfig[iso]![st];
                                        if (!cfg.enabled)
                                            return null;
                                        const dot = st === "frueh" ? "bg-[var(--warnung)]" : st === "spaet" ? "bg-[var(--warnung)]" : "bg-[var(--akzent)]";
                                        return (<div key={st} className="flex items-center gap-0.5">
                                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`}/>
                                          <span className="text-[9px] font-semibold text-[var(--tinte-matt)]">{cfg.staff}</span>
                                        </div>);
                                    })}
                                  </div>)}
                              </div>);
                        })}
                        </div>))}
                    </div>);
            })()}

                
                {editingConfigDate && (<div className="mt-3 border border-[var(--akzent)] rounded-xl p-4 bg-[var(--akzent-flaeche)]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>edit_calendar</span>
                        <p className="text-[13px] font-semibold text-[var(--tinte)]">
                          {new Date(editingConfigDate + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
                        </p>
                        {genPerDateConfig[editingConfigDate] && (<span className="text-[10px] font-semibold text-[var(--warnung)] bg-[var(--warnung-flaeche)] px-1.5 py-0.5 rounded-full">Angepasst</span>)}
                      </div>
                      <div className="flex items-center gap-2">
                        {genPerDateConfig[editingConfigDate] && (<button onClick={() => {
                        setGenPerDateConfig(p => { const n = { ...p }; delete n[editingConfigDate]; return n; });
                    }} className="text-[11px] text-[var(--gefahr)] hover:text-[var(--gefahr)] flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                            Zurücksetzen
                          </button>)}
                        <button onClick={() => setEditingConfigDate(null)} className="p-1 rounded text-[var(--tinte-matt)] hover:bg-[var(--papier)]">
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                      </div>
                    </div>

                    
                    <div className="space-y-2">
                      {(["frueh", "spaet", "nacht"] as const).map(st => {
                    const dow = String((new Date(editingConfigDate + "T00:00:00").getDay() + 6) % 7);
                    const baseCfg = genConfigMode === "pro-tag" ? (genProTagConfig[dow] ?? genAlleConfig) : genAlleConfig;
                    const overrideCfg = genPerDateConfig[editingConfigDate]?.[st] ?? baseCfg[st];
                    const label = st === "frueh" ? "Früh" : st === "spaet" ? "Spät" : "Nacht";
                    const accent = st === "frueh" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : st === "spaet" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]";
                    function updateDateShift(field: keyof ShiftTypeConfig, value: string | number | boolean) {
                        setGenPerDateConfig(p => {
                            const existing = p[editingConfigDate!] ?? {
                                frueh: { ...(genConfigMode === "pro-tag" ? (genProTagConfig[dow] ?? genAlleConfig) : genAlleConfig).frueh },
                                spaet: { ...(genConfigMode === "pro-tag" ? (genProTagConfig[dow] ?? genAlleConfig) : genAlleConfig).spaet },
                                nacht: { ...(genConfigMode === "pro-tag" ? (genProTagConfig[dow] ?? genAlleConfig) : genAlleConfig).nacht },
                            };
                            return { ...p, [editingConfigDate!]: { ...existing, [st]: { ...existing[st], [field]: value } } };
                        });
                    }
                    return (<div key={st} className={`rounded-lg bg-[var(--papier)] border p-3 transition-opacity ${overrideCfg.enabled ? "border-[var(--linie)]" : "border-[var(--linie)] opacity-60"}`}>
                            <div className="flex items-center gap-3 mb-2">
                              <Schalter an={overrideCfg.enabled} name={label} onClick={() => updateDateShift("enabled", !overrideCfg.enabled)}/>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${accent}`}>{label}</span>
                              <div className="flex items-center gap-1.5 ml-auto">
                                <span className="text-[11px] text-[var(--tinte-matt)]">MA:</span>
                                <input type="number" min={0} max={50} value={overrideCfg.staff} onChange={e => updateDateShift("staff", Math.max(0, parseInt(e.target.value) || 0))} className="w-12 px-1.5 py-1 border border-[var(--linie)] rounded text-center text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--akzent)]/30"/>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="time" value={overrideCfg.start} onChange={e => updateDateShift("start", e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier-tief)] focus:outline-none focus:ring-1 focus:ring-[var(--akzent)]/30"/>
                              <span className="text-[var(--tinte-matt)] text-xs">–</span>
                              <input type="time" value={overrideCfg.end} onChange={e => updateDateShift("end", e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-xs bg-[var(--papier-tief)] focus:outline-none focus:ring-1 focus:ring-[var(--akzent)]/30"/>
                            </div>
                          </div>);
                })}
                    </div>
                  </div>)}
              </div>

              
              <div>
                <p className="text-[12px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-2">Aktion</p>
                <div className="space-y-2">
                  {([
                { id: "shifts-only" as const, label: "Nur Schichten anlegen", desc: "Erstellt die Schichtstruktur für den Monat — Personal wird später manuell oder per KI eingeteilt", icon: "calendar_add_on" },
                { id: "staff-only" as const, label: "Mitarbeiter einteilen", desc: "Verteilt Mitarbeiter automatisch in bestehende Schichten (Wünsche + Burnout berücksichtigt)", icon: "auto_awesome" },
            ]).map(opt => (<label key={opt.id} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${genAction === opt.id ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)]"}`}>
                      <input type="radio" name="genAction" value={opt.id} checked={genAction === opt.id} onChange={() => setGenAction(opt.id)} className="mt-0.5 accent-[var(--akzent)]"/>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 14 }}>{opt.icon}</span>
                          <span className="text-[13px] font-semibold text-[var(--tinte)]">{opt.label}</span>
                        </div>
                        <p className="text-[11px] text-[var(--tinte-matt)] mt-0.5">{opt.desc}</p>
                      </div>
                    </label>))}
                </div>
              </div>
            </div>

            
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--linie)] sticky bottom-0 bg-[var(--papier)]">
              <button onClick={() => setShowGeneratorModal(false)} className="px-5 py-2.5 text-sm border border-[var(--linie)] rounded-lg text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
                Abbrechen
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                setGenAlleConfig(standardTagCfg(istPraxis));
                setGenProTagConfig(makeDayDefaults(istPraxis));
                setGenPerDateConfig({});
                setEditingConfigDate(null);
            }} className="px-4 py-2.5 text-sm text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] transition-colors">
                  Zurücksetzen
                </button>
                <button onClick={generatePlan} disabled={planGenerating || filling} className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-60 transition-colors">
                  {(planGenerating || filling)
                ? <PulseLoader size={14}/>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>}
                  {planGenerating || filling ? "Wird generiert…" : genAction === "shifts-only" ? "Schichten anlegen" : genAction === "staff-only" ? "Mitarbeiter einteilen" : "Generieren"}
                </button>
              </div>
            </div>
          </>)}
      </Modal>
    </div>);
}

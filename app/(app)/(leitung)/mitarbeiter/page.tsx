"use client";
import MitarbeiterRechte, { type RechteEintrag } from "@/components/MitarbeiterRechte";
import type { Recht, SelbstWerte } from "@/lib/rechte";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { useLang, type TKey } from "@/lib/LanguageContext";
import { EmptyState } from "@/components/EmptyState";
import { minijobGrenze } from "@/lib/legal-limits";
import { setBank, formatIban, ibanValid, bankKeyByName } from "@/lib/localBank";
import { useConfirm } from "@/components/ConfirmProvider";
import MitarbeiterImport from "@/components/MitarbeiterImport";
import FarbChip from "@/components/FarbChip";
import Modal from "@/components/Modal";
import Schalter from "@/components/Schalter";
import BerufAuswahl from "@/components/BerufAuswahl";
import { berufsgruppeVon, istArzt, standardBeruf } from "@/lib/berufe";
import { dienstplanungVon, type Dienstplanung } from "@/lib/scheduling/dienstplanung";
import { normalizePlan, planFuerNeueEinrichtung, type Plan } from "@/lib/plan";
type StaffKind = "arzt" | "bereich" | "pflege";
function staffKind(p: {
    beruf?: string;
    station?: string;
    bereiche?: {
        name: string;
    }[];
}): StaffKind {
    const gruppe = p.beruf ? berufsgruppeVon(p.beruf) : null;
    if (gruppe === "aerztlich" || istArzt(p.beruf) || p.station === "Ärztlicher Dienst")
        return "arzt";
    if ((gruppe && gruppe !== "pflege" && gruppe !== "praxisteam") || (p.bereiche?.length ?? 0) > 0 || p.station === "Funktionsdienste")
        return "bereich";
    return "pflege";
}
type StaffProfile = {
    id: string;
    full_name: string;
    role: string;
    beruf?: string;
    facility: string;
    created_at: string;
    email?: string | null;
    phone?: string | null;
    archived?: boolean;
    station?: string;
    station_secondary?: string;
    einsatz_stationen?: string[];
    bereiche?: {
        name: string;
        color: string | null;
    }[];
    max_hours_per_week?: number;
    job_type?: string;
    hourly_rate?: number | null;
    minijob_buffer_pct?: number;
    tax_class?: number;
    church_tax?: boolean;
    children_count?: number;
    overtime_compensation?: string | null;
    overtime_hours_per_day?: number | null;
    max_shifts_per_week?: number | null;
    max_consecutive_days?: number | null;
    max_consecutive_nights?: number | null;
    max_hours_per_shift?: number | null;
    min_rest_hours?: number | null;
    break_after_minutes?: number | null;
    break_min?: number | null;
    max_holiday_shifts_per_month?: number | null;
    min_days_off_per_week?: number | null;
    no_sunday_work?: boolean | null;
    dienstplanung?: string | null;
};
type StationOption = {
    id: string;
    name: string;
    color: string;
};
const DP_LABEL: Record<Dienstplanung, TKey> = { schicht: "ma.dpSchicht", tagdienst: "ma.dpTagdienst", selbst: "ma.dpSelbst" };
const JOB_TYPES = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Aushilfe"];
const JOB_TYPE_KEYS: Record<string, TKey> = { Vollzeit: "ma.jobVollzeit", Teilzeit: "ma.jobTeilzeit", Minijob: "ma.jobMinijob", Werkstudent: "ma.jobWerkstudent", Aushilfe: "ma.jobAushilfe" };
const DAY_KEYS: TKey[] = ["ma.dayMo", "ma.dayDi", "ma.dayMi", "ma.dayDo", "ma.dayFr", "ma.daySa", "ma.daySo"];
const DEFAULT_HOURS: Record<string, number> = { Vollzeit: 40, Teilzeit: 20, Minijob: 10, Werkstudent: 20, Aushilfe: 15 };
const MINIJOB_CAP = minijobGrenze();
const LEGAL_DEFAULTS = {
    max_shifts_per_week: 6, max_consecutive_days: 6, max_consecutive_nights: 4,
    max_hours_per_shift: 10, min_rest_hours: 11,
} as const;
export default function MitarbeiterPage() {
    const { t, locale } = useLang();
    const confirm = useConfirm();
    const jobTypeLabel = (v: string) => JOB_TYPE_KEYS[v] ? t(JOB_TYPE_KEYS[v]) : v;
    const [staff, setStaff] = useState<StaffProfile[]>([]);
    const [archivedStaff, setArchivedStaff] = useState<StaffProfile[]>([]);
    const [staffLoading, setStaffLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [archiving, setArchiving] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [resettingRecovery, setResettingRecovery] = useState<string | null>(null);
    const [recoveryModal, setRecoveryModal] = useState<{
        name: string;
        phrase: string;
    } | null>(null);
    const [recoveryCopied, setRecoveryCopied] = useState(false);
    const [recoveryError, setRecoveryError] = useState("");
    const [stations, setStations] = useState<StationOption[]>([]);
    const [editingStationId, setEditingStationId] = useState<string | null>(null);
    const [editS1, setEditS1] = useState("");
    const [editS2, setEditS2] = useState("");
    const [editEinsatz, setEditEinsatz] = useState<string[]>([]);
    const [editBeruf, setEditBeruf] = useState("");
    const [leaders, setLeaders] = useState<{
        station_name: string;
        user_id: string;
    }[]>([]);
    const [editLeader, setEditLeader] = useState(false);
    useEffect(() => {
        fetch("/api/leitung/station-leaders").then(r => r.json()).then(d => setLeaders(d?.leaders ?? [])).catch(() => { });
    }, []);
    const [rechteDaten, setRechteDaten] = useState<{
        eintraege: RechteEintrag[];
        vergebbar: Recht[];
        praxis: SelbstWerte;
        tabelleFehlt?: boolean;
    } | null>(null);
    const [rechteFuer, setRechteFuer] = useState<{
        id: string;
        full_name: string;
    } | null>(null);
    useEffect(() => {
        fetch("/api/leitung/mitarbeiter-rechte").then(r => r.ok ? r.json() : null).then(d => { if (d?.vergebbar)
            setRechteDaten(d); }).catch(() => { });
    }, []);
    const rechteVon = (id: string) => rechteDaten?.eintraege.find(e => e.userId === id);
    const leitetStation = (userId: string, station: string | undefined) => !!station && leaders.some(l => l.user_id === userId && l.station_name === station);
    const [plan, setPlan] = useState<Plan>(planFuerNeueEinrichtung());
    useEffect(() => {
        fetch("/api/leitung/context").then(r => r.json()).then(d => setPlan(normalizePlan(d?.plan ?? null))).catch(() => { });
    }, []);
    const [stationError, setStationError] = useState("");
    const [savingStation, setSavingStation] = useState(false);
    const [editingHoursId, setEditingHoursId] = useState<string | null>(null);
    const [editJobType, setEditJobType] = useState("Vollzeit");
    const [editMaxHours, setEditMaxHours] = useState(40);
    const [editHourlyRate, setEditHourlyRate] = useState("");
    const [editMinijobBuffer, setEditMinijobBuffer] = useState(15);
    const [editTaxClass, setEditTaxClass] = useState(1);
    const [editChurchTax, setEditChurchTax] = useState(false);
    const [editChildrenCount, setEditChildrenCount] = useState(0);
    const [editOvertimeComp, setEditOvertimeComp] = useState("");
    const [editOvertimeHoursPerDay, setEditOvertimeHoursPerDay] = useState("");
    const [editMaxShiftsPerWeek, setEditMaxShiftsPerWeek] = useState("");
    const [editMaxConsecutiveDays, setEditMaxConsecutiveDays] = useState("");
    const [editMaxConsecutiveNights, setEditMaxConsecutiveNights] = useState("");
    const [editMaxHoursPerShift, setEditMaxHoursPerShift] = useState("");
    const [editMinRestHours, setEditMinRestHours] = useState("");
    const [editBreakAfterMinutes, setEditBreakAfterMinutes] = useState("");
    const [editBreakMin, setEditBreakMin] = useState("");
    const [editMaxHolidayShifts, setEditMaxHolidayShifts] = useState("");
    const [editMinDaysOff, setEditMinDaysOff] = useState("");
    const [editNoSunday, setEditNoSunday] = useState(false);
    const [editDienstplanung, setEditDienstplanung] = useState("");
    const [savingHours, setSavingHours] = useState(false);
    const [hoursError, setHoursError] = useState("");
    const [defaultRate, setDefaultRate] = useState("");
    const [contractDefaults, setContractDefaults] = useState<Record<string, number | null>>({});
    type AvailRow = {
        day_of_week: number;
        available: boolean;
        from_time: string;
        to_time: string;
    };
    const [availModalId, setAvailModalId] = useState<string | null>(null);
    const [availModalName, setAvailModalName] = useState("");
    const [availRows, setAvailRows] = useState<AvailRow[]>(() => [1, 2, 3, 4, 5, 6, 7].map(d => ({ day_of_week: d, available: true, from_time: "", to_time: "" })));
    const [availLoading, setAvailLoading] = useState(false);
    const [availSaving, setAvailSaving] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [offeneCodes, setOffeneCodes] = useState<{
        code: string;
        preset_name: string | null;
        expires_at: string | null;
    }[]>([]);
    const [codesNeuLaden, setCodesNeuLaden] = useState(0);
    const [showOffeneCodes, setShowOffeneCodes] = useState(false);
    const [inviteStep, setInviteStep] = useState<"form" | "payroll" | "certs">("form");
    const [inviteForm, setInviteForm] = useState({
        first_name: "", last_name: "", email: "", phone: "",
        station: "", station_secondary: "",
        role: "",
        job_type: "Vollzeit", max_hours_per_month: Math.round(40 * 4.33),
        minijob_buffer_pct: 15,
    });
    const [payrollForm, setPayrollForm] = useState({
        hourly_rate: "", weekend_pct: "", holiday_pct: "", vacation_days: "", break_min: "",
    });
    const [bankForm, setBankForm] = useState({ holder: "", iban: "" });
    const [certWho, setCertWho] = useState<"now" | "employee" | "later">("now");
    const [certs, setCerts] = useState<{
        cert_name: string;
        expiry_date: string;
    }[]>([]);
    const [certDraft, setCertDraft] = useState({ cert_name: "", expiry_date: "" });
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [defaultBreak, setDefaultBreak] = useState("");
    const [defaultWeekend, setDefaultWeekend] = useState("");
    const [defaultHoliday, setDefaultHoliday] = useState("");
    useEffect(() => {
        async function loadStaff() {
            const res = await fetch("/api/leitung/registered-staff");
            const data = await res.json();
            if (res.ok) {
                const all: StaffProfile[] = data.staff ?? [];
                setStaff(all.filter(s => !s.archived));
                setArchivedStaff(all.filter(s => s.archived));
            }
            setStaffLoading(false);
        }
        async function loadOffeneCodes() {
            try {
                const res = await fetch("/api/leitung/codes");
                const data = await res.json();
                if (!res.ok)
                    return;
                const jetzt = Date.now();
                setOffeneCodes((data.codes ?? [])
                    .filter((c: {
                    used: boolean;
                    expires_at: string | null;
                }) => !c.used && (!c.expires_at || new Date(c.expires_at).getTime() > jetzt)));
            }
            catch { }
        }
        loadOffeneCodes();
        async function loadStations() {
            const res = await fetch("/api/leitung/stations");
            const data = await res.json();
            if (res.ok)
                setStations(data.stations ?? []);
        }
        async function loadSettings() {
            try {
                const res = await fetch("/api/leitung/facility-settings");
                const data = await res.json();
                const s = data?.settings ?? {};
                if (s.default_hourly_rate != null)
                    setDefaultRate(String(s.default_hourly_rate));
                if (s.default_break_min != null)
                    setDefaultBreak(String(s.default_break_min));
                if (s.default_weekend_pct != null)
                    setDefaultWeekend(String(s.default_weekend_pct));
                if (s.default_holiday_pct != null)
                    setDefaultHoliday(String(s.default_holiday_pct));
                setContractDefaults({
                    max_shifts_per_week: s.default_max_shifts_per_week ?? null,
                    max_consecutive_days: s.default_max_consecutive_days ?? null,
                    max_consecutive_nights: s.default_max_consecutive_nights ?? null,
                    max_hours_per_shift: s.default_max_hours_per_shift ?? null,
                    min_rest_hours: s.default_min_rest_hours ?? null,
                    break_after_minutes: s.default_break_after_minutes ?? null,
                    break_min: s.default_break_min ?? null,
                    max_holiday_shifts_per_month: s.default_max_holiday_shifts_per_month ?? null,
                    min_days_off_per_week: s.default_min_days_off_per_week ?? null,
                });
            }
            catch { }
        }
        loadStaff();
        loadStations();
        loadSettings();
    }, [codesNeuLaden]);
    function stationColor(name: string): string {
        return stations.find(s => s.name === name)?.color ?? "#64748b";
    }
    function openStationEdit(person: StaffProfile) {
        setEditingStationId(person.id);
        setEditS1(person.station ?? "");
        setEditS2(person.station_secondary ?? "");
        setEditEinsatz(person.einsatz_stationen ?? []);
        setEditBeruf(person.beruf || standardBeruf(plan));
        setEditLeader(leitetStation(person.id, person.station));
        setStationError("");
    }
    async function saveHours(userId: string) {
        setSavingHours(true);
        setHoursError("");
        try {
            const rate = editHourlyRate ? parseFloat(editHourlyRate) : null;
            const numOrNull = (v: string) => v.trim() === "" ? null : Number(v);
            const body: Record<string, unknown> = {
                id: userId, job_type: editJobType, max_hours_per_week: editMaxHours,
                tax_class: editTaxClass, church_tax: editChurchTax, children_count: editChildrenCount,
                hourly_rate: rate,
                overtime_compensation: editOvertimeComp === "" ? null : editOvertimeComp,
                overtime_hours_per_day: editOvertimeComp === "vacation" && editOvertimeHoursPerDay ? editOvertimeHoursPerDay : null,
                max_shifts_per_week: numOrNull(editMaxShiftsPerWeek),
                max_consecutive_days: numOrNull(editMaxConsecutiveDays),
                max_consecutive_nights: numOrNull(editMaxConsecutiveNights),
                max_hours_per_shift: numOrNull(editMaxHoursPerShift),
                min_rest_hours: numOrNull(editMinRestHours),
                break_after_minutes: numOrNull(editBreakAfterMinutes),
                break_min: numOrNull(editBreakMin),
                max_holiday_shifts_per_month: numOrNull(editMaxHolidayShifts),
                min_days_off_per_week: numOrNull(editMinDaysOff),
                no_sunday_work: editNoSunday,
                dienstplanung: editDienstplanung === "" ? null : editDienstplanung,
            };
            if (editJobType === "Minijob") {
                body.minijob_buffer_pct = editMinijobBuffer;
            }
            const res = await fetch("/api/leitung/staff", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setStaff(prev => prev.map(s => s.id === userId
                    ? { ...s, job_type: editJobType, max_hours_per_week: editMaxHours, hourly_rate: rate, minijob_buffer_pct: editMinijobBuffer, tax_class: editTaxClass, church_tax: editChurchTax, children_count: editChildrenCount, overtime_compensation: editOvertimeComp === "" ? null : editOvertimeComp, overtime_hours_per_day: editOvertimeComp === "vacation" && editOvertimeHoursPerDay ? Number(editOvertimeHoursPerDay) : null,
                        max_shifts_per_week: numOrNull(editMaxShiftsPerWeek), max_consecutive_days: numOrNull(editMaxConsecutiveDays), max_consecutive_nights: numOrNull(editMaxConsecutiveNights), max_hours_per_shift: numOrNull(editMaxHoursPerShift), min_rest_hours: numOrNull(editMinRestHours), break_after_minutes: numOrNull(editBreakAfterMinutes), break_min: numOrNull(editBreakMin), max_holiday_shifts_per_month: numOrNull(editMaxHolidayShifts), min_days_off_per_week: numOrNull(editMinDaysOff), no_sunday_work: editNoSunday, dienstplanung: editDienstplanung || null }
                    : s));
                if (data.warning)
                    setHoursError(data.warning);
                else
                    setEditingHoursId(null);
            }
            else {
                setHoursError(data.error ?? t("ma.errSaveFailed"));
            }
        }
        catch {
            setHoursError(t("ma.errNetwork"));
        }
        finally {
            setSavingHours(false);
        }
    }
    async function openAvailModal(person: StaffProfile) {
        setAvailModalId(person.id);
        setAvailModalName(person.full_name);
        setAvailLoading(true);
        setAvailRows([1, 2, 3, 4, 5, 6, 7].map(d => ({ day_of_week: d, available: true, from_time: "", to_time: "" })));
        try {
            const res = await fetch(`/api/leitung/staff-availability?staff_id=${person.id}`);
            const data = await res.json();
            if (res.ok && data.availability?.length > 0) {
                setAvailRows([1, 2, 3, 4, 5, 6, 7].map(d => {
                    const row = data.availability.find((r: AvailRow) => r.day_of_week === d);
                    return row
                        ? { day_of_week: d, available: row.available, from_time: row.from_time ?? "", to_time: row.to_time ?? "" }
                        : { day_of_week: d, available: true, from_time: "", to_time: "" };
                }));
            }
        }
        finally {
            setAvailLoading(false);
        }
    }
    async function saveAvailability() {
        if (!availModalId)
            return;
        setAvailSaving(true);
        try {
            await fetch("/api/leitung/staff-availability", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    staff_id: availModalId,
                    rows: availRows.map(r => ({
                        day_of_week: r.day_of_week,
                        available: r.available,
                        from_time: r.from_time || null,
                        to_time: r.to_time || null,
                    })),
                }),
            });
            setAvailModalId(null);
        }
        finally {
            setAvailSaving(false);
        }
    }
    async function saveStation(userId: string) {
        const einsatzOhneEigene = editEinsatz.filter(n => n !== editS1 && n !== editS2);
        setSavingStation(true);
        setStationError("");
        try {
            const res = await fetch("/api/leitung/assign-station", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, station: editS1, station_secondary: editS2, einsatz_stationen: einsatzOhneEigene }),
            });
            if (res.ok || res.status === 409) {
                setStaff(prev => prev.map(s => s.id === userId ? { ...s, station: editS1, station_secondary: editS2, ...(res.ok ? { einsatz_stationen: einsatzOhneEigene } : {}) } : s));
            }
            if (res.ok) {
                const altStation = staff.find(s => s.id === userId)?.station ?? "";
                const warLeitung = leitetStation(userId, altStation);
                const setzen = async (method: "POST" | "DELETE", station: string) => {
                    const r = await fetch("/api/leitung/station-leaders", {
                        method, headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ station_name: station, user_id: userId }),
                    });
                    if (r.ok)
                        setLeaders(prev => method === "POST"
                            ? [...prev.filter(l => !(l.user_id === userId && l.station_name === station)), { station_name: station, user_id: userId }]
                            : prev.filter(l => !(l.user_id === userId && l.station_name === station)));
                    return r.ok;
                };
                if (warLeitung && (altStation !== editS1 || !editLeader))
                    await setzen("DELETE", altStation);
                if (editLeader && editS1 && !(warLeitung && altStation === editS1)) {
                    if (!(await setzen("POST", editS1))) {
                        setStationError(t("ma.errSaveFailed"));
                        return;
                    }
                }
            }
            const bisher = staff.find(s => s.id === userId)?.beruf ?? "";
            if (res.ok && editBeruf && editBeruf !== bisher) {
                const r2 = await fetch("/api/leitung/staff", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: userId, role: editBeruf }),
                });
                if (!r2.ok) {
                    setStationError((await r2.json().catch(() => ({}))).error ?? t("ma.errSaveFailed"));
                    return;
                }
                setStaff(prev => prev.map(s => s.id === userId ? { ...s, beruf: editBeruf } : s));
            }
            if (res.ok)
                setEditingStationId(null);
            else
                setStationError((await res.json().catch(() => ({}))).error ?? t("ma.errSaveFailed"));
        }
        finally {
            setSavingStation(false);
        }
    }
    const inviteFullName = [inviteForm.first_name, inviteForm.last_name].filter(Boolean).join(" ").trim();
    async function createCode(e: React.FormEvent) {
        e.preventDefault();
        setInviting(true);
        setInviteError("");
        try {
            const body: Record<string, unknown> = {
                first_name: inviteForm.first_name.trim(),
                last_name: inviteForm.last_name.trim(),
                email: inviteForm.email.trim(),
                phone: inviteForm.phone.trim(),
                job_type: inviteForm.job_type,
                role: inviteForm.role || standardBeruf(plan),
                max_hours_per_week: Math.max(1, Math.round((inviteForm.max_hours_per_month || 1) / 4.33)),
            };
            if (inviteForm.station)
                body.station = inviteForm.station;
            if (inviteForm.station_secondary)
                body.station_secondary = inviteForm.station_secondary;
            if (inviteForm.job_type === "Minijob")
                body.minijob_buffer_pct = inviteForm.minijob_buffer_pct;
            const res = await fetch("/api/leitung/invite-staff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setInviteError(data.error ?? t("ma.errCodeFailed"));
                return;
            }
            setInviteCode(data.code ?? "");
            setPayrollForm({
                hourly_rate: defaultRate, weekend_pct: defaultWeekend, holiday_pct: defaultHoliday,
                vacation_days: "", break_min: defaultBreak,
            });
            setBankForm({ holder: inviteFullName, iban: "" });
            setInviteStep("payroll");
        }
        finally {
            setInviting(false);
        }
    }
    async function savePayroll() {
        setInviting(true);
        setInviteError("");
        try {
            const body: Record<string, unknown> = { code: inviteCode };
            if (payrollForm.hourly_rate)
                body.hourly_rate = payrollForm.hourly_rate;
            if (payrollForm.weekend_pct)
                body.weekend_pct = payrollForm.weekend_pct;
            if (payrollForm.holiday_pct)
                body.holiday_pct = payrollForm.holiday_pct;
            if (payrollForm.vacation_days)
                body.vacation_days = payrollForm.vacation_days;
            if (payrollForm.break_min)
                body.break_min = payrollForm.break_min;
            if (inviteForm.job_type === "Minijob")
                body.minijob_buffer_pct = inviteForm.minijob_buffer_pct;
            const res = await fetch("/api/leitung/invite-staff", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setInviteError(data.error ?? t("ma.errSaveFailed"));
                return;
            }
            if (bankForm.iban.trim() || bankForm.holder.trim()) {
                setBank(bankKeyByName(inviteFullName), bankForm);
            }
            setInviteStep("certs");
        }
        finally {
            setInviting(false);
        }
    }
    async function finishInvite() {
        setInviting(true);
        setInviteError("");
        try {
            if (certWho === "now" && certs.length > 0) {
                await fetch("/api/leitung/invite-staff", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: inviteCode, preset_certificates: certs }),
                }).catch(() => { });
            }
            closeInviteModal();
        }
        finally {
            setInviting(false);
        }
    }
    function closeInviteModal() {
        setShowInviteModal(false);
        setInviteStep("form");
        setInviteForm({ first_name: "", last_name: "", email: "", phone: "", station: "", station_secondary: "", role: "", job_type: "Vollzeit", max_hours_per_month: Math.round(40 * 4.33), minijob_buffer_pct: 15 });
        setPayrollForm({ hourly_rate: "", weekend_pct: "", holiday_pct: "", vacation_days: "", break_min: "" });
        setBankForm({ holder: "", iban: "" });
        setCertWho("now");
        setCerts([]);
        setCertDraft({ cert_name: "", expiry_date: "" });
        setInviteError("");
        setInviteCode("");
    }
    async function archiveStaff(userId: string, archived: boolean) {
        if (archived) {
            const target = staff.find(s => s.id === userId);
            const ok = await confirm({
                title: `${target?.full_name ?? "Mitarbeiter"} archivieren?`,
                body: "Die Person wird aus der aktiven Personalliste ausgeblendet und kann nicht mehr eingeteilt werden. Zeiten, Urlaub und Nachweise bleiben erhalten — Archivieren lässt sich jederzeit zurücknehmen.",
                confirmLabel: "Archivieren",
                danger: false,
            });
            if (!ok)
                return;
        }
        setArchiving(userId);
        try {
            const res = await fetch("/api/leitung/archive-staff", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, archived }),
            });
            if (res.ok) {
                if (archived) {
                    const target = staff.find(s => s.id === userId);
                    if (target) {
                        setStaff(prev => prev.filter(s => s.id !== userId));
                        setArchivedStaff(prev => [{ ...target, archived: true }, ...prev]);
                    }
                }
                else {
                    const target = archivedStaff.find(s => s.id === userId);
                    if (target) {
                        setArchivedStaff(prev => prev.filter(s => s.id !== userId));
                        setStaff(prev => [{ ...target, archived: false }, ...prev]);
                    }
                }
            }
        }
        finally {
            setArchiving(null);
        }
    }
    async function resetRecovery(person: StaffProfile) {
        const ok = await confirm({
            title: `Recovery-Phrase von ${person.full_name} zurücksetzen?`,
            body: (<>
          <p>Die bisherige Phrase verliert sofort ihre Gültigkeit.</p>
          <p className="mt-2">
            Sie erhalten danach eine neue Phrase, die Sie <strong>persönlich an {person.full_name} übergeben müssen</strong>.
            Ohne diese Phrase kommt die Person nicht mehr an ihr Konto.
          </p>
        </>),
            confirmLabel: "Zurücksetzen",
            confirmWord: "ZURÜCKSETZEN",
        });
        if (!ok)
            return;
        setResettingRecovery(person.id);
        setRecoveryError("");
        try {
            const res = await fetch("/api/leitung/reset-recovery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: person.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.recovery_phrase) {
                setRecoveryCopied(false);
                setRecoveryModal({ name: person.full_name, phrase: data.recovery_phrase });
            }
            else {
                setRecoveryError(data.error ?? t("ma.errResetFailed"));
            }
        }
        catch {
            setRecoveryError(t("ma.errServerUnreachable"));
        }
        finally {
            setResettingRecovery(null);
        }
    }
    const [jobTypeFilter, setJobTypeFilter] = useState<string | null>(null);
    const [kindFilter, setKindFilter] = useState<StaffKind | null>(null);
    const filtered = staff.filter(s => s.full_name?.toLowerCase().includes(search.toLowerCase()) &&
        (!jobTypeFilter || (s.job_type || "Vollzeit") === jobTypeFilter) &&
        (!kindFilter || staffKind(s) === kindFilter));
    const kindLabel = (kind: StaffKind) => plan === "praxis"
        ? (kind === "pflege" ? t("ma.kindPraxisteam") : kind === "arzt" ? t("ma.kindAerzte") : t("ma.kindBereich"))
        : (kind === "pflege" ? t("ma.kindPflege") : kind === "arzt" ? t("ma.kindArzt") : t("ma.kindBereich"));
    const kindCounts = ([
        { kind: "pflege" as const, label: kindLabel("pflege") },
        { kind: "arzt" as const, label: kindLabel("arzt") },
        { kind: "bereich" as const, label: t("ma.kindBereich") },
    ]).map(k => ({ ...k, count: staff.filter(s => staffKind(s) === k.kind).length })).filter(k => k.count > 0);
    const unassigned = staff.filter(s => !s.station).length;
    const jobTypeCounts = JOB_TYPES.map(jt => ({
        label: jt,
        count: staff.filter(s => (s.job_type || "Vollzeit") === jt).length,
    })).filter(x => x.count > 0);
    const inviteEffectiveHours = inviteForm.job_type === "Minijob" && payrollForm.hourly_rate
        ? ((MINIJOB_CAP / parseFloat(payrollForm.hourly_rate)) * (1 - inviteForm.minijob_buffer_pct / 100)).toFixed(1)
        : null;
    return (<div>
      <Header title={t("ma.title")} subtitle={t("ma.subtitle")}/>
      {rechteFuer && rechteDaten && (rechteDaten.tabelleFehlt ? (<Modal open onClose={() => setRechteFuer(null)} title="Rechte noch nicht verfügbar" description="Für die Rechte fehlt in der Datenbank noch eine Tabelle (Migration 20261022_mitarbeiter_rechte). Sobald sie eingespielt ist, funktioniert dieser Knopf."/>) : (<MitarbeiterRechte person={rechteFuer} eintrag={rechteVon(rechteFuer.id)} vergebbar={rechteDaten.vergebbar} praxis={rechteDaten.praxis} onClose={() => setRechteFuer(null)} onGespeichert={e => setRechteDaten(d => d && { ...d, eintraege: [...d.eintraege.filter(x => x.userId !== e.userId), e] })}/>))}
      <div className="px-7 pb-7 pt-4 space-y-6 max-w-7xl mx-auto">

        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ma.staff")}</span>
            <div className="flex items-end justify-between mt-4">
              <span className="text-[36px] font-semibold text-[var(--tinte)] leading-none">{staff.length}</span>
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>groups</span>
            </div>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("ma.activeRegistered")}</p>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ma.assigned")}</span>
            <div className="flex items-end justify-between mt-4">
              <span className="text-[36px] font-semibold text-[var(--tinte)] leading-none">{staff.length - unassigned}</span>
              <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 24 }}>layers</span>
            </div>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-1">
              {unassigned > 0 ? `${unassigned} ${t("ma.noStation")}` : t("ma.allAssigned")}
            </p>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-[var(--tinte-matt)]">Stellenarten</span>
              {jobTypeFilter && (<button onClick={() => setJobTypeFilter(null)} className="text-[13px] text-[var(--akzent)] hover:underline flex items-center gap-0.5">
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>close</span>
                  Filter
                </button>)}
            </div>
            {staffLoading ? (<div className="flex justify-center py-3"><PulseLoader size={14}/></div>) : jobTypeCounts.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">Noch keine Mitarbeiter</p>) : (<div className="space-y-1.5">
                {jobTypeCounts.map(({ label, count }) => {
                const active = jobTypeFilter === label;
                const pct = staff.length > 0 ? Math.round((count / staff.length) * 100) : 0;
                return (<button key={label} onClick={() => setJobTypeFilter(active ? null : label)} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors text-left ${active ? "bg-[var(--akzent-flaeche)] border border-[var(--akzent)]" : "hover:bg-[var(--papier-tief)] border border-transparent"}`}>
                      <span className={`text-[13px] font-medium flex-1 ${active ? "text-[var(--akzent)]" : "text-[var(--tinte)]"}`}>{label}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-[var(--papier-tief)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--akzent)] rounded-full transition-[width] duration-[240ms]" style={{ width: `${pct}%`, opacity: active ? 1 : 0.5 }}/>
                        </div>
                        <span className={`text-[13px] font-semibold w-4 text-right ${active ? "text-[var(--akzent)]" : "text-[var(--tinte-matt)]"}`}>{count}</span>
                      </div>
                    </button>);
            })}
              </div>)}
          </div>
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
          {kindCounts.length > 1 && (<div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider mr-1">
                {t("ma.kindFilterLabel")}
              </span>
              <button onClick={() => setKindFilter(null)} className={`text-[13px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${kindFilter === null
                ? "bg-[var(--akzent-flaeche)] border-[var(--akzent)] text-[var(--akzent)]"
                : "bg-[var(--papier)] border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                {t("ma.kindAll")} <span className="tabular-nums">{staff.length}</span>
              </button>
              {kindCounts.map(({ kind, label, count }) => (<button key={kind} onClick={() => setKindFilter(kindFilter === kind ? null : kind)} className={`text-[13px] font-medium px-3 py-1.5 rounded-lg border transition-colors ${kindFilter === kind
                    ? "bg-[var(--akzent-flaeche)] border-[var(--akzent)] text-[var(--akzent)]"
                    : "bg-[var(--papier)] border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  {label} <span className="tabular-nums">{count}</span>
                </button>))}
            </div>)}
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-semibold text-[var(--tinte)] flex-1 text-[16px]">
              {t("ma.registered")}
              {jobTypeFilter && (<button onClick={() => setJobTypeFilter(null)} className="ml-2 inline-flex items-center gap-1 text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                  {jobTypeFilter}
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>close</span>
                </button>)}
            </h2>
            <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] rounded-lg transition-colors flex-shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person_add</span>
              {t("ma.invite")}
            </button>
            
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-[var(--tinte)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] rounded-lg transition-colors flex-shrink-0">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_paste</span>
              {t("imp.titel")}
            </button>
            
            
            <div className="relative max-w-xs w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>search</span>
              <input type="text" placeholder={t("ma.search")} value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
            </div>
          </div>

          {staffLoading ? (<div className="flex items-center gap-3 py-10 justify-center text-[var(--tinte-matt)]">
              <PulseLoader size={18}/>
              {t("ma.loadingStaff")}
            </div>) : filtered.length === 0 && staff.length === 0 ? (<EmptyState icon="group_add" title={t("ma.emptyTitle")} subtitle={t("ma.emptySubtitle")} steps={[
                { label: t("ma.emptyStep1") },
                { label: t("ma.emptyStep2") },
                { label: t("ma.emptyStep3") },
                { label: t("ma.emptyStep4") },
            ]} cta={{ label: t("ma.inviteFirst"), onClick: () => setShowInviteModal(true), icon: "person_add" }}/>) : filtered.length === 0 ? (<div className="flex items-start gap-4 py-8 px-2">
              <div className="w-10 h-10 bg-[var(--akzent-flaeche)] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 20 }}>info</span>
              </div>
              <div>
                <p className="font-medium text-[var(--tinte)] mb-1">{t("ma.noneRegistered")}</p>
                <p className="text-[var(--tinte-matt)] text-[13px] max-w-lg">{t("ma.noneHint")}</p>
              </div>
            </div>) : (<>
            
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--linie)]">
                    <th className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-4 w-48">{t("ma.colEmployee")}</th>
                    <th className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-4">{t("ma.colStations")}</th>
                    <th className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-4">{t("ma.colPosition")}</th>
                    <th className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-4">{t("ma.colAvailability")}</th>
                    <th className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-4 w-28 hidden 2xl:table-cell">{t("ma.colSince")}</th>
                    <th className="pb-3 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--linie)]">
                  {filtered.map(person => (<tr key={person.id} className="hover:bg-[var(--papier-tief)] transition-colors group">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[var(--akzent-flaeche)] flex items-center justify-center text-[var(--akzent)] text-[13px] font-semibold flex-shrink-0">
                            {person.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          
                          <div className="min-w-0 max-w-48" title={person.email ?? undefined}>
                            <span className="block font-medium text-[var(--tinte)] text-[14px] [overflow-wrap:anywhere]">{person.full_name || "—"}</span>
                            
                            <span className="flex items-center gap-1 flex-wrap mt-0.5">
                              {staffKind(person) === "arzt" && (<span className="text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]">
                                  {kindLabel("arzt")}
                                </span>)}
                              {staffKind(person) === "bereich" && ((person.bereiche ?? []).length > 0
                    ? (person.bereiche ?? []).map(b => (<FarbChip key={b.name} farbe={b.color}>{b.name}</FarbChip>))
                    : (<span className="text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--ki-flaeche)] text-[var(--ki)] border border-[var(--linie)]">
                                      {t("ma.kindBereich")}
                                    </span>))}
                              {staffKind(person) === "pflege" && (<span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--tinte-matt)] border border-[var(--linie)]">
                                  {kindLabel("pflege")}
                                </span>)}
                              {person.beruf && (<span className="text-[13px] text-[var(--tinte-matt)]">{person.beruf}</span>)}
                              {leitetStation(person.id, person.station) && (<span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--warnung-flaeche)] text-[var(--tinte)] border border-[var(--linie)]">
                                  {t("ma.stationsleitung")}
                                </span>)}
                            </span>
                            {person.email && <span className="block text-[13px] text-[var(--tinte-matt)] truncate">{person.email}</span>}
                            {person.phone && <span className="block text-[13px] text-[var(--tinte-matt)] truncate">{person.phone}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-4">
                        {editingStationId === person.id ? (<div className="space-y-2">
                          <div className="max-w-[340px]">
                            <label htmlFor={`beruf-${person.id}`} className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("ma.beruf")}</label>
                            <BerufAuswahl id={`beruf-${person.id}`} value={editBeruf} onChange={setEditBeruf} plan={plan} className="w-full px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <select value={editS1} onChange={e => setEditS1(e.target.value)} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 min-w-[120px]">
                              <option value="">{t("ma.noStationOpt")}</option>
                              {stations.map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
                            </select>
                            <span className="text-[var(--tinte-matt)] text-[13px]">+</span>
                            <select value={editS2} onChange={e => setEditS2(e.target.value)} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 min-w-[120px]">
                              <option value="">{t("ma.noSecondStation")}</option>
                              {stations.filter(s => s.name !== editS1).map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
                            </select>
                            <button onClick={() => saveStation(person.id)} disabled={savingStation} className="p-1.5 bg-[var(--ok-flaeche)] text-[var(--ok)] hover:bg-[var(--ok-flaeche)] rounded-lg transition-colors disabled:opacity-50">
                              {savingStation
                        ? <PulseLoader size={12}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>}
                            </button>
                            <button onClick={() => setEditingStationId(null)} className="p-1.5 bg-[var(--akzent-flaeche)] text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                            </button>
                          </div>
                          {editS1 && (<label className="flex items-center gap-2 min-h-[32px] text-[13px] text-[var(--tinte)] cursor-pointer w-fit">
                              <input type="checkbox" checked={editLeader} onChange={e => setEditLeader(e.target.checked)} className="accent-[var(--akzent)]"/>
                              {t("ma.stationsleitungVon")} {editS1}
                            </label>)}
                          
                          <fieldset className="max-w-[340px]">
                            <legend className="text-[13px] text-[var(--tinte-matt)] mb-1">{t("ma.einsatzLabel")}</legend>
                            {stations.filter(s => s.name !== editS1 && s.name !== editS2).length === 0 ? (<p className="text-[13px] text-[var(--tinte-leise)]">{t("ma.einsatzKeine")}</p>) : (<div className="flex flex-wrap gap-x-3 gap-y-1">
                                {stations.filter(s => s.name !== editS1 && s.name !== editS2).map(s => (<label key={s.id} className="inline-flex items-center gap-1.5 min-h-[32px] text-[13px] text-[var(--tinte)] cursor-pointer">
                                    <input type="checkbox" checked={editEinsatz.includes(s.name)} onChange={e => setEditEinsatz(prev => e.target.checked ? [...prev, s.name] : prev.filter(n => n !== s.name))} className="accent-[var(--akzent)]"/>
                                    {s.name}
                                  </label>))}
                              </div>)}
                          </fieldset>
                          {stationError && <p role="alert" className="text-[13px] text-[var(--gefahr)] max-w-[340px]">{stationError}</p>}
                          </div>) : (<button onClick={() => openStationEdit(person)} className="flex items-center gap-1.5 flex-wrap text-left hover:opacity-80 transition-opacity" title={t("ma.assignStationTitle")}>
                            {person.station ? (<>
                                <FarbChip farbe={stationColor(person.station)}>{person.station}</FarbChip>
                                {person.station_secondary && (<FarbChip farbe={stationColor(person.station_secondary)}>{person.station_secondary}</FarbChip>)}
                                {(person.einsatz_stationen?.length ?? 0) > 0 && (<span className="text-[13px] text-[var(--tinte-matt)]">
                                    {t("ma.einsatzKurz")}: {person.einsatz_stationen!.join(", ")}
                                  </span>)}
                              </>) : (<span className="text-[13px] text-[var(--tinte-matt)] border border-dashed border-[var(--linie)] px-2.5 py-0.5 rounded-full hover:border-[var(--akzent)] hover:text-[var(--akzent)] transition-colors">
                                {t("ma.assignStation")}
                              </span>)}
                          </button>)}
                      </td>

                      <td className="py-3 pr-4">
                        {editingHoursId === person.id ? (<div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <select value={editJobType} onChange={e => {
                        setEditJobType(e.target.value);
                        setEditMaxHours(DEFAULT_HOURS[e.target.value] ?? editMaxHours);
                    }} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                                {JOB_TYPES.map(jt => <option key={jt} value={jt}>{jobTypeLabel(jt)}</option>)}
                              </select>
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={editMaxHours === 0 ? "" : editMaxHours} onFocus={e => e.target.select()} onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const n = raw === "" ? 0 : parseInt(raw, 10);
                        setEditMaxHours(n);
                    }} className="w-14 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                              <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.hPerWeek")}</span>
                              <button onClick={() => saveHours(person.id)} disabled={savingHours} className="p-1.5 bg-[var(--ok-flaeche)] text-[var(--ok)] hover:bg-[var(--ok-flaeche)] rounded-lg transition-colors disabled:opacity-50">
                                {savingHours ? <PulseLoader size={12}/> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>}
                              </button>
                              <button onClick={() => setEditingHoursId(null)} className="p-1.5 bg-[var(--akzent-flaeche)] text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition-colors">
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                              </button>
                            </div>
                            
                            <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
                              <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.hourlyWage")}</span>
                              <div className="flex items-center gap-0.5">
                                <input type="number" min={0} step={0.01} value={editHourlyRate} onChange={e => setEditHourlyRate(e.target.value)} placeholder="z.B. 14.50" className="w-20 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                                <span className="text-[13px] text-[var(--tinte-matt)]">€/h</span>
                              </div>
                              {editJobType === "Minijob" && <>
                                <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.buffer")}</span>
                                <input type="number" min={0} max={50} value={editMinijobBuffer} onChange={e => setEditMinijobBuffer(parseInt(e.target.value) || 0)} className="w-12 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                                <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                                {editHourlyRate && (<span className="text-[13px] text-[var(--ki)] bg-[var(--ki-flaeche)] px-1.5 py-0.5 rounded-full">
                                    max {((MINIJOB_CAP / parseFloat(editHourlyRate)) * (1 - editMinijobBuffer / 100) / 4.33).toFixed(1)}{t("ma.hPerWeek")}
                                  </span>)}
                              </>}
                            </div>
                            
                            <div className="flex items-center gap-1.5 flex-wrap pl-0.5 border-t border-[var(--akzent-flaeche)] pt-1.5 mt-0.5">
                              <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.taxClass")}</span>
                              <select value={editTaxClass} onChange={e => setEditTaxClass(Number(e.target.value))} className="px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none">
                                {[1, 2, 3, 4, 5, 6].map(k => <option key={k} value={k}>SK {k}</option>)}
                              </select>
                              <label className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] cursor-pointer">
                                <input type="checkbox" checked={editChurchTax} onChange={e => setEditChurchTax(e.target.checked)} className="accent-[var(--akzent)]"/>
                                {t("ma.kist")}
                              </label>
                              <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.children")}</span>
                              <input type="number" min={0} max={10} value={editChildrenCount} onChange={e => setEditChildrenCount(parseInt(e.target.value) || 0)} className="w-10 px-1 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none"/>
                            </div>
                            
                            <div className="flex items-center gap-1.5 flex-wrap pl-0.5 border-t border-[var(--akzent-flaeche)] pt-1.5 mt-0.5">
                              <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.overtimeLabel")}</span>
                              <select value={editOvertimeComp} onChange={e => setEditOvertimeComp(e.target.value)} className="px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none">
                                <option value="">{t("ma.facilityStandard")}</option>
                                <option value="payout">{t("ma.payout")}</option>
                                <option value="vacation">{t("ma.convertToVacation")}</option>
                              </select>
                              {editOvertimeComp === "vacation" && <>
                                <input type="number" min={1} max={24} step={0.5} value={editOvertimeHoursPerDay} onChange={e => setEditOvertimeHoursPerDay(e.target.value)} placeholder="8" className="w-12 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none"/>
                                <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.hEquals1VacationDay")}</span>
                              </>}
                            </div>
                            
                            <div className="border-t border-[var(--akzent-flaeche)] pt-1.5 mt-0.5">
                              <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-1">{t("ma.workTimeLimits")}</p>
                              <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap pl-0.5">
                                {([
                        ["max_hours_per_shift", editMaxHoursPerShift, setEditMaxHoursPerShift, t("ma.hoursPerShift"), "h", 24, 0.5],
                        ["max_shifts_per_week", editMaxShiftsPerWeek, setEditMaxShiftsPerWeek, t("ma.shiftsPerWeek"), "", 7, 1],
                        ["max_consecutive_days", editMaxConsecutiveDays, setEditMaxConsecutiveDays, t("ma.daysInARow"), "", 7, 1],
                        ["max_consecutive_nights", editMaxConsecutiveNights, setEditMaxConsecutiveNights, t("ma.nightsInARow"), "", 7, 1],
                        ["min_rest_hours", editMinRestHours, setEditMinRestHours, t("ma.restTime"), "h", 24, 0.5],
                    ] as [
                        string,
                        string,
                        (v: string) => void,
                        string,
                        string,
                        number,
                        number
                    ][]).map(([key, val, set, label, unit, max, step]) => {
                        const def = contractDefaults[key] ?? (LEGAL_DEFAULTS as Record<string, number>)[key];
                        return (<span key={key} className="inline-flex items-center gap-1">
                                      <span className="text-[13px] text-[var(--tinte-matt)]">{label}</span>
                                      <input type="number" min={0} max={max} step={step} value={val} onChange={e => set(e.target.value)} placeholder={def != null ? String(def) : "–"} className="w-14 px-1.5 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none"/>
                                      {unit && <span className="text-[13px] text-[var(--tinte-matt)]">{unit}</span>}
                                    </span>);
                    })}
                              </div>
                              <label className="flex items-center gap-1.5 mt-1.5 pl-0.5 cursor-pointer w-fit">
                                <input type="checkbox" checked={editNoSunday} onChange={e => setEditNoSunday(e.target.checked)} className="accent-[var(--akzent)]"/>
                                <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.noSundayLabel")}</span>
                              </label>
                              
                              <label className="flex items-center gap-1.5 mt-1.5 pl-0.5 flex-wrap">
                                <span className="text-[13px] text-[var(--tinte-matt)]">{t("ma.dienstplanung")}</span>
                                <select value={editDienstplanung} onChange={e => setEditDienstplanung(e.target.value)} className="px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none">
                                  <option value="">{t("ma.dpAuto")} ({t(DP_LABEL[dienstplanungVon({ role: person.beruf })])})</option>
                                  <option value="schicht">{t("ma.dpSchicht")}</option>
                                  <option value="tagdienst">{t("ma.dpTagdienst")}</option>
                                  <option value="selbst">{t("ma.dpSelbst")}</option>
                                </select>
                              </label>
                              <p className="text-[13px] text-[var(--tinte-leise)] mt-1 pl-0.5">{t("ma.dpHint")}</p>
                              <p className="text-[13px] text-[var(--tinte-leise)] mt-1 pl-0.5">{t("ma.limitsHint")}</p>
                            </div>
                            
                            <div className="border-t border-[var(--akzent-flaeche)] pt-1.5 mt-0.5">
                              <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wide mb-1">{t("ma.breaksHolidays")}</p>
                              <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap pl-0.5">
                                {([
                        ["break_after_minutes", editBreakAfterMinutes, setEditBreakAfterMinutes, t("ma.breakAfter"), "Min", 1440, 5],
                        ["break_min", editBreakMin, setEditBreakMin, t("ma.breakLength"), "Min", 240, 5],
                        ["max_holiday_shifts_per_month", editMaxHolidayShifts, setEditMaxHolidayShifts, t("ma.holidaysPerMonth"), "", 31, 1],
                        ["min_days_off_per_week", editMinDaysOff, setEditMinDaysOff, t("ma.daysOffPerWeek"), "", 7, 1],
                    ] as [
                        string,
                        string,
                        (v: string) => void,
                        string,
                        string,
                        number,
                        number
                    ][]).map(([key, val, set, label, unit, max, step]) => {
                        const def = contractDefaults[key];
                        return (<span key={key} className="inline-flex items-center gap-1">
                                      <span className="text-[13px] text-[var(--tinte-matt)]">{label}</span>
                                      <input type="number" min={0} max={max} step={step} value={val} onChange={e => set(e.target.value)} placeholder={def != null ? String(def) : "–"} className="w-14 px-1.5 py-1 border border-[var(--linie)] rounded-lg text-[13px] text-center focus:outline-none"/>
                                      {unit && <span className="text-[13px] text-[var(--tinte-matt)]">{unit}</span>}
                                    </span>);
                    })}
                              </div>
                              <p className="text-[13px] text-[var(--tinte-leise)] mt-1 pl-0.5">{t("ma.softHint")}</p>
                            </div>
                            {hoursError && (<p className="text-[13px] text-[var(--gefahr)] pl-0.5 leading-snug">{hoursError}</p>)}
                          </div>) : (<button onClick={() => {
                        setEditingHoursId(person.id);
                        setHoursError("");
                        setEditJobType(person.job_type || "Vollzeit");
                        setEditMaxHours(person.max_hours_per_week || 40);
                        setEditHourlyRate(person.hourly_rate != null ? String(person.hourly_rate) : defaultRate);
                        setEditMinijobBuffer(person.minijob_buffer_pct ?? 15);
                        setEditTaxClass(person.tax_class ?? 1);
                        setEditChurchTax(person.church_tax ?? false);
                        setEditChildrenCount(person.children_count ?? 0);
                        setEditOvertimeComp(person.overtime_compensation ?? "");
                        setEditOvertimeHoursPerDay(person.overtime_hours_per_day != null ? String(person.overtime_hours_per_day) : "");
                        const str = (v: number | null | undefined) => v != null ? String(v) : "";
                        setEditMaxShiftsPerWeek(str(person.max_shifts_per_week));
                        setEditMaxConsecutiveDays(str(person.max_consecutive_days));
                        setEditMaxConsecutiveNights(str(person.max_consecutive_nights));
                        setEditMaxHoursPerShift(str(person.max_hours_per_shift));
                        setEditMinRestHours(str(person.min_rest_hours));
                        setEditBreakAfterMinutes(str(person.break_after_minutes));
                        setEditBreakMin(str(person.break_min));
                        setEditMaxHolidayShifts(str(person.max_holiday_shifts_per_month));
                        setEditMinDaysOff(str(person.min_days_off_per_week));
                        setEditNoSunday(person.no_sunday_work ?? false);
                        setEditDienstplanung(person.dienstplanung ?? "");
                    }} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 hover:opacity-80 transition-opacity text-left" title={t("ma.editHoursTitle")}>
                            <span className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)]">
                              {jobTypeLabel(person.job_type || "Vollzeit")}
                            </span>
                            <span className="text-[13px] text-[var(--tinte-matt)]">
                              {person.max_hours_per_week || 40}{t("ma.hPerWeek")}
                            </span>
                            <span className="text-[13px] text-[var(--tinte-matt)]">
                              ≈{Math.round((person.max_hours_per_week || 40) * 4.33)}{t("ma.hPerMonth")}
                            </span>
                          </button>)}
                      </td>

                      <td className="py-3 pr-4">
                        <button onClick={() => openAvailModal(person)} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--akzent)] border border-[var(--linie)] hover:border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] px-2 py-1 rounded-lg transition-colors" title={t("ma.availabilityTitle")}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>calendar_month</span>
                          {t("ma.dayMo")}–{t("ma.daySo")}
                        </button>
                      </td>

                      
                      <td className="py-3 pr-4 text-[var(--tinte-matt)] text-[13px] whitespace-nowrap hidden 2xl:table-cell">
                        {person.created_at ? new Date(person.created_at).toLocaleDateString(locale) : "—"}
                      </td>

                      <td className="py-3 text-right">
                        
                        <div className="flex flex-col items-end gap-0.5">
                          <a href={`/personalakte?staff=${person.id}`} className="flex items-center whitespace-nowrap gap-1 px-2 py-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--akzent)] border border-transparent hover:border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>folder_shared</span>
                            {t("nav.personalakte")}
                          </a>
                          {rechteDaten && (<button onClick={() => setRechteFuer({ id: person.id, full_name: person.full_name })} className="flex items-center whitespace-nowrap gap-1 px-2 py-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--akzent)] border border-transparent hover:border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>admin_panel_settings</span>
                              Rechte{rechteVon(person.id)?.rechte.length ? ` (${rechteVon(person.id)!.rechte.length})` : ""}
                            </button>)}
                          <button onClick={() => resetRecovery(person)} disabled={resettingRecovery === person.id} title={t("ma.resetRecoveryTitle")} className="flex items-center whitespace-nowrap gap-1 px-2 py-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--akzent)] border border-transparent hover:border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition disabled:opacity-50">
                            {resettingRecovery === person.id
                    ? <PulseLoader size={11}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>key</span>}
                            {t("ma.resetAccess")}
                          </button>
                          <button onClick={() => archiveStaff(person.id, true)} disabled={archiving === person.id} className="flex items-center whitespace-nowrap gap-1 px-2 py-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--warnung)] border border-transparent hover:border-[var(--warnung)] hover:bg-[var(--warnung-flaeche)] rounded-lg transition disabled:opacity-50">
                            {archiving === person.id
                    ? <PulseLoader size={11}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>archive</span>}
                            {t("ma.archiveBtn")}
                          </button>
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>

            
            <div className="md:hidden space-y-2.5">
              {filtered.map(person => (<div key={person.id} className="border border-[var(--linie)] rounded-xl p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--akzent-flaeche)] flex items-center justify-center text-[var(--akzent)] text-[13px] font-semibold flex-shrink-0">
                      {person.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--tinte)] text-[15px] truncate">{person.full_name || "—"}</p>
                      {person.email && <p className="text-[13px] text-[var(--tinte-matt)] truncate">{person.email}</p>}
                      {person.phone && <p className="text-[13px] text-[var(--tinte-matt)] truncate">{person.phone}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="text-[var(--tinte-matt)]">{t("ui.station")}</p>
                      <p className="text-[var(--tinte)] font-medium truncate">{person.station || "—"}{person.station_secondary ? ` +${person.station_secondary}` : ""}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[var(--tinte-matt)]">{t("ma.position")}</p>
                      <p className="text-[var(--tinte)] font-medium truncate">{person.job_type ? jobTypeLabel(person.job_type) : "—"}{person.max_hours_per_week ? ` · ${person.max_hours_per_week}${t("ma.hPerWeek")}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => openAvailModal(person)} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg px-2.5 py-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>calendar_month</span> {t("ma.colAvailability")}
                    </button>
                    <a href={`/personalakte?staff=${person.id}`} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg px-2.5 py-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>folder_shared</span> {t("nav.personalakte")}
                    </a>
                    {rechteDaten && (<button onClick={() => setRechteFuer({ id: person.id, full_name: person.full_name })} className="flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg px-2.5 py-1.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>admin_panel_settings</span>
                        Rechte{rechteVon(person.id)?.rechte.length ? ` (${rechteVon(person.id)!.rechte.length})` : ""}
                      </button>)}
                    <button onClick={() => resetRecovery(person)} disabled={resettingRecovery === person.id} className="flex items-center gap-1 text-[13px] text-[var(--akzent)] border border-[var(--linie)] rounded-lg px-2.5 py-1.5 disabled:opacity-50">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>key</span> {t("ma.access")}
                    </button>
                    <button onClick={() => archiveStaff(person.id, true)} disabled={archiving === person.id} className="flex items-center gap-1 text-[13px] text-[var(--warnung)] border border-[var(--linie)] rounded-lg px-2.5 py-1.5 disabled:opacity-50">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>archive</span> {t("ma.archive")}
                    </button>
                  </div>
                </div>))}
            </div>
            </>)}

          {stations.length === 0 && staff.length > 0 && (<div className="mt-4 flex items-center gap-2 text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] border border-[var(--linie)] rounded-lg px-4 py-3">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>layers</span>
              {t("ma.noStationsHint")}
            </div>)}
        </div>

        
        {offeneCodes.length > 0 && (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <button onClick={() => setShowOffeneCodes(v => !v)} className="flex items-center gap-2 w-full text-left">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>{showOffeneCodes ? "expand_more" : "chevron_right"}</span>
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>mail</span>
              <span className="font-semibold text-[var(--tinte-matt)] text-[14px]">
                {offeneCodes.length} {t("imp.offeneTitel")}
              </span>
            </button>
            {showOffeneCodes && (<>
                <p className="mt-2 text-[13px] text-[var(--tinte-matt)]">{t("imp.offeneHinweis")}</p>
                <div className="mt-3 max-h-64 overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <tbody>
                      {offeneCodes.map(c => (<tr key={c.code} className="border-t border-[var(--linie)]">
                          <td className="py-1.5 pr-3 text-[var(--tinte)]">{c.preset_name ?? "—"}</td>
                          <td className="py-1.5 pr-3 font-mono tabular-nums text-[var(--tinte)]">{c.code}</td>
                          <td className="py-1.5 text-[var(--tinte-matt)]">
                            {c.expires_at ? `${t("imp.laeuftAb")} ${new Date(c.expires_at).toLocaleDateString(locale)}` : ""}
                          </td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
              </>)}
          </div>)}

        
        {archivedStaff.length > 0 && (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <button onClick={() => setShowArchived(v => !v)} className="flex items-center gap-2 w-full text-left">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>{showArchived ? "expand_more" : "chevron_right"}</span>
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>archive</span>
              <span className="font-semibold text-[var(--tinte-matt)] text-[14px]">{t("ma.archivedSection")}</span>
              <span className="ml-1 text-[13px] bg-[var(--akzent-flaeche)] text-[var(--tinte-matt)] px-2 py-0.5 rounded-full">{archivedStaff.length}</span>
            </button>
            {showArchived && (<div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--linie)]">
                      {[t("ma.colEmployee"), t("ma.colStations"), t("ma.registeredOn"), ""].map(h => (<th key={h} className="text-left text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider pb-3 pr-6">{h}</th>))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--linie)]">
                    {archivedStaff.map(person => (<tr key={person.id} className="opacity-60 hover:opacity-100 transition-opacity">
                        <td className="py-3 pr-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--akzent-flaeche)] flex items-center justify-center text-[var(--tinte-matt)] text-[13px] font-semibold flex-shrink-0">
                              {person.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                            <span className="font-medium text-[var(--tinte-matt)] text-[14px]">{person.full_name || "—"}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-6">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {person.station ? (<>
                                <FarbChip leise farbe={stationColor(person.station)}>{person.station}</FarbChip>
                                {person.station_secondary && (<FarbChip leise farbe={stationColor(person.station_secondary)}>{person.station_secondary}</FarbChip>)}
                              </>) : <span className="text-[13px] text-[var(--tinte-matt)]">—</span>}
                          </div>
                        </td>
                        <td className="py-3 pr-6 text-[var(--tinte-matt)] text-[13px]">
                          {person.created_at ? new Date(person.created_at).toLocaleDateString(locale) : "—"}
                        </td>
                        <td className="py-3 text-right">
                          <button onClick={() => archiveStaff(person.id, false)} disabled={archiving === person.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--ok)] border border-[var(--linie)] hover:border-[var(--ok)] hover:bg-[var(--ok-flaeche)] rounded-lg transition-colors disabled:opacity-50">
                            {archiving === person.id
                        ? <PulseLoader size={12}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>unarchive</span>}
                            {t("ma.restoreBtn")}
                          </button>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </div>)}

      </div>

      
      <Modal open={!!availModalId} onClose={() => setAvailModalId(null)} title={t("ma.colAvailability")} description={availModalName} widthClass="max-w-lg" footer={<>
              <button onClick={() => setAvailModalId(null)} className="px-4 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={saveAvailability} disabled={availSaving || availLoading} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {availSaving ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {availSaving ? t("ma.saving") : t("common.save")}
              </button>
          </>}>
        {availLoading ? (<div className="flex justify-center py-8"><PulseLoader size={20}/></div>) : (<div className="space-y-2">
            {availRows.map((row, i) => (<div key={row.day_of_week} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${row.available ? "border-[var(--akzent)] bg-[var(--papier-tief)]" : "border-[var(--linie)] bg-[var(--papier-tief)]"}`}>
                <span className={`w-8 text-center text-[13px] font-semibold ${row.available ? "text-[var(--akzent)]" : "text-[var(--tinte-matt)]"}`}>{t(DAY_KEYS[i])}</span>
                <Schalter an={row.available} name={t(DAY_KEYS[i])} onClick={() => setAvailRows(prev => prev.map(r => r.day_of_week === row.day_of_week ? { ...r, available: !r.available } : r))}/>
                {row.available ? (<>
                    <span className="text-[13px] text-[var(--tinte-matt)] flex-shrink-0">{t("ma.fromLower")}</span>
                    <input type="time" aria-label={`${t(DAY_KEYS[i])} ${t("ma.fromLower")}`} value={row.from_time} onChange={e => setAvailRows(prev => prev.map(r => r.day_of_week === row.day_of_week ? { ...r, from_time: e.target.value } : r))} className="w-24 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
                    <span className="text-[13px] text-[var(--tinte-matt)] flex-shrink-0">{t("ma.toLower")}</span>
                    <input type="time" aria-label={`${t(DAY_KEYS[i])} ${t("ma.toLower")}`} value={row.to_time} onChange={e => setAvailRows(prev => prev.map(r => r.day_of_week === row.day_of_week ? { ...r, to_time: e.target.value } : r))} className="w-24 px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
                    <span className="text-[13px] text-[var(--tinte-matt)] flex-shrink-0 ml-auto">{!row.from_time && !row.to_time ? t("ma.allDay") : ""}</span>
                  </>) : (<span className="text-[13px] text-[var(--tinte-matt)] italic">{t("ma.notAvailable")}</span>)}
              </div>))}
          </div>)}

      </Modal>

      
      <MitarbeiterImport open={showImport} onClose={() => setShowImport(false)} stationen={stations.map(s => s.name)} onAngelegt={() => setCodesNeuLaden(n => n + 1)}/>

      {showInviteModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-[var(--papier)] rounded-2xl  border border-[var(--linie)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--akzent-flaeche)] flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>person_add</span>
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-[var(--tinte)]">
                  {inviteStep === "form" ? t("ma.stepCreate") : inviteStep === "payroll" ? t("ma.stepPayroll") : t("ma.stepCerts")}
                </h2>
                <p className="text-[13px] text-[var(--tinte-matt)]">
                  {inviteStep === "form" ? t("ma.stepCreateSub") : inviteStep === "payroll" ? t("ma.stepPayrollSub") : t("ma.stepCertsSub")}
                </p>
              </div>
              <button onClick={closeInviteModal} className="p-1.5 text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] rounded-lg transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>

            
            <div className="flex items-center gap-2 mb-5">
              {(["form", "payroll", "certs"] as const).map((s, i) => {
                const order = { form: 0, payroll: 1, certs: 2 };
                const done = order[inviteStep] > i;
                const active = inviteStep === s;
                const dotClass = active
                    ? "bg-[var(--akzent)] text-white"
                    : done
                        ? "bg-[var(--ok-flaeche)] text-[var(--ok)]"
                        : "bg-[var(--papier-tief)] text-[var(--tinte-matt)]";
                return (<div key={s} className="flex items-center gap-2 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${dotClass}`}>
                      {done
                        ? <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">check</span>
                        : i + 1}
                    </div>
                    {i < 2 && <div className={`h-0.5 flex-1 rounded ${done ? "bg-[var(--ok)]" : "bg-[var(--papier-tief)]"}`}/>}
                  </div>);
            })}
            </div>

            
            {inviteStep !== "form" && inviteCode && (<div className="flex items-center gap-3 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-xl px-4 py-3 mb-5">
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-[var(--tinte-matt)] uppercase tracking-wider">{t("ma.inviteCodeFor")} {inviteFullName}</p>
                  <p className="font-mono text-[20px] font-semibold tracking-widest text-[var(--akzent)] select-all leading-tight">{inviteCode}</p>
                </div>
                <button onClick={() => navigator.clipboard.writeText(inviteCode)} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--akzent)] border border-[var(--linie)] rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                  {t("ma.copy")}
                </button>
              </div>)}

            {inviteError && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-[13px] px-4 py-3 rounded-lg mb-4">{inviteError}</div>)}

            
            {inviteStep === "form" && (<form onSubmit={createCode} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mitarbeiter-first-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.firstName")} <span className="text-[var(--gefahr)]">*</span></label>
                    <input id="mitarbeiter-first-name" type="text" required value={inviteForm.first_name} onChange={e => setInviteForm(f => ({ ...f, first_name: e.target.value }))} placeholder={t("ma.firstName")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </div>
                  <div>
                    <label htmlFor="mitarbeiter-last-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.lastName")} <span className="text-[var(--gefahr)]">*</span></label>
                    <input id="mitarbeiter-last-name" type="text" required value={inviteForm.last_name} onChange={e => setInviteForm(f => ({ ...f, last_name: e.target.value }))} placeholder={t("ma.lastName")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </div>
                </div>

                <div>
                  <label htmlFor="mitarbeiter-email" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("fp.email")}</label>
                  <input id="mitarbeiter-email" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="name@einrichtung.de" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("ma.emailAutofillHint")}</p>
                </div>

                <div>
                  <label htmlFor="mitarbeiter-phone" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.phone")} <span className="text-[var(--gefahr)]">*</span></label>
                  <input id="mitarbeiter-phone" type="tel" required value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder={t("ma.phonePlaceholder")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("ma.phoneHint")}</p>
                </div>

                <div>
                  <label htmlFor="mitarbeiter-beruf" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.beruf")}</label>
                  <BerufAuswahl id="mitarbeiter-beruf" value={inviteForm.role || standardBeruf(plan)} plan={plan} onChange={v => setInviteForm(f => ({ ...f, role: v }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("ma.berufHint")}</p>
                </div>

                <div>
                  <label htmlFor="mitarbeiter-jobtypelabel" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.jobTypeLabel")}</label>
                  <select id="mitarbeiter-jobtypelabel" value={inviteForm.job_type} onChange={e => setInviteForm(f => ({ ...f, job_type: e.target.value, max_hours_per_month: Math.round((DEFAULT_HOURS[e.target.value] ?? 40) * 4.33) }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]">
                    {JOB_TYPES.map(jt => <option key={jt} value={jt}>{jobTypeLabel(jt)}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="mitarbeiter-maxhourspermonth" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.maxHoursPerMonth")}</label>
                  <div className="flex items-center gap-2">
                    <input id="mitarbeiter-maxhourspermonth" type="text" inputMode="numeric" pattern="[0-9]*" value={inviteForm.max_hours_per_month === 0 ? "" : inviteForm.max_hours_per_month} onFocus={e => e.target.select()} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setInviteForm(f => ({ ...f, max_hours_per_month: raw === "" ? 0 : parseInt(raw, 10) })); }} className="flex-1 px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)] text-center"/>
                    <span className="text-[13px] text-[var(--tinte-matt)] flex-shrink-0">{t("ma.hPerMonth")}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mitarbeiter-station" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ui.station")} <span className="text-[var(--tinte-matt)] font-normal">{t("ma.optional")}</span></label>
                    {stations.length > 0 ? (<select id="mitarbeiter-station" value={inviteForm.station} onChange={e => setInviteForm(f => ({ ...f, station: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]">
                        <option value="">{t("ma.notAssigned")}</option>
                        {stations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>) : (<input type="text" value={inviteForm.station} onChange={e => setInviteForm(f => ({ ...f, station: e.target.value }))} placeholder={t("ma.stationAPlaceholder")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>)}
                  </div>
                  <div>
                    <label htmlFor="mitarbeiter-second-station" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.secondStation")} <span className="text-[var(--tinte-matt)] font-normal">{t("ma.optional")}</span></label>
                    {stations.length > 0 ? (<select id="mitarbeiter-second-station" value={inviteForm.station_secondary} onChange={e => setInviteForm(f => ({ ...f, station_secondary: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]">
                        <option value="">{t("ma.none")}</option>
                        {stations.filter(s => s.name !== inviteForm.station).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>) : (<input type="text" value={inviteForm.station_secondary} onChange={e => setInviteForm(f => ({ ...f, station_secondary: e.target.value }))} placeholder={t("ma.stationBPlaceholder")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>)}
                  </div>
                </div>

                {inviteForm.job_type === "Minijob" && (<div className="bg-[var(--ki-flaeche)] border border-[var(--linie)] rounded-xl p-4">
                    <label htmlFor="mitarbeiter-minijobbufferlabel" className="block text-[13px] font-medium text-[var(--ki)] mb-1.5">{t("ma.minijobBufferLabel")}</label>
                    <input id="mitarbeiter-minijobbufferlabel" type="number" min={0} max={50} value={inviteForm.minijob_buffer_pct} onChange={e => setInviteForm(f => ({ ...f, minijob_buffer_pct: parseInt(e.target.value) || 0 }))} className="w-24 px-3 py-2 border border-[var(--ki)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--ki)]/30 bg-[var(--papier)] text-center"/>
                    <p className="text-[13px] text-[var(--ki)] mt-1">{t("ma.wageNextStep")}</p>
                  </div>)}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={closeInviteModal} className="flex-1 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={inviting} className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {inviting ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span>}
                    {inviting ? t("ma.creating") : t("ma.generateCode")}
                  </button>
                </div>
              </form>)}

            
            {inviteStep === "payroll" && (<div className="space-y-4">
                
                <div className="bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 16 }}>account_balance</span>
                    <span className="text-[13px] font-semibold text-[var(--ok)]">{t("ma.bankDetails")}</span>
                    <span className="text-[13px] font-semibold text-[var(--ok)] bg-[var(--ok-flaeche)] px-2 py-0.5 rounded-full ml-auto">{t("ma.staysLocal")}</span>
                  </div>
                  <input type="text" value={bankForm.holder} onChange={e => setBankForm(b => ({ ...b, holder: e.target.value }))} placeholder={t("ma.accountHolder")} className="w-full px-3 py-2 border border-[var(--ok)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--ok)]/30 bg-[var(--papier)]"/>
                  <input type="text" value={bankForm.iban} onChange={e => setBankForm(b => ({ ...b, iban: e.target.value }))} placeholder="DE.. IBAN" className="w-full px-3 py-2 border border-[var(--ok)] rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--ok)]/30 bg-[var(--papier)]"/>
                  {bankForm.iban.trim() && !ibanValid(bankForm.iban) && (<p className="text-[13px] text-[var(--warnung)]">{t("ma.ibanInvalid")} ({formatIban(bankForm.iban)}).</p>)}
                  <p className="text-[13px] text-[var(--ok)]">{t("ma.bankLocalNote")}</p>
                </div>

                
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.hourlyWageEur")}</span>
                    <input type="number" min={0} step={0.01} value={payrollForm.hourly_rate} onChange={e => setPayrollForm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder="z.B. 14.50" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.breakPerShift")}</span>
                    <input type="number" min={0} max={120} value={payrollForm.break_min} onChange={e => setPayrollForm(p => ({ ...p, break_min: e.target.value }))} placeholder="z.B. 30" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.weekendSurcharge")}</span>
                    <input type="number" min={0} max={200} value={payrollForm.weekend_pct} onChange={e => setPayrollForm(p => ({ ...p, weekend_pct: e.target.value }))} placeholder="z.B. 25" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </label>
                  <label className="block">
                    <span className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.holidaySurcharge")}</span>
                    <input type="number" min={0} max={200} value={payrollForm.holiday_pct} onChange={e => setPayrollForm(p => ({ ...p, holiday_pct: e.target.value }))} placeholder="z.B. 100" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </label>
                  <label className="block col-span-2">
                    <span className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ma.vacationDaysPerYear")}</span>
                    <input type="number" min={0} max={60} value={payrollForm.vacation_days} onChange={e => setPayrollForm(p => ({ ...p, vacation_days: e.target.value }))} placeholder="z.B. 30" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  </label>
                </div>

                {inviteEffectiveHours && (<div className="flex items-center gap-2 text-[13px] text-[var(--ki)] bg-[var(--ki-flaeche)] border border-[var(--linie)] px-3 py-2 rounded-lg">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>info</span>
                    {t("ma.minijobPlanPre")}<strong>{inviteEffectiveHours}{t("ma.hPerMonth")}</strong>{t("ma.minijobPlanMid")}{inviteForm.minijob_buffer_pct}{t("ma.minijobPlanPost")}
                  </div>)}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setInviteStep("certs")} className="flex-1 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                    {t("ma.skip")}
                  </button>
                  <button type="button" onClick={savePayroll} disabled={inviting} className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {inviting ? <PulseLoader size={14}/> : null}
                    {inviting ? t("common.saving") : t("ma.saveAndNext")}
                  </button>
                </div>
              </div>)}

            
            {inviteStep === "certs" && (<div className="space-y-4">
                <div className="space-y-2">
                  {([
                    ["now", t("ma.certNowTitle"), t("ma.certNowDesc")],
                    ["employee", t("ma.certEmployeeTitle"), t("ma.certEmployeeDesc")],
                    ["later", t("ma.certLaterTitle"), t("ma.certLaterDesc")],
                ] as const).map(([val, title, desc]) => (<button key={val} type="button" onClick={() => setCertWho(val)} className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${certWho === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${certWho === val ? "border-[var(--akzent)] bg-[var(--akzent)]" : "border-[var(--linie)]"}`}/>
                        <span className="text-[13px] font-medium text-[var(--tinte)]">{title}</span>
                      </div>
                      <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 pl-6">{desc}</p>
                    </button>))}
                </div>

                {certWho === "now" && (<div className="border border-[var(--linie)] rounded-xl p-4 space-y-3">
                    {certs.length > 0 && (<div className="space-y-1.5">
                        {certs.map((c, i) => (<div key={i} className="flex items-center gap-2 text-[13px] bg-[var(--papier-tief)] rounded-lg px-3 py-2">
                            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 15 }}>workspace_premium</span>
                            <span className="flex-1 text-[var(--tinte)]">{c.cert_name}</span>
                            {c.expiry_date && <span className="text-[var(--tinte-matt)] text-[13px]">{t("ma.until")} {new Date(c.expiry_date).toLocaleDateString(locale)}</span>}
                            <button onClick={() => setCerts(cs => cs.filter((_, j) => j !== i))} className="text-[var(--tinte-leise)] hover:text-[var(--gefahr)]">
                              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                            </button>
                          </div>))}
                      </div>)}
                    <div className="flex items-end gap-2">
                      <label className="flex-1">
                        <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("ma.certificate")}</span>
                        <input type="text" value={certDraft.cert_name} onChange={e => setCertDraft(d => ({ ...d, cert_name: e.target.value }))} placeholder={t("ma.certPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                      </label>
                      <label>
                        <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{t("ma.expiry")}</span>
                        <input type="date" value={certDraft.expiry_date} onChange={e => setCertDraft(d => ({ ...d, expiry_date: e.target.value }))} className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                      </label>
                      <button type="button" onClick={() => { if (certDraft.cert_name.trim()) {
                    setCerts(cs => [...cs, { ...certDraft, cert_name: certDraft.cert_name.trim() }]);
                    setCertDraft({ cert_name: "", expiry_date: "" });
                } }} className="px-3 py-2 bg-[var(--akzent-flaeche)] text-[var(--akzent)] rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      </button>
                    </div>
                  </div>)}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setInviteStep("payroll")} className="flex-1 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                    {t("ma.back")}
                  </button>
                  <button type="button" onClick={finishInvite} disabled={inviting} className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--ok)] hover:bg-[var(--ok)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {inviting ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>}
                    {inviting ? t("ma.saving") : t("ma.done")}
                  </button>
                </div>
              </div>)}
          </div>
        </div>)}

      
      {recoveryError && (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[var(--gefahr)] text-white text-[13px] px-4 py-3 rounded-lg ">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          {recoveryError}
          <button onClick={() => setRecoveryError("")} className="ml-2 opacity-80 hover:opacity-100">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>)}

      
      
      <Modal open={!!recoveryModal} onClose={() => setRecoveryModal(null)} requireDecision hideCloseButton title={recoveryModal ? `${t("ma.newPhraseFor")} ${recoveryModal.name}` : ""} widthClass="max-w-md" footer={recoveryModal && (<>
              <button type="button" onClick={() => {
                navigator.clipboard?.writeText(recoveryModal.phrase).then(() => { setRecoveryCopied(true); setTimeout(() => setRecoveryCopied(false), 2000); }, () => { });
            }} className="px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{recoveryCopied ? "check" : "content_copy"}</span>
                {recoveryCopied ? t("ma.copied") : t("ma.copy")}
              </button>
              <button type="button" onClick={() => setRecoveryModal(null)} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
                {t("ma.done")}
              </button>
          </>)}>
        {recoveryModal && (<>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
              {t("ma.phraseIntroPre")}<strong>{t("ma.phraseIntroBold")}</strong>{t("ma.phraseIntroPost")}
            </p>
            <div className="rounded-xl border-2 border-dashed border-[var(--akzent)]/40 bg-[var(--akzent)]/5 px-4 py-4 mb-3">
              <p className="text-center font-mono text-[13px] font-semibold text-[var(--tinte)] leading-relaxed break-words">
                {recoveryModal.phrase}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-3 py-2 rounded-lg">
              <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 14 }}>warning</span>
              {t("ma.phraseOnceWarning")}
            </div>

          </>)}
      </Modal>
    </div>);
}

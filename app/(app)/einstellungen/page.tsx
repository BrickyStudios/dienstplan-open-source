"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { useLang } from "@/lib/LanguageContext";
import Header from "@/components/Header";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "@/lib/useAnalytics";
const analyticsHoerer = new Set<() => void>();
function abonniereAnalytics(h: () => void) {
    analyticsHoerer.add(h);
    return () => { analyticsHoerer.delete(h); };
}
function keinAbo() {
    return () => { };
}
function meldeAnalytics() {
    for (const h of analyticsHoerer)
        h();
}
const aufDemServerAn = () => true;
import { GERMAN_STATES, type SpecialDay } from "@/lib/scheduling/special-days";
import { MAX_ERINNERUNG_TAGE, MAX_PLAN_TAGE, STANDARD_ERINNERUNG_TAGE, STANDARD_PLAN_TAGE, loeseVorlaufzeiten, monatsbeginnNach } from "@/lib/scheduling/monats-automatik";
import SpecialDaysCard from "@/components/SpecialDaysCard";
import { passwortPruefen } from "@/lib/passwort-pruefen";
import ZweiFaktor from "@/components/ZweiFaktor";
import Sitzungen from "@/components/Sitzungen";
import Anmeldeverlauf from "@/components/Anmeldeverlauf";
import KontoSicherheitLeitung from "@/components/KontoSicherheitLeitung";
import { PASSWORD_HINT } from "@/lib/password";
import FlextimeSettingsCard from "@/components/FlextimeSettingsCard";
import Schalter from "@/components/Schalter";
import BereitschaftNachplanen from "@/components/BereitschaftNachplanen";
import Datenexport from "@/components/Datenexport";
import SelbstbedienungEinstellungen from "@/components/SelbstbedienungEinstellungen";
import { usePlanRoh } from "@/lib/PlanContext";
type Profile = {
    full_name: string;
    role: "leitung" | "mitarbeiter" | "demo";
    facility: string;
    email: string;
};
type AccessLogEntry = {
    id: string;
    admin_email: string;
    reason: string;
    accessed_at: string;
};
async function patchSettings(body: Record<string, unknown>): Promise<{
    ok: boolean;
    message: string;
}> {
    const res = await fetch("/api/leitung/facility-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.ok)
        return { ok: true, message: "" };
    const json = (await res.json().catch(() => null)) as {
        error?: string;
    } | null;
    return { ok: false, message: typeof json?.error === "string" ? json.error : "" };
}
export default function EinstellungenPage() {
    const teil: "konto" | "einrichtung" = usePathname()?.startsWith("/einstellungen/einrichtung") ? "einrichtung" : "konto";
    const { t } = useLang();
    const planRoh = usePlanRoh();
    const [verwaltet, setVerwaltet] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [name, setName] = useState("");
    const [savingName, setSavingName] = useState(false);
    const [nameSaved, setNameSaved] = useState(false);
    const [nameError, setNameError] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordSaved, setPasswordSaved] = useState(false);
    const [passwordError, setPasswordError] = useState("");
    const [hasRecoveryPhrase, setHasRecoveryPhrase] = useState<boolean | null>(null);
    const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [recoveryCopied, setRecoveryCopied] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const analyticsEnabled = useSyncExternalStore(abonniereAnalytics, () => { try {
        return isAnalyticsEnabled();
    }
    catch {
        return true;
    } }, aufDemServerAn);
    const passwortGeleakt = useSyncExternalStore(keinAbo, () => window.location.search.includes("hinweis=passwort-geleakt"), () => false);
    const [privacyOpen, setPrivacyOpen] = useState(false);
    const [showSurvey, setShowSurvey] = useState(false);
    useEffect(() => {
        fetch("/api/user/recovery")
            .then(r => r.json())
            .then(d => setHasRecoveryPhrase(!!d.hasPhrase))
            .catch(() => setHasRecoveryPhrase(null));
    }, []);
    async function handleGenerateRecovery() {
        setRecoveryLoading(true);
        setRecoveryPhrase(null);
        try {
            const res = await fetch("/api/user/recovery", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.recovery_phrase) {
                setRecoveryPhrase(data.recovery_phrase);
                setHasRecoveryPhrase(true);
            }
        }
        finally {
            setRecoveryLoading(false);
        }
    }
    const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
    const [accessLogLoaded, setAccessLogLoaded] = useState(false);
    const [pauseThreshold, setPauseThreshold] = useState(20);
    const [savingPause, setSavingPause] = useState(false);
    const [pauseSaved, setPauseSaved] = useState(false);
    const [pauseError, setPauseError] = useState("");
    const [understaffingMode, setUnderstaffingMode] = useState<"popup" | "auto">("popup");
    const [overtimeLimitPct, setOvertimeLimitPct] = useState(20);
    const [overtimeRebalanceMode, setOvertimeRebalanceMode] = useState<"off" | "suggest" | "auto">("off");
    const [shiftSwapMode, setShiftSwapMode] = useState<"manual" | "automatic" | "leitung_only">("manual");
    const [fachkraftQuote, setFachkraftQuote] = useState<number>(50);
    const [savingAlgo, setSavingAlgo] = useState(false);
    const [algoSaved, setAlgoSaved] = useState(false);
    const [algoError, setAlgoError] = useState("");
    const [autoSchedulingEnabled, setAutoSchedulingEnabled] = useState(false);
    const [wishReminderDaysBefore, setWishReminderDaysBefore] = useState(STANDARD_ERINNERUNG_TAGE);
    const [planCreateDaysBefore, setPlanCreateDaysBefore] = useState(STANDARD_PLAN_TAGE);
    const [allowLateWishes, setAllowLateWishes] = useState(true);
    const [savingAuto, setSavingAuto] = useState(false);
    const [autoSaved, setAutoSaved] = useState(false);
    const [autoError, setAutoError] = useState("");
    const [autoRequestExternal, setAutoRequestExternal] = useState(false);
    const [scheduleSpringer, setScheduleSpringer] = useState(false);
    const [savingSpringer, setSavingSpringer] = useState(false);
    const [springerSaved, setSpringerSaved] = useState(false);
    const [springerError, setSpringerError] = useState("");
    const [savingExternal, setSavingExternal] = useState(false);
    const [externalSaved, setExternalSaved] = useState(false);
    const [externalError, setExternalError] = useState("");
    const [autoPayrollEnabled, setAutoPayrollEnabled] = useState(false);
    const [savingPayroll, setSavingPayroll] = useState(false);
    const [payrollSaved, setPayrollSaved] = useState(false);
    const [payrollError, setPayrollError] = useState("");
    const [vacationAutoApprove, setVacationAutoApprove] = useState(false);
    const [savingVacationAuto, setSavingVacationAuto] = useState(false);
    const [vacationAutoSaved, setVacationAutoSaved] = useState(false);
    const [vacationAutoError, setVacationAutoError] = useState("");
    const [savingFullAuto, setSavingFullAuto] = useState(false);
    const [fullAutoSaved, setFullAutoSaved] = useState(false);
    const [fullAutoError, setFullAutoError] = useState("");
    const [leadersManageVacation, setLeadersManageVacation] = useState(false);
    const [leadersManageWishes, setLeadersManageWishes] = useState(false);
    const [savingLeaderPerms, setSavingLeaderPerms] = useState(false);
    const [leaderPermsSaved, setLeaderPermsSaved] = useState(false);
    const [leaderPermsError, setLeaderPermsError] = useState("");
    const [bundesland, setBundesland] = useState("");
    const [ort, setOrt] = useState("");
    const [savingLocation, setSavingLocation] = useState(false);
    const [locationSaved, setLocationSaved] = useState(false);
    const [locationError, setLocationError] = useState("");
    const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
    const [savingSpecialDays, setSavingSpecialDays] = useState(false);
    const [specialDaysError, setSpecialDaysError] = useState("");
    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user)
                return;
            const { data } = await supabase
                .from("user_profiles")
                .select("full_name, role, facility")
                .eq("id", user.id)
                .maybeSingle();
            const p: Profile = {
                full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
                role: data?.role ?? user.user_metadata?.role ?? "mitarbeiter",
                facility: data?.facility ?? user.user_metadata?.facility ?? "",
                email: user.email ?? "",
            };
            setProfile(p);
            setName(p.full_name);
            let verwaltetJetzt = false;
            if (data?.role === "mitarbeiter") {
                const kontext = await fetch("/api/leitung/context").then(r => r.ok ? r.json() : null).catch(() => null);
                verwaltetJetzt = Boolean(kontext?.delegiert && kontext.rechte?.includes("einstellungen"));
                setVerwaltet(verwaltetJetzt);
            }
            if (data?.role === "leitung" || data?.role === "demo" || verwaltetJetzt) {
                const [logRes, settingsRes] = await Promise.all([
                    fetch("/api/leitung/access-log"),
                    fetch("/api/leitung/facility-settings"),
                ]);
                if (logRes.ok) {
                    const logJson = await logRes.json();
                    setAccessLog(logJson.logs ?? []);
                }
                if (settingsRes.ok) {
                    const settingsJson = await settingsRes.json();
                    const s = settingsJson.settings;
                    if (s?.pause_threshold_minutes != null)
                        setPauseThreshold(s.pause_threshold_minutes);
                    if (s?.understaffing_mode === "popup" || s?.understaffing_mode === "auto")
                        setUnderstaffingMode(s.understaffing_mode);
                    if (s?.overtime_limit_pct != null)
                        setOvertimeLimitPct(s.overtime_limit_pct);
                    if (["off", "suggest", "auto"].includes(s?.overtime_rebalance_mode))
                        setOvertimeRebalanceMode(s.overtime_rebalance_mode);
                    if (["manual", "automatic", "leitung_only"].includes(s?.shift_swap_mode))
                        setShiftSwapMode(s.shift_swap_mode);
                    if (s?.fachkraft_quote != null && Number.isFinite(Number(s.fachkraft_quote)))
                        setFachkraftQuote(Math.round(Number(s.fachkraft_quote) * 100));
                    if (s?.auto_scheduling_enabled != null)
                        setAutoSchedulingEnabled(s.auto_scheduling_enabled);
                    if (s?.allow_late_wishes != null)
                        setAllowLateWishes(s.allow_late_wishes);
                    const vorlauf = loeseVorlaufzeiten(s);
                    setWishReminderDaysBefore(vorlauf.erinnerungTage);
                    setPlanCreateDaysBefore(vorlauf.planTage);
                    if (s?.auto_request_external_agencies != null)
                        setAutoRequestExternal(s.auto_request_external_agencies);
                    if (s?.schedule_springer_enabled != null)
                        setScheduleSpringer(s.schedule_springer_enabled);
                    if (s?.auto_payroll_enabled != null)
                        setAutoPayrollEnabled(s.auto_payroll_enabled);
                    if (s?.vacation_auto_approve != null)
                        setVacationAutoApprove(s.vacation_auto_approve);
                    if (s?.leaders_manage_vacation != null)
                        setLeadersManageVacation(s.leaders_manage_vacation);
                    if (s?.leaders_manage_wishes != null)
                        setLeadersManageWishes(s.leaders_manage_wishes);
                    if (typeof s?.bundesland === "string")
                        setBundesland(s.bundesland);
                    if (typeof s?.ort === "string")
                        setOrt(s.ort);
                    if (Array.isArray(s?.special_days))
                        setSpecialDays(s.special_days);
                }
                setAccessLogLoaded(true);
            }
        }
        load();
    }, []);
    async function handleSaveName(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim())
            return;
        setSavingName(true);
        setNameError("");
        setNameSaved(false);
        const res = await fetch("/api/user/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name: name.trim() }),
        });
        const antwort = await res.json().catch(() => ({}));
        if (!res.ok) {
            setNameError(typeof antwort?.error === "string" && res.status === 403
                ? antwort.error
                : "Name konnte nicht gespeichert werden. Bitte versuche es erneut.");
        }
        else {
            setNameSaved(true);
            setProfile(p => p ? { ...p, full_name: name.trim() } : p);
            setTimeout(() => setNameSaved(false), 3000);
        }
        setSavingName(false);
    }
    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setPasswordError("");
        setPasswordSaved(false);
        if (newPassword.length < 8) {
            setPasswordError(t("set.errPwdShort"));
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError(t("set.errPwdMismatch"));
            return;
        }
        setSavingPassword(true);
        const befund = await passwortPruefen(newPassword);
        if (befund && !befund.ok) {
            setPasswordError(befund.hinweis ?? PASSWORD_HINT);
            setSavingPassword(false);
            return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: profile!.email,
            password: currentPassword,
        });
        if (signInError) {
            setPasswordError(t("auth.login.errPwd"));
            setSavingPassword(false);
            return;
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setPasswordError("Passwort konnte nicht geändert werden. Bitte versuche es erneut.");
        }
        else {
            setPasswordSaved(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setTimeout(() => setPasswordSaved(false), 4000);
        }
        setSavingPassword(false);
    }
    async function handleSavePauseThreshold(e: React.FormEvent) {
        e.preventDefault();
        setSavingPause(true);
        setPauseError("");
        setPauseSaved(false);
        const r = await patchSettings({ pause_threshold_minutes: pauseThreshold });
        if (!r.ok) {
            setPauseError(r.message || "Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut.");
        }
        else {
            setPauseSaved(true);
            setTimeout(() => setPauseSaved(false), 3000);
        }
        setSavingPause(false);
    }
    async function handleSaveLocation(e: React.FormEvent) {
        e.preventDefault();
        setSavingLocation(true);
        setLocationError("");
        setLocationSaved(false);
        const r = await patchSettings({ bundesland: bundesland || null, ort: ort.trim() || null });
        if (!r.ok) {
            setLocationError(r.message || "Standort konnte nicht gespeichert werden. Bitte versuche es erneut.");
        }
        else {
            setLocationSaved(true);
            setTimeout(() => setLocationSaved(false), 3000);
        }
        setSavingLocation(false);
    }
    async function handleSaveSpecialDays(next: SpecialDay[]) {
        setSavingSpecialDays(true);
        setSpecialDaysError("");
        const prev = specialDays;
        setSpecialDays(next);
        const r = await patchSettings({ special_days: next });
        if (!r.ok) {
            setSpecialDays(prev);
            setSpecialDaysError(r.message || "Sondertage konnten nicht gespeichert werden. Bitte versuche es erneut.");
        }
        setSavingSpecialDays(false);
    }
    async function handleSaveAlgo(e: React.FormEvent) {
        e.preventDefault();
        setSavingAlgo(true);
        setAlgoError("");
        setAlgoSaved(false);
        const r = await patchSettings({ understaffing_mode: understaffingMode, overtime_limit_pct: overtimeLimitPct,
            overtime_rebalance_mode: overtimeRebalanceMode,
            shift_swap_mode: shiftSwapMode,
            fachkraft_quote: fachkraftQuote,
            auto_scheduling_enabled: autoSchedulingEnabled,
            wish_reminder_days_before: wishReminderDaysBefore, plan_create_days_before: planCreateDaysBefore,
            allow_late_wishes: allowLateWishes });
        if (!r.ok) {
            setAlgoError(r.message || "Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut.");
        }
        else {
            setAlgoSaved(true);
            setTimeout(() => setAlgoSaved(false), 3000);
        }
        setSavingAlgo(false);
    }
    const fullAutomation = autoSchedulingEnabled &&
        understaffingMode === "auto" &&
        shiftSwapMode === "automatic" &&
        overtimeRebalanceMode === "auto" &&
        autoPayrollEnabled &&
        vacationAutoApprove;
    async function handleToggleFullAutomation() {
        const next = !fullAutomation;
        setSavingFullAuto(true);
        setFullAutoError("");
        setFullAutoSaved(false);
        const patch = next
            ? { auto_scheduling_enabled: true, understaffing_mode: "auto" as const, shift_swap_mode: "automatic" as const, overtime_rebalance_mode: "auto" as const, auto_payroll_enabled: true, vacation_auto_approve: true }
            : { auto_scheduling_enabled: false, understaffing_mode: "popup" as const, shift_swap_mode: "manual" as const, overtime_rebalance_mode: "off" as const, auto_payroll_enabled: false, vacation_auto_approve: false };
        const r = await patchSettings(patch);
        if (!r.ok) {
            setFullAutoError(r.message || "Konnte nicht gespeichert werden.");
        }
        else {
            setAutoSchedulingEnabled(patch.auto_scheduling_enabled);
            setUnderstaffingMode(patch.understaffing_mode);
            setShiftSwapMode(patch.shift_swap_mode);
            setOvertimeRebalanceMode(patch.overtime_rebalance_mode);
            setAutoPayrollEnabled(patch.auto_payroll_enabled);
            setVacationAutoApprove(patch.vacation_auto_approve);
            setFullAutoSaved(true);
            setTimeout(() => setFullAutoSaved(false), 3000);
        }
        setSavingFullAuto(false);
    }
    async function handleLogout() {
        setLoggingOut(true);
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    }
    async function handleDeleteAccount() {
        setDeletingAccount(true);
        setDeleteError("");
        try {
            const res = await fetch("/api/user/account", { method: "DELETE" });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error || "Fehler beim Löschen");
            }
            await supabase.auth.signOut();
            router.push("/login");
        }
        catch (err) {
            setDeleteError(String(err instanceof Error ? err.message : err));
            setDeletingAccount(false);
        }
    }
    return (<div>
      {teil === "konto"
            ? <Header title={t("nav.konto")} subtitle={t("set.subtitle")}/>
            : <Header title={t("set.title")} subtitle={t("set.subtitleEinrichtung")}/>}
      <div className="px-7 pb-7 pt-4 max-w-2xl mx-auto space-y-4">

        {teil === "konto" && (<>
        
        {passwortGeleakt && (<div role="alert" className="flex items-start gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--gefahr)] text-[13px] px-4 py-3 rounded-lg">
            <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 16 }}>warning</span>
            <span>
              <strong>Ihr Passwort steht in einer öffentlichen Liste gestohlener Passwörter.</strong>{" "}
              Es wurde nicht bei Nurvo gestohlen, aber wer es kennt, kann es bei Ihnen ausprobieren.{" "}
              <a href="#passwort-aendern" className="underline font-semibold">Jetzt ändern</a>
            </span>
          </div>)}

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-[18px] font-semibold ${profile?.role === "leitung" ? "bg-[var(--tinte)]" : "bg-[var(--tinte-matt)]"}`}>
              {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-semibold text-[var(--tinte)] text-[15px]">{profile?.full_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)]">
                  <span className="material-symbols-outlined" style={{ fontSize: 10 }}>
                    {profile?.role === "leitung" ? "shield" : "person"}
                  </span>
                  {profile?.role === "leitung" ? t("set.leitung") : t("set.mitarbeiter")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
              <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0" style={{ fontSize: 16 }}>mail</span>
              <div>
                <p className="text-[13px] text-[var(--tinte-matt)]">{t("set.email")}</p>
                <p className="text-[13px] font-medium text-[var(--tinte)]">{profile?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
              <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0" style={{ fontSize: 16 }}>business</span>
              <div>
                <p className="text-[13px] text-[var(--tinte-matt)]">{t("set.facility")}</p>
                <p className="text-[13px] font-medium text-[var(--tinte)]">{profile?.facility || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>rate_review</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Feedback & Wünsche</h2>
          </div>
          <p className="text-[13px] text-[var(--tinte-matt)] mb-4">
            Was läuft gut, was fehlt Ihnen? Ihre Antworten sind anonym — nur Ihre Wunsch-Nachricht
            mit E-Mail sehen wir persönlich, damit wir antworten können.
          </p>
          <button onClick={() => setShowSurvey(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--akzent)] text-white text-[13px] font-semibold hover:bg-[var(--akzent-tief)] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
            Feedback geben
          </button>
        </div>

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>person</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("set.changeName")}</h2>
          </div>

          
          {profile && profile.role !== "leitung" && profile.role !== "demo" ? (<div className="space-y-2">
              <div className="block text-[13px] font-medium text-[var(--tinte-matt)]">{t("set.fullName")}</div>
              <div className="px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] text-[var(--tinte)]">
                {profile.full_name || "—"}
              </div>
              <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">
                Deinen Namen ändert die Leitung. Er verbindet dich mit Dienstplan,
                Lohnabrechnung und Zertifikaten.
              </p>
            </div>) : (<form onSubmit={handleSaveName} className="space-y-3">
            <div>
              <label htmlFor="einstellungen-fullname" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("set.fullName")}</label>
              <input id="einstellungen-fullname" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder={t("set.fullName")} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
            </div>

            {nameError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                {nameError}
              </div>)}
            {nameSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 14 }}>check_circle</span>
                {t("set.nameSaved")}
              </div>)}

            <button type="submit" disabled={savingName || name.trim() === profile?.full_name} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
              {savingName
                    ? <PulseLoader size={14}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
              {savingName ? t("set.nameSaving") : t("set.nameSave")}
            </button>
          </form>)}
        </div>

        
        <div id="passwort-aendern" className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6 scroll-mt-24">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>lock</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("set.changePassword")}</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label htmlFor="einstellungen-currentpassword" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("set.currentPassword")}</label>
              <input id="einstellungen-currentpassword" type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder={t("set.currentPassword")} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
            </div>
            <div>
              <label htmlFor="einstellungen-newpassword" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("set.newPassword")}</label>
              <input id="einstellungen-newpassword" type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t("set.newPassword")} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
            </div>
            <div>
              <label htmlFor="einstellungen-confirmpassword" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("set.confirmPassword")}</label>
              <input id="einstellungen-confirmpassword" type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t("set.confirmPassword")} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
            </div>

            {passwordError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                {passwordError}
              </div>)}
            {passwordSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 14 }}>check_circle</span>
                {t("set.passwordSaved")}
              </div>)}

            <button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
              {savingPassword
                ? <PulseLoader size={14}/>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span>}
              {savingPassword ? t("set.passwordChanging") : t("set.passwordChange")}
            </button>
          </form>
        </div>

        
        <ZweiFaktor />
        <Sitzungen />
        <Anmeldeverlauf />

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>key</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Wiederherstellungs-Phrase</h2>
          </div>
          <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
            Dein einziger Weg, das Passwort ohne Anmeldung zurückzusetzen — es gibt keinen Reset per
            E-Mail. Bewahre die Phrase sicher auf. Erzeugst du eine neue, wird die alte ungültig.
          </p>

          {recoveryPhrase ? (<div>
              <div className="rounded-xl border-2 border-dashed border-[var(--akzent)]/40 bg-[var(--akzent)]/5 px-4 py-4 mb-3">
                <p className="text-center font-mono text-[13px] font-semibold text-[var(--tinte)] leading-relaxed break-words">
                  {recoveryPhrase}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-3 py-2 rounded-lg mb-3">
                <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 14 }}>warning</span>
                Wird nur einmal angezeigt. Jetzt sicher notieren.
              </div>
              <button type="button" onClick={() => {
                    navigator.clipboard?.writeText(recoveryPhrase).then(() => { setRecoveryCopied(true); setTimeout(() => setRecoveryCopied(false), 2000); }, () => { });
                }} className="flex items-center gap-2 px-5 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{recoveryCopied ? "check" : "content_copy"}</span>
                {recoveryCopied ? "Kopiert!" : "Phrase kopieren"}
              </button>
            </div>) : (<div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-[13px]">
                {hasRecoveryPhrase === null ? (<span className="text-[var(--tinte-matt)]">Status wird geladen…</span>) : hasRecoveryPhrase ? (<span className="flex items-center gap-1.5 text-[var(--ok)]">
                    <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 16 }}>check_circle</span>
                    Eine Phrase ist eingerichtet.
                  </span>) : (<span className="flex items-center gap-1.5 text-[var(--warnung)]">
                    <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 16 }}>error</span>
                    Noch keine Phrase eingerichtet.
                  </span>)}
              </div>
              <button type="button" onClick={handleGenerateRecovery} disabled={recoveryLoading} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {recoveryLoading
                    ? <PulseLoader size={14}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>autorenew</span>}
                {hasRecoveryPhrase ? "Neue Phrase erzeugen" : "Phrase erzeugen"}
              </button>
            </div>)}
        </div>

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>visibility</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("set.accessLog")}</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-4">{t("set.accessLogHint")}</p>

            {accessLog.length === 0 ? (<div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
                <span className="material-symbols-outlined text-[var(--ok)] flex-shrink-0" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <p className="text-[13px] text-[var(--tinte-matt)]">{t("set.noAccess")}</p>
              </div>) : (<div className="space-y-2">
                {accessLog.map(entry => (<div key={entry.id} className="flex items-start gap-3 px-4 py-3 bg-[var(--papier-tief)] rounded-lg">
                    <div className="w-7 h-7 rounded-full bg-[var(--warnung-flaeche)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 13 }}>visibility</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-[var(--tinte)]">{entry.admin_email}</span>
                        <span className="text-[13px] bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)] px-2 py-0.5 rounded-full">
                          {entry.reason}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 11 }}>schedule</span>
                        <span className="text-[13px] text-[var(--tinte-matt)]">
                          {new Date(entry.accessed_at).toLocaleString("de-DE", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                        })}
                        </span>
                      </div>
                    </div>
                  </div>))}
              </div>)}
          </div>)}

        </>)}

        {teil === "einrichtung" && (<>
        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>pause_circle</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Pausenqualität</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
              Ab welcher Mindest-Pausenzeit gilt eine Schicht als ausreichend erholt? Der Algorithmus wertet Schichten über 6 Stunden mit weniger Pause als Belastungsindikator.
            </p>
            <form onSubmit={handleSavePauseThreshold} className="space-y-4">
              <div>
                <label htmlFor="einst-pause" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-2">
                  Mindestpause pro Schicht &gt; 6h
                </label>
                <div className="flex items-center gap-4">
                  <input id="einst-pause" type="range" min={5} max={60} step={5} value={pauseThreshold} onChange={e => setPauseThreshold(Number(e.target.value))} className="flex-1 accent-[var(--akzent)]"/>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg min-w-[72px] justify-center">
                    <span className="text-[14px] font-semibold text-[var(--akzent)]">{pauseThreshold}</span>
                    <span className="text-[13px] text-[var(--tinte-matt)]">Min</span>
                  </div>
                </div>
                <div className="flex justify-between text-[13px] text-[var(--tinte-matt)] mt-1 px-0.5">
                  <span>5 Min</span>
                  <span>30 Min</span>
                  <span>60 Min</span>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--papier-tief)] border border-[var(--linie)] rounded-lg text-[13px] text-[var(--tinte-matt)]">
                <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 14 }}>info</span>
                Schichten &gt; 6h mit weniger als <strong className="mx-1 text-[var(--akzent)]">{pauseThreshold} Min</strong> Pause zählen als Belastungssignal und senken die Planungspriorität.
              </div>

              {pauseError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                  {pauseError}
                </div>)}
              {pauseSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 14 }}>check_circle</span>
                  Einstellung gespeichert
                </div>)}

              <button type="submit" disabled={savingPause} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingPause
                    ? <PulseLoader size={14}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingPause ? "Wird gespeichert…" : "Einstellung speichern"}
              </button>
            </form>
          </div>)}

        

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>location_on</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Standort</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
              Das Bundesland steuert, welche regionalen Sondertage (z.B. Oktoberfest) unten greifen.
            </p>
            {!bundesland && (<div className="flex items-start gap-2 mb-4 text-[13px] text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2.5">
                <span className="material-symbols-outlined text-[var(--warnung)] flex-shrink-0" style={{ fontSize: 15 }}>info</span>
                <span>Noch kein Bundesland hinterlegt — regionale Sondertage greifen erst, wenn eines gesetzt ist. Bundesweite Sondertage (Silvester, Karneval) sind davon nicht betroffen.</span>
              </div>)}
            <form onSubmit={handleSaveLocation} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="einst-bundesland" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Bundesland</label>
                  <select id="einst-bundesland" value={bundesland} onChange={e => setBundesland(e.target.value)} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]">
                    <option value="">Bitte wählen …</option>
                    {GERMAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="einst-ort" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">Ort (optional)</label>
                  <input id="einst-ort" type="text" value={ort} onChange={e => setOrt(e.target.value)} placeholder="z.B. München" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]"/>
                </div>
              </div>
              {locationError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                  {locationError}
                </div>)}
              {locationSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 14 }}>check_circle</span>
                  Gespeichert
                </div>)}
              <button type="submit" disabled={savingLocation} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingLocation ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingLocation ? "Wird gespeichert…" : "Standort speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<SpecialDaysCard specialDays={specialDays} bundesland={bundesland} saving={savingSpecialDays} error={specialDaysError} onSave={handleSaveSpecialDays}/>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<FlextimeSettingsCard />)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border-2 p-6" style={{ borderColor: fullAutomation ? "var(--akzent)" : "var(--linie)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>bolt</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Vollautomatik</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-5">
              Ein Schalter für alles: Dienstplan-Erstellung, Ausfall-Entscheidungen bei Krankmeldung, Schichttausch, Überstunden-Ausgleich, Lohnabrechnung und Urlaubsgenehmigung laufen komplett automatisch. Passen Sie später eine der Einzeleinstellungen weiter unten individuell an, zeigt dieser Schalter das sofort als „aus“ an.
            </p>
            <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: fullAutomation ? "var(--akzent)" : "var(--linie)", backgroundColor: fullAutomation ? "var(--akzent-flaeche)" : "var(--papier)" }}>
              <div>
                <p className="text-[13px] font-semibold text-[var(--tinte)]">Vollautomatik aktivieren</p>
                <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                  Setzt Dienstplanung, Unterbesetzung, Schichttausch, Überstunden-Ausgleich, Lohnabrechnung und Urlaubsgenehmigung auf automatisch — bzw. beim Ausschalten zurück auf die manuellen Standardwerte.
                </p>
              </div>
              <Schalter an={fullAutomation} onClick={() => handleToggleFullAutomation()} disabled={savingFullAuto}/>
            </label>

            {fullAutoError && <div className="mt-3 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{fullAutoError}</div>}
            {fullAutoSaved && <div className="mt-3 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>schedule</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Dienstplan-Algorithmus</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
              Was passiert, wenn nicht genug Mitarbeiter für eine Schicht verfügbar sind?
            </p>
            <form onSubmit={handleSaveAlgo} className="space-y-5">
              
              <div>
                <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-2">
                  Unterbesetzungs-Modus
                </p>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: understaffingMode === "popup" ? "var(--akzent)" : "var(--linie)", backgroundColor: understaffingMode === "popup" ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                    <input type="radio" name="understaffingMode" value="popup" checked={understaffingMode === "popup"} onChange={() => setUnderstaffingMode("popup")} className="mt-0.5 accent-[var(--akzent)]"/>
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--tinte)]">Popup (Standard)</div>
                      <div className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Nach der Plangenerierung erscheint ein Dialog, in dem du für jeden Engpass entscheidest: Überstunden oder Unterbesetzung.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: understaffingMode === "auto" ? "var(--akzent)" : "var(--linie)", backgroundColor: understaffingMode === "auto" ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                    <input type="radio" name="understaffingMode" value="auto" checked={understaffingMode === "auto"} onChange={() => setUnderstaffingMode("auto")} className="mt-0.5 accent-[var(--akzent)]"/>
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--tinte)]">Vollautomatisch</div>
                      <div className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Der Algorithmus entscheidet selbst: Wenn jemand im Überstunden-Limit verfügbar ist, wird er eingeplant — sonst bleibt die Stelle unbesetzt. Alle automatischen Entscheidungen werden als Vermerk gespeichert.</div>
                    </div>
                  </label>
                </div>
              </div>

              
              <div>
                <label htmlFor="einst-ueberstunden" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-2">
                  Überstunden-Limit (max. über Wochenstunden)
                </label>
                <div className="flex items-center gap-4">
                  <input id="einst-ueberstunden" type="range" min={5} max={50} step={5} value={overtimeLimitPct} onChange={e => setOvertimeLimitPct(Number(e.target.value))} className="flex-1 accent-[var(--akzent)]"/>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg min-w-[72px] justify-center">
                    <span className="text-[14px] font-semibold text-[var(--akzent)]">+{overtimeLimitPct}</span>
                    <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                  </div>
                </div>
                <div className="flex justify-between text-[13px] text-[var(--tinte-matt)] mt-1 px-0.5">
                  <span>+5%</span>
                  <span>+25%</span>
                  <span>+50%</span>
                </div>
                <div className="flex items-center gap-2 mt-2 px-3 py-2.5 bg-[var(--papier-tief)] border border-[var(--linie)] rounded-lg text-[13px] text-[var(--tinte-matt)]">
                  <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 14 }}>info</span>
                  Minijob- und Werkstudenten-Verträge werden nie für Überstunden eingeplant (Gehaltsgrenze).
                </div>
              </div>

              
              <div>
                <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Überstunden-Ausgleich</p>
                <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">Liegt jemand über dem Stunden-Limit, kann Nurvo gegensteuern (Schicht abgeben/tauschen).</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["off", "Aus", "Kein Eingriff."],
                    ["suggest", "Vorschlag", "Nurvo erkennt Überstunden und schlägt Ihnen den Ausgleich vor — Sie bestätigen."],
                    ["auto", "Automatisch", "Nurvo baut Überstunden beim Planen selbst ab (Besetzung + ArbZG bleiben gewahrt)."],
                ] as const).map(([val, label, desc]) => (<button key={val} type="button" onClick={() => setOvertimeRebalanceMode(val)} className={`text-left p-3 rounded-xl border transition-colors ${overtimeRebalanceMode === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                      <p className="text-[13px] font-semibold text-[var(--tinte)]">{label}</p>
                      <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{desc}</p>
                    </button>))}
                </div>
              </div>

              
              <div>
                <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Schichttausch</p>
                <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">Wenn Mitarbeitende Schichten tauschen möchten, prüft Nurvo Station und Verfügbarkeit beider Seiten — unterschiedliche Uhrzeiten sind erlaubt, solange es passt.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    ["manual", "Manuell", "Jede Tausch-Anfrage muss von Ihnen freigegeben werden, bevor der/die Kolleg:in gefragt wird."],
                    ["automatic", "Automatisch", "Kolleg:innen können direkt zustimmen — Sie werden nur über das Ergebnis informiert."],
                    ["leitung_only", "Nur über Leitung", "Mitarbeitende sehen keinen Tausch-Button — der Tausch wird ausschließlich von Ihnen durchgeführt."],
                ] as const).map(([val, label, desc]) => (<button key={val} type="button" onClick={() => setShiftSwapMode(val)} className={`text-left p-3 rounded-xl border transition-colors ${shiftSwapMode === val ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                      <p className="text-[13px] font-semibold text-[var(--tinte)]">{label}</p>
                      <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{desc}</p>
                    </button>))}
                </div>
              </div>

              
              <div>
                <label htmlFor="einst-fachkraftquote" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Fachkraftquote</label>
                <p className="text-[13px] text-[var(--tinte-matt)] mb-2.5">
                  Mindestanteil examinierter Pflegefachkräfte pro Schicht. Ein Tausch, der eine Schicht darunter drücken würde,
                  wird im Automatik-/Kollegen-Modus <strong>blockiert</strong>; im manuellen Modus sehen Sie eine <strong>Warnung</strong> und
                  können bewusst freigeben. Üblicher Richtwert: 50 % — verbindlich ist die Fachkraftquote des jeweiligen Landesrechts (in NRW z.B. WTG/WTG-DVO).
                </p>
                <div className="flex items-center gap-3">
                  <input id="einst-fachkraftquote" type="range" min={0} max={100} step={5} value={fachkraftQuote} onChange={e => setFachkraftQuote(Number(e.target.value))} className="flex-1 accent-[var(--akzent)]"/>
                  <div className="flex items-center gap-1">
                    <input aria-label="Fachkraftquote in Prozent" type="number" min={0} max={100} value={fachkraftQuote} onChange={e => setFachkraftQuote(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} className="w-16 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                    <span className="text-[13px] text-[var(--tinte-matt)]">%</span>
                  </div>
                </div>
              </div>

              {algoError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                  {algoError}
                </div>)}
              {algoSaved && (<div className="flex items-center gap-2 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 14 }}>check_circle</span>
                  Einstellung gespeichert
                </div>)}

              <button type="submit" disabled={savingAlgo} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingAlgo
                    ? <PulseLoader size={14}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingAlgo ? "Wird gespeichert…" : "Einstellung speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>smart_toy</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Vollautomatische Planung</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-5">
              Dienstpläne werden automatisch erstellt, Mitarbeiter werden rechtzeitig zur Wunscheingabe benachrichtigt, und Krankmeldungen passen den Plan automatisch an.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingAuto(true);
                    setAutoError("");
                    setAutoSaved(false);
                    const r = await patchSettings({ auto_scheduling_enabled: autoSchedulingEnabled, wish_reminder_days_before: wishReminderDaysBefore, plan_create_days_before: planCreateDaysBefore, allow_late_wishes: allowLateWishes });
                    if (!r.ok)
                        setAutoError(r.message || "Konnte nicht gespeichert werden.");
                    else {
                        setAutoSaved(true);
                        setTimeout(() => setAutoSaved(false), 3000);
                    }
                    setSavingAuto(false);
                }} className="space-y-5">

              
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: autoSchedulingEnabled ? "var(--akzent)" : "var(--linie)", backgroundColor: autoSchedulingEnabled ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Automatische Planung aktivieren</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Nurvo prüft jeden Tag, ob ein neuer Dienstplan erstellt werden muss — auch wenn niemand angemeldet ist.</p>
                </div>
                <Schalter an={autoSchedulingEnabled} onClick={() => setAutoSchedulingEnabled(v => !v)}/>
              </label>

              {autoSchedulingEnabled && <>
                
                {([
                        { key: "reminder" as const,
                            label: "Mitarbeiter an Wünsche und Urlaub erinnern",
                            hint: "Erinnerung per E-Mail und im Postfach — dann noch einmal am Tag vor der Planerstellung.",
                            wert: wishReminderDaysBefore, min: 3, max: MAX_ERINNERUNG_TAGE,
                            setzen: (v: number) => { setWishReminderDaysBefore(v); if (planCreateDaysBefore >= v)
                                setPlanCreateDaysBefore(Math.max(1, v - 1)); } },
                        { key: "create" as const,
                            label: "Dienstplan für den Monat erstellen",
                            hint: "Der Server erstellt den Plan von selbst — auch wenn niemand angemeldet ist.",
                            wert: planCreateDaysBefore, min: 1, max: MAX_PLAN_TAGE,
                            setzen: (v: number) => { setPlanCreateDaysBefore(v); if (wishReminderDaysBefore <= v)
                                setWishReminderDaysBefore(Math.min(MAX_ERINNERUNG_TAGE, v + 1)); } },
                    ]).map(reg => (<div key={reg.key}>
                    <label className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-2" htmlFor={`vorlauf-${reg.key}`}>
                      {reg.label} … Tage vor Monatsbeginn
                    </label>
                    <div className="flex items-center gap-4">
                      <input id={`vorlauf-${reg.key}`} type="range" min={reg.min} max={reg.max} step={1} value={reg.wert} onChange={e => reg.setzen(Number(e.target.value))} className="flex-1 accent-[var(--akzent)]"/>
                      <div className="flex items-center gap-1 px-3 py-1.5 bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg min-w-[68px] justify-center">
                        <span className="text-[14px] font-semibold text-[var(--akzent)]">{reg.wert}</span>
                        <span className="text-[13px] text-[var(--tinte-matt)]">Tage</span>
                      </div>
                    </div>
                    <p className="text-[13px] text-[var(--tinte-leise)] mt-1">{reg.hint}</p>
                  </div>))}

                
                {(() => {
                        const m = monatsbeginnNach(new Date(), 1);
                        const tag = (tage: number) => new Date(m.jahr, m.monat - 1, 1 - tage).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
                        const monatsName = new Date(m.jahr, m.monat - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
                        return (<p className="text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] border border-[var(--linie)] rounded-lg px-4 py-3">
                      Für <strong className="text-[var(--tinte)]">{monatsName}</strong> heißt das:
                      Erinnerung am <strong className="text-[var(--tinte)]">{tag(wishReminderDaysBefore)}</strong>,
                      Plan am <strong className="text-[var(--tinte)]">{tag(planCreateDaysBefore)}</strong>.
                    </p>);
                    })()}

                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={allowLateWishes} onChange={e => setAllowLateWishes(e.target.checked)} className="w-4 h-4 accent-[var(--akzent)]"/>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--tinte)]">Wünsche nach Plangenerierung erlauben</p>
                    <p className="text-[13px] text-[var(--tinte-matt)]">Mitarbeiter können auch nach Erstellung des Plans noch Wünsche einreichen. Der Plan wird automatisch angepasst, falls möglich — sonst erhalten beide Seiten eine Nachricht.</p>
                  </div>
                </label>
              </>}

              {autoError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{autoError}</div>}
              {autoSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingAuto} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingAuto ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingAuto ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>payments</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Lohnabrechnung automatisch</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
              Zu Monatsbeginn berechnet Nurvo die Lohnabrechnung des Vormonats <strong>serverseitig</strong> als Entwurf — auch wenn dein PC aus ist. Du bekommst eine Benachrichtigung „<strong>Lohnabrechnung ist fertig</strong>“ und überweist die Löhne dann selbst. Die <strong>Bankverbindungen/IBANs bleiben ausschließlich auf diesem Gerät</strong> und werden nie an einen Server gesendet.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingPayroll(true);
                    setPayrollError("");
                    setPayrollSaved(false);
                    const r = await patchSettings({ auto_payroll_enabled: autoPayrollEnabled });
                    if (!r.ok)
                        setPayrollError(r.message || "Konnte nicht gespeichert werden.");
                    else {
                        setPayrollSaved(true);
                        setTimeout(() => setPayrollSaved(false), 3000);
                    }
                    setSavingPayroll(false);
                }} className="space-y-5">
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: autoPayrollEnabled ? "var(--akzent)" : "var(--linie)", backgroundColor: autoPayrollEnabled ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Lohnabrechnung automatisch erstellen</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Monatlich als Entwurf — Finalisieren und Überweisen bleiben deine Entscheidung</p>
                </div>
                <Schalter an={autoPayrollEnabled} onClick={() => setAutoPayrollEnabled(v => !v)}/>
              </label>

              {payrollError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{payrollError}</div>}
              {payrollSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingPayroll} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingPayroll ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingPayroll ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>beach_access</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Urlaub automatisch genehmigen</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
              Stellt jemand einen neuen Urlaubsantrag, prüft Nurvo für jede betroffene Schicht: Bleibt die Besetzung <strong>ohne</strong> diese Person weiterhin gedeckt (Soll-Bedarf erreicht), wird der Antrag <strong>sofort automatisch genehmigt</strong>. Reicht die Besetzung nicht, bleibt der Antrag wie bisher offen für dich — <strong>nie automatisch abgelehnt</strong>.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingVacationAuto(true);
                    setVacationAutoError("");
                    setVacationAutoSaved(false);
                    const r = await patchSettings({ vacation_auto_approve: vacationAutoApprove });
                    if (!r.ok)
                        setVacationAutoError(r.message || "Konnte nicht gespeichert werden.");
                    else {
                        setVacationAutoSaved(true);
                        setTimeout(() => setVacationAutoSaved(false), 3000);
                    }
                    setSavingVacationAuto(false);
                }} className="space-y-5">
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: vacationAutoApprove ? "var(--akzent)" : "var(--linie)", backgroundColor: vacationAutoApprove ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Automatische Genehmigung aktivieren</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Gilt für Anträge ohne bestehende Unterbesetzung — der Rest bleibt bei dir.</p>
                </div>
                <Schalter an={vacationAutoApprove} onClick={() => setVacationAutoApprove(v => !v)}/>
              </label>

              {vacationAutoError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{vacationAutoError}</div>}
              {vacationAutoSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingVacationAuto} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingVacationAuto ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingVacationAuto ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>support_agent</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Bereitschaft fest einplanen</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-5">
              Der Dienstplan bestimmt dann beim Erstellen für <strong>jeden Tag eine Bereitschaft</strong> —
              jemand, der an dem Tag keine Schicht hat, nicht abwesend ist und bisher am wenigsten
              Bereitschaft hatte. Die Person sieht den Tag unter <strong>Mein Plan</strong> als
              Bereitschaft, und bei einer Krankmeldung greift die Ausfallsuche zuerst auf sie zu.
              Die Bereitschaft belegt keinen regulären Schichtplatz.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingSpringer(true);
                    setSpringerError("");
                    setSpringerSaved(false);
                    try {
                        const res = await fetch("/api/leitung/facility-settings", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ schedule_springer_enabled: scheduleSpringer }),
                        });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok)
                            setSpringerError(d.error ?? "Konnte nicht gespeichert werden.");
                        else {
                            setSpringerSaved(true);
                            setTimeout(() => setSpringerSaved(false), 3000);
                        }
                    }
                    catch {
                        setSpringerError("Server nicht erreichbar.");
                    }
                    setSavingSpringer(false);
                }} className="space-y-5">
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: scheduleSpringer ? "var(--akzent)" : "var(--linie)", backgroundColor: scheduleSpringer ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Täglich eine Bereitschaft einplanen</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
                    Gilt ab dem nächsten erstellten Dienstplan. Für schon erstellte Pläne: „Bereitschaft
                    nachplanen“ weiter unten.
                  </p>
                </div>
                <Schalter an={scheduleSpringer} onClick={() => setScheduleSpringer(v => !v)}/>
              </label>

              {springerError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg whitespace-pre-line">{springerError}</div>}
              {springerSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingSpringer} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingSpringer ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>}
                Speichern
              </button>
            </form>
            <BereitschaftNachplanen />
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>contact_phone</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Externe Dienste automatisch anfragen</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-3">
              Meldet sich jemand krank und ist für die Schicht <strong>kein Bereitschafts- oder verfügbarer Springer</strong> frei, fragt Nurvo die hinterlegten Personaldienstleister automatisch <strong>der Reihe nach</strong> an — der nächste erst, wenn der vorige absagt. Zu-/Absage per Ein-Klick in der E-Mail. Dienste hinterlegst du unter <strong>Springer</strong>.
            </p>
            <p className="text-[13px] text-[var(--tinte-matt)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2 mb-5">
              Standardmäßig aus. Ist sie an, geht die erste Anfrage sofort mit der Krankmeldung raus — der nächste Dienst erst, wenn der vorige absagt oder 24 Stunden nicht antwortet. Der externe Dienst erfährt nur Einrichtung, Datum, Schicht und Station, nie den Namen der kranken Person.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingExternal(true);
                    setExternalError("");
                    setExternalSaved(false);
                    const r = await patchSettings({ auto_request_external_agencies: autoRequestExternal });
                    if (!r.ok)
                        setExternalError(r.message || "Konnte nicht gespeichert werden.");
                    else {
                        setExternalSaved(true);
                        setTimeout(() => setExternalSaved(false), 3000);
                    }
                    setSavingExternal(false);
                }} className="space-y-5">
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: autoRequestExternal ? "var(--akzent)" : "var(--linie)", backgroundColor: autoRequestExternal ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Automatische Anfrage aktivieren</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Nur wenn intern kein Springer (Bereitschaft / verfügbar gemeldet) für die Schicht frei ist. Standardmäßig aus.</p>
                </div>
                <Schalter an={autoRequestExternal} onClick={() => setAutoRequestExternal(v => !v)}/>
              </label>

              {externalError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">{externalError}</div>}
              {externalSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingExternal} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingExternal ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingExternal ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          </div>)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && planRoh === "praxis" && (<SelbstbedienungEinstellungen />)}

        
        {accessLogLoaded && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && planRoh !== "praxis" && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>shield_person</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Rechte für Stations- &amp; Bereichsleitungen</h2>
            </div>
            <p className="text-[var(--tinte-matt)] text-[13px] mb-5">
              Erteile den von dir ernannten <strong>Stations-</strong> und <strong>Bereichsleitungen</strong> zusätzliche Rechte. Sie können dann ausgewählte Anliegen <strong>ihrer eigenen Station/ihres Bereichs</strong> direkt selbst bearbeiten — du behältst weiterhin den vollen Überblick. Standardmäßig sind alle Rechte aus.
            </p>
            <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingLeaderPerms(true);
                    setLeaderPermsError("");
                    setLeaderPermsSaved(false);
                    const res = await fetch("/api/leitung/facility-settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ leaders_manage_vacation: leadersManageVacation, leaders_manage_wishes: leadersManageWishes }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok)
                        setLeaderPermsError(json.error ?? "Konnte nicht gespeichert werden.");
                    else {
                        setLeaderPermsSaved(true);
                        setTimeout(() => setLeaderPermsSaved(false), 3000);
                    }
                    setSavingLeaderPerms(false);
                }} className="space-y-3">

              
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: leadersManageVacation ? "var(--akzent)" : "var(--linie)", backgroundColor: leadersManageVacation ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 15 }}>beach_access</span>
                    Urlaubsanträge bearbeiten
                  </p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Leitungen dürfen Urlaubsanträge der Mitarbeiter ihrer Station/ihres Bereichs annehmen oder ablehnen.</p>
                </div>
                <Schalter an={leadersManageVacation} onClick={() => setLeadersManageVacation(v => !v)}/>
              </label>

              
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition-colors" style={{ borderColor: leadersManageWishes ? "var(--akzent)" : "var(--linie)", backgroundColor: leadersManageWishes ? "var(--akzent-flaeche)" : "var(--papier)" }}>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tinte)] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 15 }}>favorite</span>
                    Dienstwünsche bearbeiten
                  </p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Leitungen dürfen Dienstwünsche ihrer Mitarbeiter als berücksichtigt oder abgelehnt markieren.</p>
                </div>
                <Schalter an={leadersManageWishes} onClick={() => setLeadersManageWishes(v => !v)}/>
              </label>

              {leaderPermsError && <div className="text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg whitespace-pre-line">{leaderPermsError}</div>}
              {leaderPermsSaved && <div className="text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Gespeichert</div>}

              <button type="submit" disabled={savingLeaderPerms} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {savingLeaderPerms ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
                {savingLeaderPerms ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          </div>)}

        </>)}

        
        {(profile?.role === "mitarbeiter" ? teil === "konto" : teil === "einrichtung") && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>menu_book</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Einführung</h2>
          </div>
          <p className="text-[var(--tinte-matt)] text-[13px] mb-4">Die Einführung zeigt dir die wichtigsten Funktionen der App.</p>
          <div className="flex flex-wrap gap-3">
            {profile?.role === "mitarbeiter" ? (<a href="/onboarding?again=1" className="flex items-center gap-2 px-5 py-2.5 text-[var(--akzent)] text-[13px] font-semibold rounded-lg border border-[var(--linie)] bg-[var(--akzent-flaeche)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>menu_book</span>
                Einführung erneut anzeigen
              </a>) : (<button onClick={async () => {
                    const supabase = createClient();
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user?.id)
                        localStorage.removeItem(`nurvo_setup_dismissed_${user.id}`);
                    window.location.href = "/dashboard";
                }} className="flex items-center gap-2 px-5 py-2.5 text-[var(--tinte-matt)] text-[13px] font-semibold rounded-lg border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>checklist</span>
                Setup-Checkliste anzeigen
              </button>)}
          </div>
        </div>)}

        
        {teil === "einrichtung" && (profile?.role === "leitung" || profile?.role === "demo" || verwaltet) && <Datenexport />}

        
        {teil === "einrichtung" && (profile?.role === "leitung" || profile?.role === "demo") && <KontoSicherheitLeitung />}

        {teil === "konto" && (<>

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>security</span>
            <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Datenschutz & Daten</h2>
          </div>
          <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
            Was Nurvo über dich weiß — lokal, auf dem Server, und wofür wir es nutzen.
          </p>

          
          <div className="flex items-start justify-between gap-4 px-4 py-4 rounded-xl bg-[var(--papier-tief)] border border-[var(--linie)] mb-4">
            <div className="flex-1">
              <p className="font-semibold text-[var(--tinte)] text-[13px] mb-1">Nutzungsanalyse</p>
              <p className="text-[var(--tinte-matt)] text-[13px] leading-relaxed">
                Hilft uns zu verstehen, welche Features dir wichtig sind — damit wir genau die Stellen verbessern, die du täglich nutzt.
                Kein Name, kein Inhalt — nur Seitenaufrufe und Klicks.
              </p>
              {!analyticsEnabled && (<p className="text-[var(--warnung)] text-[13px] mt-1.5 font-medium">
                  Deaktiviert — du kannst sie jederzeit wieder einschalten.
                </p>)}
            </div>
            <button onClick={() => {
                const next = !analyticsEnabled;
                setAnalyticsEnabled(next);
                meldeAnalytics();
            }} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${analyticsEnabled ? "bg-[var(--akzent)]" : "bg-[var(--linie)]"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--papier)] rounded-full shadow transition-transform ${analyticsEnabled ? "translate-x-6" : ""}`}/>
            </button>
          </div>

          
          <button onClick={() => setPrivacyOpen(v => !v)} className="flex items-center gap-1.5 text-[13px] text-[var(--akzent)] hover:underline mb-4">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{privacyOpen ? "expand_less" : "expand_more"}</span>
            {privacyOpen ? "Weniger anzeigen" : "Warum brauchen wir das?"}
          </button>

          {privacyOpen && (<div className="mb-4 px-4 py-4 rounded-xl bg-[var(--akzent-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--tinte-matt)] space-y-2 leading-relaxed">
              <p className="font-semibold text-[var(--akzent)]">So nutzen wir die Daten:</p>
              <p>
                Wenn viele Nutzer eine Seite besuchen aber selten eine Aktion ausführen, wissen wir: etwas ist unklar.
                Wenn ein Feature kaum geöffnet wird, prüfen wir ob es schwer zu finden ist.
                Kurz: Wir schauen auf Muster — nicht auf Inhalte.
              </p>
              <p className="font-semibold text-[var(--akzent)] pt-1">Was wir NICHT sehen:</p>
              <ul className="list-none space-y-0.5">
                {["Kein Mitarbeitername, keine Diagnosen, keine Schichtinhalte",
                    "Keine Nachrichten oder Notizen",
                    "Keine genaue Uhrzeit — nur Datum",
                    "Kein Gerätefingerprint"].map(item => (<li key={item} className="flex items-start gap-1.5">
                    <span className="text-[var(--akzent)] flex-shrink-0">✓</span> {item}
                  </li>))}
              </ul>
              <p className="text-[var(--tinte-matt)] text-[13px] pt-1">
                Alle Daten liegen auf Supabase-Servern in der EU. Kein Drittanbieter erhält Zugriff.
              </p>
            </div>)}

          
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">Deine Daten im Überblick</p>

            
            <div className="rounded-xl border border-[var(--linie)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--papier-tief)] border-b border-[var(--linie)]">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 14 }}>cloud</span>
                <p className="font-semibold text-[var(--tinte)] text-[13px]">Auf dem Server (Supabase · EU)</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[
                { icon: "person", label: "Name & E-Mail", desc: "Für Login und Personalisierung" },
                { icon: "business", label: "Einrichtungsname & Rolle", desc: "Für Schichtplanung und Zugriffskontrolle" },
                { icon: "schedule", label: "Schichtpläne & Zeiterfassung", desc: "Dein Arbeitgeber braucht diese Daten — sie verlassen Nurvo nicht" },
                { icon: "sick", label: "Krankmeldungen", desc: "Nur deine Einrichtung sieht sie" },
                { icon: "bar_chart", label: "Analytics-Events (wenn aktiv)", desc: "Seitenaufrufe + Klicks — kein persönlicher Inhalt" },
            ].map(({ icon, label, desc }) => (<div key={label} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0 mt-0.5" style={{ fontSize: 14 }}>{icon}</span>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--tinte)]">{label}</p>
                      <p className="text-[13px] text-[var(--tinte-matt)]">{desc}</p>
                    </div>
                  </div>))}
              </div>
            </div>

            
            <div className="rounded-xl border border-[var(--linie)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--papier-tief)] border-b border-[var(--linie)]">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 14 }}>phone_android</span>
                <p className="font-semibold text-[var(--tinte)] text-[13px]">Nur lokal auf deinem Gerät</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[
                { icon: "vpn_key", label: "Passwort", desc: "Wird niemals im Klartext gespeichert — nur als Hash bei Supabase" },
                { icon: "fingerprint", label: "Session-ID für Analytics", desc: "Nur im sessionStorage — verschwindet wenn du den Browser schließt" },
                { icon: "menu_book", label: "Onboarding-Fortschritt", desc: "Wie weit du die Einführung/Einrichtung abgeschlossen hast" },
                { icon: "settings", label: "Analytics-Präferenz (diese Einstellung)", desc: "Ob du Analytics ein- oder ausgeschaltet hast" },
            ].map(({ icon, label, desc }) => (<div key={label} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[var(--akzent)] flex-shrink-0 mt-0.5" style={{ fontSize: 14 }}>{icon}</span>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--tinte)]">{label}</p>
                      <p className="text-[13px] text-[var(--tinte-matt)]">{desc}</p>
                    </div>
                  </div>))}
              </div>
            </div>
          </div>
        </div>

        
        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <h2 className="font-semibold text-[var(--tinte)] text-[15px] mb-4">{t("set.account")}</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={handleLogout} disabled={loggingOut} className="flex items-center gap-2 px-5 py-2.5 text-[var(--gefahr)] text-[13px] font-semibold rounded-lg border border-[var(--linie)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
              {loggingOut
                ? <PulseLoader size={14}/>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>logout</span>}
              {loggingOut ? t("set.loggingOut") : t("set.logout")}
            </button>
            {!showDeleteConfirm && (<button onClick={() => { setShowDeleteConfirm(true); setDeleteError(""); }} className="flex items-center gap-2 px-5 py-2.5 text-[var(--tinte-leise)] text-[13px] font-semibold rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete_forever</span>
                Konto löschen
              </button>)}
          </div>
          {showDeleteConfirm && (<div className="mt-4 rounded-xl border border-[var(--linie)] bg-[var(--gefahr-flaeche)] p-4 space-y-3">
              <p className="text-[13px] font-semibold text-[var(--gefahr)]">Konto wirklich löschen?</p>
              <p className="text-[13px] text-[var(--gefahr)]">
                Alle deine Profildaten werden unwiderruflich gelöscht. Schichtpläne und Zeiterfassungseinträge
                deiner Einrichtung bleiben erhalten (Aufbewahrungspflicht).
              </p>
              {deleteError && <p className="text-[13px] text-[var(--gefahr)] font-medium">{deleteError}</p>}
              <div className="flex gap-2">
                <button onClick={handleDeleteAccount} disabled={deletingAccount} className="flex items-center gap-2 px-4 py-2 bg-[var(--gefahr)] hover:bg-[var(--gefahr)] text-white text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {deletingAccount ? <PulseLoader size={12}/> : "Ja, Konto löschen"}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deletingAccount} className="px-4 py-2 text-[13px] font-semibold rounded-lg border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
                  Abbrechen
                </button>
              </div>
            </div>)}
        </div>
        </>)}

      </div>

          </div>);
}

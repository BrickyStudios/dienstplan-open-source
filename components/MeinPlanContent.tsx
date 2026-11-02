"use client";
import KalenderVerbinden from "@/components/KalenderVerbinden";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Moon, WifiOff, Sparkles, CheckCircle, Users, Download, Calendar, Play, Pause, Square, Sun, Sunset, MapPin, Thermometer, Plane, Coffee, Repeat, UserMinus } from "lucide-react";
import Header from "@/components/Header";
import { useLang } from "@/lib/LanguageContext";
import PlanExportMenu from "@/components/PlanExportMenu";
import { type PlanExportDoc, SHIFT_LABEL_DE, fmtPlanDate, shiftTimeRange } from "@/lib/planExport";
import { daysInclusive, todayISO, zeitumstellungMinuten } from "@/lib/date";
import SchichtabgabeAnfragen from "@/components/SchichtabgabeAnfragen";
import SchichtabgabeDialog from "@/components/SchichtabgabeDialog";
import Modal from "@/components/Modal";
type Shift = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    planned_staff: number;
    notes: string;
};
type TimeEntry = {
    id: string;
    check_in: string;
    check_out: string | null;
    duration_minutes: number | null;
};
type SwapRow = {
    id: string;
    status: string;
    reason?: string;
    requester_shift_id: string;
    requester_shift_date: string;
    requester_shift_type: string;
    requester_staff_name: string;
    target_shift_id: string;
    target_shift_date: string;
    target_shift_type: string;
    target_staff_name: string;
};
type SwapPartnerOption = {
    staffId: string;
    staffName: string;
    shiftId: string;
    shiftDate: string;
    shiftType: string;
};
type SwapDiagSample = {
    colleague: string;
    date: string;
    colleagueCanTakeMine: boolean;
    iCanTakeTheirs: boolean;
    colleagueAlreadyWorksMyDate: boolean;
    iAlreadyWorkTheirDate: boolean;
    colleagueOnVacationMyDate: boolean;
    iOnVacationTheirDate: boolean;
};
type SwapDiag = {
    facility: string;
    actorName: string;
    windowShifts: number;
    windowAssignments: number;
    ownShiftsUpcoming: number;
    shiftFoundInWindow: boolean;
    ownAssignmentFound: boolean | null;
    candidateShifts: number | null;
    candidateAssignments: number | null;
    colleaguesWhoCanTakeMyShift: number | null;
    upcomingShiftsICanTake: number | null;
    legalSwaps: number | null;
    samples: SwapDiagSample[];
};
function swapBlockReason(diag: SwapDiag | null): {
    headline: string;
    detail: string;
} {
    if (diag) {
        if (typeof console !== "undefined")
            console.debug("[nurvo] swap-diagnose", diag);
    }
    if (!diag) {
        return {
            headline: "Kein Tauschpartner gefunden.",
            detail: "Für diese Schicht gibt es derzeit keine passende Gegenschicht auf deiner Station.",
        };
    }
    if (diag.ownAssignmentFound === false) {
        return {
            headline: "Du bist für diese Schicht nicht eingeteilt.",
            detail: "Deshalb lässt sie sich nicht tauschen. Wenn das nicht stimmt, melde es der Leitung — im Dienstplan fehlt dann deine Zuteilung.",
        };
    }
    if (diag.candidateShifts === 0) {
        return {
            headline: "Auf deiner Station ist sonst nichts geplant.",
            detail: "In den nächsten 60 Tagen gibt es keine weiteren Schichten, gegen die getauscht werden könnte.",
        };
    }
    if (diag.colleaguesWhoCanTakeMyShift === 0) {
        return {
            headline: "Niemand kann deine Schicht übernehmen.",
            detail: "Alle Kolleg:innen mit einer passenden Gegenschicht arbeiten an deinem Tag schon selbst oder haben Urlaub.",
        };
    }
    if (diag.upcomingShiftsICanTake === 0) {
        return {
            headline: "Du kannst keine der Gegenschichten übernehmen.",
            detail: "An den infrage kommenden Tagen arbeitest du bereits oder hast Urlaub.",
        };
    }
    return {
        headline: "Kein zulässiger Tausch möglich.",
        detail: "Es gibt Gegenschichten, aber keine Kombination, die Ruhezeiten und Besetzung einhält.",
    };
}
const SHIFT_COLORS: Record<string, string> = {
    frueh: "bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)]",
    spaet: "bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)]",
    nacht: "bg-[var(--akzent-flaeche)] text-[var(--tinte)] border border-[var(--linie)]",
};
type ActiveEntry = {
    id: string;
    check_in: string;
    check_out: string | null;
    station: string | null;
    paused_at?: string | null;
    total_pause_minutes?: number;
};
const FALLBACK_SHIFT_MIN: Record<string, number> = { frueh: 480, spaet: 480, nacht: 540 };
function shiftScheduledMinutes(shift: Shift): number {
    if (shift.start_time && shift.end_time) {
        const [sh, sm] = shift.start_time.split(":").map(Number);
        const [eh, em] = shift.end_time.split(":").map(Number);
        let mins = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        if (mins <= 0)
            mins += 24 * 60;
        mins += zeitumstellungMinuten(shift.date, shift.start_time, shift.end_time);
        return mins;
    }
    return FALLBACK_SHIFT_MIN[shift.shift_type] ?? 480;
}
function requiredBreakMinutes(scheduledMin: number): number {
    if (scheduledMin > 9 * 60)
        return 45;
    if (scheduledMin > 6 * 60)
        return 30;
    return 0;
}
function shiftTheme(type: string) {
    if (type === "nacht") {
        return {
            night: true,
            card: "bg-[var(--tinte)] text-[var(--auf-tinte)] border-[var(--tinte)]",
            bar: "bg-[var(--auf-tinte-akzent)]",
            track: "bg-[var(--auf-tinte-matt)]/25",
            sub: "text-[var(--auf-tinte-matt)]", accent: "text-[var(--auf-tinte-akzent)]",
            Icon: Moon, label: "Nachtschicht",
        };
    }
    if (type === "spaet") {
        return {
            night: false,
            card: "bg-[var(--warnung-flaeche)] text-[var(--tinte)] border-[var(--linie)]",
            bar: "bg-[var(--warnung)]",
            track: "bg-[var(--linie)]",
            sub: "text-[var(--tinte-matt)]", accent: "text-[var(--warnung)]",
            Icon: Sunset, label: "Spätschicht",
        };
    }
    return {
        night: false,
        card: "bg-[var(--papier-tief)] text-[var(--tinte)] border-[var(--linie)]",
        bar: "bg-[var(--akzent)]",
        track: "bg-[var(--linie)]",
        sub: "text-[var(--tinte-matt)]", accent: "text-[var(--akzent)]",
        Icon: Sun, label: "Frühschicht",
    };
}
function fmtElapsed(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function browserLocation(): Promise<{
    lat: number;
    lng: number;
    ok: boolean;
}> {
    return new Promise(resolve => {
        if (typeof navigator === "undefined" || !navigator.geolocation)
            return resolve({ lat: 0, lng: 0, ok: false });
        navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, ok: true }), () => resolve({ lat: 0, lng: 0, ok: false }), { timeout: 8000, enableHighAccuracy: true });
    });
}
interface Props {
    shifts: Shift[];
    allStationShifts: Shift[];
    today: string;
    totalHours: number;
    nightShifts: number;
    byDate: Record<string, Shift[]>;
    stationByDate: Record<string, Shift[]>;
    assignmentsByShift: Record<string, string[]>;
    entriesByDate?: Record<string, TimeEntry[]>;
    springerByDate?: Record<string, string | null>;
    userName: string;
    canExportStation?: boolean;
    swapMode?: "manual" | "automatic" | "leitung_only";
    monat?: string;
    monatVersatz?: number;
}
function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDur(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0)
        return `${m}min`;
    if (m === 0)
        return `${h}h`;
    return `${h}h ${m}min`;
}
function toICSDate(date: string, time: string | null, fallbackHour: number): string {
    const t = time ?? `${String(fallbackHour).padStart(2, "0")}:00`;
    return `${date.replace(/-/g, "")}T${t.replace(":", "")}00`;
}
function downloadICS(shifts: Shift[]) {
    const SHIFT_START: Record<string, number> = { frueh: 6, spaet: 14, nacht: 22 };
    const SHIFT_END: Record<string, number> = { frueh: 14, spaet: 22, nacht: 6 };
    const events = shifts.map(s => {
        const label = s.shift_type === "frueh" ? "Frühschicht" : s.shift_type === "spaet" ? "Spätschicht" : "Nachtschicht";
        const dtstart = toICSDate(s.date, s.start_time, SHIFT_START[s.shift_type] ?? 6);
        const dtend = toICSDate(s.date, s.end_time, SHIFT_END[s.shift_type] ?? 14);
        return [
            "BEGIN:VEVENT",
            `UID:nurvo-shift-${s.id}@nurvo.de`,
            `SUMMARY:${label} — ${s.station}`,
            `DTSTART:${dtstart}`,
            `DTEND:${dtend}`,
            s.notes ? `DESCRIPTION:${s.notes}` : "",
            `LOCATION:${s.station}`,
            "END:VEVENT",
        ].filter(Boolean).join("\r\n");
    }).join("\r\n");
    const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Nurvo//Nurvo Schichtplan//DE",
        "CALSCALE:GREGORIAN",
        events,
        "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nurvo-schichtplan-${todayISO().slice(0, 7)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}
export default function MeinPlanContent({ shifts, allStationShifts, today, totalHours, nightShifts, byDate, stationByDate, assignmentsByShift, entriesByDate = {}, springerByDate = {}, userName, canExportStation = false, swapMode = "manual", monat = today.slice(0, 7), monatVersatz = 0, }: Props) {
    const { t, locale } = useLang();
    const [tab, setTab] = useState<"mine" | "station">("mine");
    const [selectedDate, setSelectedDate] = useState<string>(today.startsWith(monat) ? today : (shifts.map(s => s.date).sort()[0] ?? `${monat}-01`));
    const [active, setActive] = useState<ActiveEntry | null>(null);
    const [zfReady, setZfReady] = useState(false);
    const [busyShift, setBusyShift] = useState(false);
    const [confirmShift, setConfirmShift] = useState<Shift | null>(null);
    const [zfError, setZfError] = useState("");
    const [facilityGeo, setFacilityGeo] = useState<{
        lat: number | null;
        lng: number | null;
        radius: number;
    } | null>(null);
    const [, setNowTick] = useState(0);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [endWarn, setEndWarn] = useState<{
        requiredMin: number;
        takenMin: number;
        shortfall: number;
    } | null>(null);
    const [swapReceived, setSwapReceived] = useState<Set<string>>(new Set());
    const [swapGivenAway, setSwapGivenAway] = useState<{
        id: string;
        date: string;
        type: string;
        partner: string;
    }[]>([]);
    const [swapIncoming, setSwapIncoming] = useState<SwapRow[]>([]);
    const [abgabeModal, setAbgabeModal] = useState<Shift | null>(null);
    const [abgabeStand, setAbgabeStand] = useState(0);
    const [swapModal, setSwapModal] = useState<Shift | null>(null);
    const [swapOptions, setSwapOptions] = useState<SwapPartnerOption[] | null>(null);
    const [swapTarget, setSwapTarget] = useState<SwapPartnerOption | null>(null);
    const [swapReason, setSwapReason] = useState("");
    const [swapBusy, setSwapBusy] = useState(false);
    const [swapError, setSwapError] = useState("");
    const [swapDone, setSwapDone] = useState("");
    const [swapDiag, setSwapDiag] = useState<SwapDiag | null>(null);
    const [sickEnabled, setSickEnabled] = useState(true);
    const [selbst, setSelbst] = useState<{
        urlaub: boolean;
        wuensche: boolean;
        tausch: boolean;
        abgabe: boolean;
    }>({ urlaub: true, wuensche: true, tausch: true, abgabe: true });
    type ActionKind = "krank" | "urlaub" | "wunsch";
    const [actionModal, setActionModal] = useState<ActionKind | null>(null);
    const [actBusy, setActBusy] = useState(false);
    const [actError, setActError] = useState("");
    const [actDone, setActDone] = useState("");
    const [krankNote, setKrankNote] = useState("");
    const [urlaubTo, setUrlaubTo] = useState("");
    const [urlaubReason, setUrlaubReason] = useState("");
    const [wunschType, setWunschType] = useState<"preference" | "avoid" | "unavailable">("preference");
    const [wunschShift, setWunschShift] = useState("all");
    const [wunschMsg, setWunschMsg] = useState("");
    function openAction(kind: ActionKind) {
        setActError("");
        setActDone("");
        setKrankNote("");
        setUrlaubTo(selectedDate);
        setUrlaubReason("");
        setWunschType("preference");
        setWunschShift("all");
        setWunschMsg("");
        setActionModal(kind);
    }
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("aktion") !== "krank")
            return;
        window.history.replaceState(null, "", "/mein-plan");
        if (!(byDate[today]?.length))
            return;
        Promise.resolve().then(() => {
            setActError("");
            setActDone("");
            setKrankNote("");
            setActionModal("krank");
        });
    }, [byDate, today]);
    const holenActive = useCallback(async (): Promise<{
        active?: unknown;
        myEntry?: unknown;
    } | null> => {
        try {
            const res = await fetch("/api/zeiterfassung");
            return await res.json();
        }
        catch { }
        return null;
    }, []);
    const uebernehmenActive = useCallback((d: {
        active?: unknown;
        myEntry?: unknown;
    } | null) => {
        if (d) {
            const e = (d.active && !Array.isArray(d.active) ? d.active : d.myEntry) ?? null;
            setActive(e as ActiveEntry | null);
        }
        setZfReady(true);
    }, []);
    const loadActive = useCallback(async () => {
        uebernehmenActive(await holenActive());
    }, [holenActive, uebernehmenActive]);
    useEffect(() => {
        let aktiv = true;
        holenActive().then(d => { if (aktiv)
            uebernehmenActive(d); });
        return () => { aktiv = false; };
    }, [holenActive, uebernehmenActive]);
    useEffect(() => {
        fetch("/api/leitung/facility-settings")
            .then(r => r.json())
            .then(d => {
            if (d.settings) {
                setFacilityGeo({ lat: d.settings.geo_lat, lng: d.settings.geo_lng, radius: d.settings.check_in_radius_m ?? 300 });
            }
        })
            .catch(() => { });
        fetch("/api/mitarbeiter/selbstbedienung")
            .then(r => r.json())
            .then(d => { if (d?.erlaubt)
            setSelbst({ urlaub: d.erlaubt.urlaub !== false, wuensche: d.erlaubt.wuensche !== false, tausch: d.erlaubt.tausch !== false, abgabe: d.erlaubt.abgabe !== false }); })
            .catch(() => { });
        fetch("/api/mitarbeiter/krank")
            .then(r => r.json())
            .then(d => { if (typeof d.selfReportingEnabled === "boolean")
            setSickEnabled(d.selfReportingEnabled); })
            .catch(() => { });
    }, []);
    const [swapPendingOut, setSwapPendingOut] = useState<Set<string>>(new Set());
    const loadSwaps = useCallback(() => {
        fetch("/api/mitarbeiter/shift-swap-requests")
            .then(r => r.json())
            .then((d: {
            outgoing?: SwapRow[];
            incoming?: SwapRow[];
        }) => {
            const received = new Set<string>();
            const given: {
                id: string;
                date: string;
                type: string;
                partner: string;
            }[] = [];
            const incomingPending: SwapRow[] = [];
            const pendingOut = new Set<string>();
            for (const s of d.outgoing ?? []) {
                if (s.status === "pending_leitung" || s.status === "pending_colleague") {
                    pendingOut.add(s.requester_shift_id);
                    continue;
                }
                if (s.status !== "approved")
                    continue;
                received.add(s.target_shift_id);
                given.push({ id: s.requester_shift_id, date: s.requester_shift_date, type: s.requester_shift_type, partner: s.target_staff_name });
            }
            for (const s of d.incoming ?? []) {
                if (s.status === "pending_colleague") {
                    incomingPending.push(s);
                    continue;
                }
                if (s.status !== "approved")
                    continue;
                received.add(s.requester_shift_id);
                given.push({ id: s.target_shift_id, date: s.target_shift_date, type: s.target_shift_type, partner: s.requester_staff_name });
            }
            setSwapReceived(received);
            setSwapGivenAway(given);
            setSwapIncoming(incomingPending);
            setSwapPendingOut(pendingOut);
        })
            .catch(() => { });
    }, []);
    useEffect(() => { loadSwaps(); }, [loadSwaps]);
    function currentBreakStatus() {
        if (!active || active.check_out)
            return null;
        const todayShifts = byDate[today] ?? [];
        const shift = todayShifts.find(s => s.station === active.station) ?? todayShifts[0] ?? null;
        const scheduledMin = shift ? shiftScheduledMinutes(shift) : 480;
        const requiredMin = requiredBreakMinutes(scheduledMin);
        const pauseSec = (active.total_pause_minutes ?? 0) * 60;
        const ongoingPauseSec = active.paused_at ? Math.max(0, Math.floor((Date.now() - new Date(active.paused_at).getTime()) / 1000)) : 0;
        const takenMin = Math.floor((pauseSec + ongoingPauseSec) / 60);
        return { requiredMin, takenMin, shortfall: Math.max(0, requiredMin - takenMin) };
    }
    useEffect(() => {
        if (active && !active.check_out) {
            tickRef.current = setInterval(() => setNowTick(v => v + 1), 1000);
            return () => { if (tickRef.current)
                clearInterval(tickRef.current); };
        }
    }, [active]);
    async function verifiedLocation(): Promise<{
        lat: number | null;
        lng: number | null;
        verified: boolean;
    }> {
        const loc = await browserLocation();
        if (!loc.ok)
            return { lat: null, lng: null, verified: false };
        const verified = !facilityGeo?.lat || !facilityGeo?.lng
            ? true
            : haversineM(loc.lat, loc.lng, facilityGeo.lat, facilityGeo.lng) <= (facilityGeo.radius ?? 300);
        return { lat: loc.lat, lng: loc.lng, verified };
    }
    async function startShift(shift: Shift) {
        setBusyShift(true);
        setZfError("");
        try {
            const { lat, lng, verified } = await verifiedLocation();
            const res = await fetch("/api/zeiterfassung", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station: shift.station || null, latitude: lat, longitude: lng, location_verified: verified }),
            });
            const d = await res.json();
            if (!res.ok) {
                setZfError(d.error ?? "Schicht konnte nicht gestartet werden.");
                return;
            }
            setActive(d.entry);
            setConfirmShift(null);
        }
        catch {
            setZfError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setBusyShift(false);
        }
    }
    async function endShift(force = false) {
        if (!active)
            return;
        if (!force) {
            const bs = currentBreakStatus();
            if (bs && bs.shortfall > 0) {
                setEndWarn(bs);
                return;
            }
        }
        setEndWarn(null);
        setBusyShift(true);
        setZfError("");
        try {
            const { lat, lng, verified } = await verifiedLocation();
            const res = await fetch("/api/zeiterfassung", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: active.id, latitude: lat, longitude: lng, location_verified: verified }),
            });
            const d = await res.json();
            if (!res.ok) {
                setZfError(d.error ?? "Schicht konnte nicht beendet werden.");
                return;
            }
            setActive(null);
        }
        catch {
            setZfError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setBusyShift(false);
        }
    }
    async function togglePause(action: "pause" | "resume") {
        if (!active)
            return;
        setBusyShift(true);
        setZfError("");
        try {
            const res = await fetch("/api/zeiterfassung", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: active.id, pause_action: action }),
            });
            const d = await res.json();
            if (res.ok)
                setActive(d.entry);
            else
                setZfError(d.error ?? "Aktion fehlgeschlagen.");
        }
        catch {
            setZfError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setBusyShift(false);
        }
    }
    async function submitAction() {
        setActBusy(true);
        setActError("");
        setActDone("");
        try {
            const dayShifts = byDate[selectedDate] ?? [];
            const shift = dayShifts[0];
            let res: Response;
            if (actionModal === "krank") {
                res = await fetch("/api/mitarbeiter/krank", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sickDate: selectedDate, shiftType: shift?.shift_type ?? null, station: shift?.station ?? null, note: krankNote || null }),
                });
            }
            else if (actionModal === "urlaub") {
                if (selectedDate < today) {
                    setActError("Urlaub kann nicht rückwirkend beantragt werden.");
                    return;
                }
                const to = urlaubTo && urlaubTo >= selectedDate ? urlaubTo : selectedDate;
                const days = daysInclusive(selectedDate, to);
                res = await fetch("/api/mitarbeiter/vacation-requests", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from_date: selectedDate, to_date: to, days, reason: urlaubReason || null }),
                });
            }
            else {
                if (!wunschMsg.trim()) {
                    setActError("Bitte eine kurze Nachricht angeben.");
                    setActBusy(false);
                    return;
                }
                res = await fetch("/api/mitarbeiter/wishes", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date_from: selectedDate, date_to: selectedDate, shift_type: wunschShift, wish_type: wunschType, message: wunschMsg.trim() }),
                });
            }
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setActError(d.error ?? "Konnte nicht gesendet werden.");
                return;
            }
            setActDone(actionModal === "krank" ? "Krankmeldung gesendet." : actionModal === "urlaub" ? "Urlaubsantrag eingereicht." : "Wunsch übermittelt.");
            if (actionModal === "krank")
                loadActive();
            setTimeout(() => setActionModal(null), 1200);
        }
        catch {
            setActError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setActBusy(false);
        }
    }
    async function openSwap(shift: Shift) {
        setSwapModal(shift);
        setSwapOptions(null);
        setSwapTarget(null);
        setSwapReason("");
        setSwapError("");
        setSwapDone("");
        setSwapDiag(null);
        try {
            const res = await fetch(`/api/mitarbeiter/shift-swap-eligible?shift_id=${encodeURIComponent(shift.id)}`);
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSwapOptions([]);
                setSwapError(d.error ?? "Tauschpartner konnten nicht geladen werden.");
                return;
            }
            setSwapOptions((d.options as SwapPartnerOption[]) ?? []);
            setSwapDiag((d._diag as SwapDiag) ?? null);
        }
        catch {
            setSwapOptions([]);
            setSwapError("Keine Verbindung — bitte erneut versuchen.");
        }
    }
    async function submitSwap() {
        if (!swapModal || !swapTarget) {
            setSwapError("Bitte eine Tausch-Schicht wählen.");
            return;
        }
        if (!swapReason.trim()) {
            setSwapError("Bitte einen Grund angeben.");
            return;
        }
        setSwapBusy(true);
        setSwapError("");
        setSwapDone("");
        try {
            const res = await fetch("/api/mitarbeiter/shift-swap-requests", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requester_shift_id: swapModal.id, target_shift_id: swapTarget.shiftId, target_staff_id: swapTarget.staffId, reason: swapReason.trim() }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSwapError(d.error ?? "Anfrage konnte nicht gesendet werden.");
                return;
            }
            setSwapDone("Tausch-Anfrage gesendet.");
            loadSwaps();
            setTimeout(() => setSwapModal(null), 1300);
        }
        catch {
            setSwapError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setSwapBusy(false);
        }
    }
    const router = useRouter();
    async function respondSwap(id: string, response: "accept" | "decline") {
        setSwapBusy(true);
        setSwapError("");
        let accepted = false;
        try {
            const res = await fetch("/api/mitarbeiter/shift-swap-requests", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, response }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok)
                setSwapError(d.error ?? "Aktion fehlgeschlagen.");
            else if (response === "accept")
                accepted = true;
        }
        catch {
            setSwapError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setSwapBusy(false);
            loadSwaps();
            if (accepted)
                router.refresh();
        }
    }
    const monthShort = monat;
    const monthLabel = new Date(`${monat}-15T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
    const monatLink = (v: number) => {
        const [j, m] = today.slice(0, 7).split("-").map(Number);
        const d = new Date(Date.UTC(j, m - 1 + v, 1));
        return v === 0 ? "/mein-plan?monat=" + today.slice(0, 7) : `/mein-plan?monat=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const createdNote = `Erstellt am ${new Date().toLocaleDateString("de-DE")} · Nurvo`;
    function buildOwnDoc(): PlanExportDoc {
        const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date));
        return {
            title: `Dienstplan — ${userName || "Mein Plan"}`,
            subtitle: monthLabel,
            columns: [
                { key: "date", label: "Datum", weight: 1.1 },
                { key: "type", label: "Schicht", weight: 1 },
                { key: "time", label: "Zeit", weight: 1.2 },
                { key: "station", label: "Station", weight: 1.3 },
                { key: "notes", label: "Notiz", weight: 1.8 },
            ],
            rows: sorted.map(s => ({
                date: fmtPlanDate(s.date),
                type: SHIFT_LABEL_DE[s.shift_type] ?? s.shift_type,
                time: shiftTimeRange(s),
                station: s.station,
                notes: s.notes ?? "",
            })),
            footerNote: createdNote,
        };
    }
    function buildStationDoc(): PlanExportDoc {
        const sorted = [...allStationShifts].sort((a, b) => a.date.localeCompare(b.date));
        const station = sorted[0]?.station ?? "Station";
        return {
            title: `Stationsplan — ${station}`,
            subtitle: monthLabel,
            columns: [
                { key: "date", label: "Datum", weight: 1.1 },
                { key: "type", label: "Schicht", weight: 1 },
                { key: "time", label: "Zeit", weight: 1.2 },
                { key: "staff", label: "Besetzung", weight: 3 },
            ],
            rows: sorted.map(s => ({
                date: fmtPlanDate(s.date),
                type: SHIFT_LABEL_DE[s.shift_type] ?? s.shift_type,
                time: shiftTimeRange(s),
                staff: (assignmentsByShift[s.id] ?? []).join(", ") || "—",
            })),
            footerNote: createdNote,
        };
    }
    const shiftLabel = (type: string) => {
        const map: Record<string, string> = {
            frueh: t("mp.shift.early"),
            spaet: t("mp.shift.late"),
            nacht: t("mp.shift.night"),
        };
        return map[type] ?? type;
    };
    const fmtSwapDate = (date: string) => new Date(date + "T12:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
    const monthAnchor = new Date(`${monat}-15T12:00:00`);
    const calYear = monthAnchor.getFullYear();
    const calMonth = monthAnchor.getMonth();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const startOffset = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
    const calCells: (string | null)[] = [];
    for (let i = 0; i < startOffset; i++)
        calCells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        calCells.push(`${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (calCells.length % 7 !== 0)
        calCells.push(null);
    const weekdayNames = Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(2024, 0, 1 + i);
        return dd.toLocaleDateString(locale, { weekday: "short" });
    });
    return (<div>
      <Header title={t("mp.title")} subtitle={`${t("mp.subtitleMonth")} ${monthLabel}`}/>
      <div className="p-4 sm:p-8 space-y-6">

        
        <nav aria-label="Monat wählen" className="flex items-center justify-between gap-2">
          {monatVersatz > -12 ? (<Link href={monatLink(monatVersatz - 1)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] font-medium text-[var(--tinte)] hover:border-[var(--akzent)]">
              <ChevronLeft size={15}/> {t("mp.monatZurueck")}
            </Link>) : <span />}
          <span className="text-[15px] font-semibold text-[var(--tinte)] capitalize">{monthLabel}</span>
          {monatVersatz < 12 ? (<Link href={monatLink(monatVersatz + 1)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] font-medium text-[var(--tinte)] hover:border-[var(--akzent)]">
              {t("mp.monatVor")} <ChevronRight size={15}/>
            </Link>) : <span />}
        </nav>

        
        <KalenderVerbinden />

        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays size={18} className="text-[var(--akzent)]"/>
              <span className="text-[var(--tinte-leise)] text-sm font-medium">{t("mp.shifts")}</span>
            </div>
            <p className="text-3xl font-semibold text-[var(--tinte)]">{shifts.length > 0 ? shifts.length : "—"}</p>
            <p className="text-[var(--tinte-leise)] text-xs mt-1">{monatVersatz === 0 ? t("mp.thisMonth") : monthLabel}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Moon size={18} className="text-[var(--akzent)]"/>
              <span className="text-[var(--tinte-leise)] text-sm font-medium">{t("mp.night")}</span>
            </div>
            <p className="text-3xl font-semibold text-[var(--tinte)]">{shifts.length > 0 ? nightShifts : "—"}</p>
            <p className="text-[var(--tinte-leise)] text-xs mt-1">{t("mp.maxNight")}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-[var(--akzent)]"/>
              <span className="text-[var(--tinte-leise)] text-sm font-medium">{t("mp.hoursPlanned")}</span>
            </div>
            <p className="text-3xl font-semibold text-[var(--tinte)]">
              {shifts.length > 0 ? `${Math.round(totalHours)}h` : "—"}
            </p>
            <p className="text-[var(--tinte-leise)] text-xs mt-1">{t("mp.fullTime")}</p>
          </div>
        </div>

        
        <SchichtabgabeAnfragen key={abgabeStand} onAenderung={() => { setAbgabeStand(n => n + 1); router.refresh(); }}/>

        
        {swapIncoming.length > 0 && (<div className="space-y-2">
            {swapIncoming.map(s => (<div key={s.id} className="card border-[var(--linie)] bg-[var(--papier-tief)]/60 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--papier-tief)] flex items-center justify-center flex-shrink-0">
                  <Repeat size={18} className="text-[var(--tinte-matt)]"/>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">Schichttausch-Anfrage von {s.requester_staff_name}</p>
                  <p className="text-[12px] text-[var(--tinte-matt)]">
                    Deine {shiftLabel(s.target_shift_type)} am {fmtSwapDate(s.target_shift_date)} ↔ {shiftLabel(s.requester_shift_type)} am {fmtSwapDate(s.requester_shift_date)}
                    {s.reason ? <span className="text-[var(--tinte-leise)]">{` · „${s.reason}“`}</span> : null}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => respondSwap(s.id, "decline")} disabled={swapBusy} className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                    Ablehnen
                  </button>
                  <button onClick={() => respondSwap(s.id, "accept")} disabled={swapBusy} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition disabled:opacity-60 inline-flex items-center gap-1.5">
                    <Repeat size={13}/> Tauschen
                  </button>
                </div>
              </div>))}
          </div>)}

        
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 p-1 bg-[var(--papier-tief)] rounded-xl">
            <button onClick={() => setTab("mine")} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === "mine" ? "bg-[var(--papier)]  text-[var(--tinte)]" : "text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"}`}>
              <span className="flex items-center gap-1.5"><CalendarDays size={14}/> Meine Schichten</span>
            </button>
            <button onClick={() => setTab("station")} className={`px-4 py-2 text-sm font-medium rounded-lg transition ${tab === "station" ? "bg-[var(--papier)]  text-[var(--tinte)]" : "text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"}`}>
              <span className="flex items-center gap-1.5"><Users size={14}/> Stationsplan</span>
            </button>
          </div>

          {tab === "mine" && shifts.length > 0 && (<div className="flex items-center gap-2">
              <PlanExportMenu targets={[{ id: "own", label: "Mein Plan", baseName: `nurvo-mein-plan-${monthShort}`, build: buildOwnDoc }]}/>
              <button onClick={() => downloadICS(shifts)} className="flex items-center gap-1.5 text-sm font-medium text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-3 py-2 rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                <Download size={14}/> Als .ics exportieren
              </button>
              <a href="https://calendar.google.com/calendar/r" target="_blank" rel="noopener noreferrer" onClick={() => downloadICS(shifts)} className="flex items-center gap-1.5 text-sm font-medium text-[var(--akzent)] hover:text-[var(--akzent)] px-3 py-2 rounded-lg border border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                <Calendar size={14}/> Google Kalender
              </a>
            </div>)}

          {tab === "station" && canExportStation && allStationShifts.length > 0 && (<PlanExportMenu targets={[{ id: "station", label: "Stationsplan", baseName: `nurvo-stationsplan-${monthShort}`, build: buildStationDoc }]} buttonLabel="Stationsplan drucken"/>)}
        </div>

        
        {tab === "mine" && (shifts.length === 0 && Object.keys(springerByDate).length === 0 ? (<div className="card py-16 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--papier-tief)] flex items-center justify-center">
                <WifiOff size={28} className="text-[var(--tinte-leise)]"/>
              </div>
              <div>
                <h2 className="font-semibold text-[var(--tinte)] text-lg">{t("mp.noShifts")}</h2>
                <p className="text-[var(--tinte-leise)] text-sm mt-1 max-w-sm">{t("mp.noShiftsHint")}</p>
              </div>
              <div className="rounded-xl p-5 mt-2 max-w-md text-left w-full bg-[var(--akzent-flaeche)] border border-[var(--linie)]">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={16} className="text-[var(--akzent)]"/>
                  <span className="text-[var(--akzent)] font-semibold text-sm">{t("mp.upcomingFeatures")}</span>
                </div>
                <ul className="space-y-2 text-sm text-[var(--tinte-matt)]">
                  {([
                ["bg-[var(--tinte-leise)]", "mp.feat1"],
                ["bg-[var(--akzent)]", "mp.feat2"],
                ["bg-[var(--ki)]", "mp.feat3"],
            ] as const).map(([color, key]) => (<li key={key} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${color} flex-shrink-0`}/>
                      {t(key)}
                    </li>))}
                </ul>
              </div>
            </div>) : (<div className="space-y-4">
              
              <div className="card p-3 sm:p-5 overflow-x-auto">
                
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 min-w-[308px]">
                  {weekdayNames.map((w, i) => (<div key={i} className="text-center text-[11px] font-semibold text-[var(--tinte-leise)] uppercase tracking-wide py-1">
                      {w}
                    </div>))}
                </div>
                
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 min-w-[308px]">
                  {calCells.map((date, i) => {
                if (!date)
                    return <div key={`pad-${i}`} className="min-h-[78px] rounded-lg"/>;
                const dayShifts = byDate[date] ?? [];
                const hasEntries = (entriesByDate[date] ?? []).length > 0;
                const isToday = date === today;
                const isPast = date < today;
                const isSelected = date === selectedDate;
                const dayNum = Number(date.slice(8, 10));
                return (<button key={date} onClick={() => setSelectedDate(date)} className={`min-h-[78px] text-left rounded-lg border p-1.5 flex flex-col gap-1 transition-colors ${isSelected
                        ? "border-[var(--akzent)] ring-1 ring-[var(--akzent)] bg-[var(--akzent-flaeche)]"
                        : "border-[var(--linie)] hover:border-[var(--linie)] hover:bg-[var(--papier-tief)]"} ${isPast && !isSelected ? "opacity-55" : ""}`}>
                        <span className="flex items-center justify-between">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? "bg-[var(--akzent)] text-white" : "text-[var(--tinte-matt)]"}`}>
                            {dayNum}
                          </span>
                          {hasEntries && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" title="Zeiterfassung"/>}
                        </span>
                        <span className="flex flex-col gap-0.5 overflow-hidden">
                          {dayShifts.slice(0, 2).map(s => (<span key={s.id} title={swapReceived.has(s.id) ? "Getauscht — du hast diese Schicht übernommen" : shiftLabel(s.shift_type)} className={`relative flex items-center gap-0.5 text-[10px] leading-tight font-medium px-1.5 py-0.5 rounded ${swapReceived.has(s.id)
                            ? "bg-[var(--ok-flaeche)] text-[var(--ok)] border border-[var(--linie)]"
                            : SHIFT_COLORS[s.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
                              {swapReceived.has(s.id) && <Repeat size={9} className="flex-shrink-0"/>}
                              
                              <span aria-hidden="true" className="sm:hidden">{shiftLabel(s.shift_type).charAt(0)}</span>
                              <span className="sr-only sm:not-sr-only sm:truncate">{shiftLabel(s.shift_type)}</span>
                            </span>))}
                          {dayShifts.length > 2 && (<span className="text-[10px] text-[var(--tinte-leise)] pl-1">+{dayShifts.length - 2}</span>)}
                          {date in springerByDate && (<span className="relative block truncate text-center sm:text-left text-[10px] leading-tight font-medium px-1.5 py-0.5 rounded bg-[var(--akzent-flaeche)] text-[var(--akzent)]" title="Bereitschaft / Springer">
                              <span aria-hidden="true" className="material-symbols-outlined align-[-2px] sm:mr-0.5" style={{ fontSize: 11 }}>notifications_active</span><span className="sr-only sm:not-sr-only">{t("mp.springer")}</span>
                            </span>)}
                        </span>
                      </button>);
            })}
                </div>
              </div>

              
              {(() => {
                const dayShifts = byDate[selectedDate] ?? [];
                const dayEntries = entriesByDate[selectedDate] ?? [];
                const d = new Date(selectedDate + "T12:00:00");
                const dateLabel = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
                const isToday = selectedDate === today;
                const activeShift = active && isToday ? (dayShifts.find(s => s.station === active.station) ?? dayShifts[0] ?? null) : null;
                const runningHere = !!active && !active.check_out && isToday;
                return (<div className="card">
                    <div className="flex items-center gap-3 mb-3 pb-2 border-b border-[var(--linie)]">
                      <p className={`text-sm font-semibold ${isToday ? "text-[var(--akzent)]" : "text-[var(--tinte-matt)]"}`}>
                        {isToday ? `Heute — ${dateLabel}` : dateLabel}
                      </p>
                      {isToday && (<span className="text-xs bg-[var(--akzent-flaeche)] text-[var(--akzent)] px-2 py-0.5 rounded-full font-medium">
                          Heute
                        </span>)}
                    </div>

                    
                    {selectedDate in springerByDate && (<div className="flex items-start gap-2 mb-3 rounded-xl border border-[var(--linie)] bg-[var(--akzent-flaeche)] px-3 py-2.5 text-sm text-[var(--akzent)]">
                        <span className="material-symbols-outlined leading-none mt-0.5" style={{ fontSize: 18 }}>notifications_active</span>
                        <span>
                          <span className="font-semibold">{t("mp.onCall")}</span>
                          {springerByDate[selectedDate] ? ` — ${shiftLabel(springerByDate[selectedDate]!)}` : ""}
                          <span className="block text-[var(--akzent)]/80 text-[13px]">{t("mp.onCallHint")}</span>
                        </span>
                      </div>)}

                    
                    {runningHere && (() => {
                        const theme = shiftTheme(activeShift?.shift_type ?? "frueh");
                        const scheduledMin = activeShift ? shiftScheduledMinutes(activeShift) : 480;
                        const grossSec = Math.max(0, Math.floor((Date.now() - new Date(active!.check_in).getTime()) / 1000));
                        const pauseSec = (active!.total_pause_minutes ?? 0) * 60;
                        const ongoingPauseSec = active!.paused_at ? Math.max(0, Math.floor((Date.now() - new Date(active!.paused_at).getTime()) / 1000)) : 0;
                        const isPaused = !!active!.paused_at;
                        const elapsedSec = Math.max(0, grossSec - pauseSec - ongoingPauseSec);
                        const pct = Math.max(0, Math.min(100, (elapsedSec / (scheduledMin * 60)) * 100));
                        const schedH = Math.floor(scheduledMin / 60), schedM = scheduledMin % 60;
                        const Icon = theme.Icon;
                        return (<div className={`relative overflow-hidden rounded-2xl border p-5 mb-3 ${theme.card}`}>
                          {theme.night && (<>
                              <span className="absolute top-3 right-6 w-1 h-1 rounded-full bg-white/70"/>
                              <span className="absolute top-6 right-12 w-0.5 h-0.5 rounded-full bg-white/50"/>
                              <span className="absolute top-9 right-4 w-1 h-1 rounded-full bg-white/40"/>
                            </>)}
                          <div className="flex items-center gap-2 mb-3">
                            <Icon size={18} className={theme.accent}/>
                            <span className="text-sm font-semibold">{theme.label} läuft</span>
                            <span className={`ml-auto inline-flex items-center gap-1 text-[11px] ${theme.sub}`}>
                              <Clock size={12}/> seit {fmtTime(active!.check_in)}
                            </span>
                          </div>
                          <div className="flex items-end gap-2 mb-3">
                            <span className="text-4xl font-semibold tabular-nums tracking-tight">{fmtElapsed(elapsedSec)}</span>
                            <span className={`text-sm mb-1 ${theme.sub}`}>von {schedH}h{schedM ? ` ${schedM}min` : ""} geplant</span>
                          </div>
                          <div className={`h-2.5 rounded-full overflow-hidden ${theme.track} mb-1`}>
                            <div className={`h-full rounded-full transition-[width] duration-[240ms] ${theme.bar}`} style={{ width: `${pct}%` }}/>
                          </div>
                          <div className={`flex items-center justify-between text-[11px] ${theme.sub} mb-3`}>
                            <span className="tabular-nums inline-flex items-center gap-1.5">
                              {Math.round(pct)}%
                              {isPaused && <span className="inline-flex items-center gap-1 font-semibold"><Pause size={11}/> Pause läuft</span>}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11}/> {active!.station ?? "Station"}
                            </span>
                          </div>
                          
                          {(() => {
                                const requiredBreakMin = requiredBreakMinutes(scheduledMin);
                                const takenBreakMin = Math.floor((pauseSec + ongoingPauseSec) / 60);
                                const box = theme.night ? "bg-white/10" : "bg-white/60";
                                if (requiredBreakMin === 0) {
                                    return (<div className={`rounded-xl px-3 py-2 mb-4 flex items-center gap-2 text-[11px] ${box} ${theme.sub}`}>
                                  <Coffee size={13} className={theme.accent}/>
                                  <span>Pause optional — bei bis zu 6 h keine gesetzliche Pflicht.</span>
                                  {takenBreakMin > 0 && <span className="ml-auto tabular-nums font-semibold">{takenBreakMin} min genommen</span>}
                                </div>);
                                }
                                const breakDone = takenBreakMin >= requiredBreakMin;
                                const breakPct = Math.max(0, Math.min(100, (takenBreakMin / requiredBreakMin) * 100));
                                return (<div className={`rounded-xl px-3 py-2.5 mb-4 ${box}`}>
                                <div className="flex items-center justify-between text-[11px] mb-1.5">
                                  <span className={`inline-flex items-center gap-1.5 font-semibold ${theme.accent}`}>
                                    <Coffee size={12}/> Pause · gesetzl. Mindestpause
                                  </span>
                                  <span className={`tabular-nums inline-flex items-center gap-1 ${theme.sub}`}>
                                    {takenBreakMin} / {requiredBreakMin} min
                                    {breakDone && <span className="inline-flex items-center gap-0.5 text-[var(--ok)] font-semibold"><CheckCircle size={11}/> erfüllt</span>}
                                  </span>
                                </div>
                                <div className={`h-1.5 rounded-full overflow-hidden ${theme.track}`}>
                                  <div className={`h-full rounded-full transition-[width] duration-[240ms] ${breakDone ? "bg-[var(--ok)]" : theme.bar}`} style={{ width: `${breakPct}%` }}/>
                                </div>
                                {!breakDone && (<p className={`text-[10px] mt-1.5 ${theme.sub}`}>
                                    Noch {requiredBreakMin - takenBreakMin} min Pause vorgeschrieben (ArbZG §4).
                                  </p>)}
                              </div>);
                            })()}
                          <div className="flex gap-2">
                            <button onClick={() => togglePause(isPaused ? "resume" : "pause")} disabled={busyShift} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[14px] active:scale-95 transition disabled:opacity-60 ${isPaused
                                ? "bg-[var(--akzent)] hover:bg-[var(--akzent)] text-white"
                                : theme.night ? "bg-white/15 hover:bg-white/25 text-white" : "bg-white/70 hover:bg-[var(--papier)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
                              {isPaused ? <><Play size={15}/> Weiter</> : <><Pause size={15}/> Pause</>}
                            </button>
                            <button onClick={() => endShift()} disabled={busyShift} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[14px] bg-[var(--gefahr)] hover:bg-[var(--gefahr)] text-white active:scale-95 transition disabled:opacity-60">
                              <Square size={15}/> {busyShift ? "…" : "Beenden"}
                            </button>
                          </div>
                          {endWarn && (<div className="mt-3 rounded-xl border border-[var(--warnung)] bg-[var(--warnung-flaeche)] p-3">
                              <p className="text-[12px] font-semibold text-[var(--warnung)] flex items-center gap-1.5 mb-1">
                                <Coffee size={13}/> Pause noch nicht erfüllt
                              </p>
                              <p className="text-[11px] text-[var(--warnung)] mb-2.5">
                                Gesetzlich sind {endWarn.requiredMin} min Pause vorgeschrieben — genommen erst {endWarn.takenMin} min. Es fehlen {endWarn.shortfall} min (ArbZG §4).
                              </p>
                              <div className="flex gap-2">
                                <button onClick={() => setEndWarn(null)} className="flex-1 py-2 rounded-lg font-semibold text-[13px] bg-[var(--papier)] border border-[var(--warnung)] text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)] active:scale-95 transition">
                                  Pause nachholen
                                </button>
                                <button onClick={() => endShift(true)} disabled={busyShift} className="flex-1 py-2 rounded-lg font-semibold text-[13px] bg-[var(--gefahr)] hover:bg-[var(--gefahr)] text-white active:scale-95 transition disabled:opacity-60">
                                  {busyShift ? "…" : "Trotzdem früher beenden"}
                                </button>
                              </div>
                            </div>)}
                        </div>);
                    })()}
                    {zfError && <p className="text-[12px] text-[var(--gefahr)] mb-2">{zfError}</p>}
                    {dayShifts.length === 0 ? (<p className="text-sm text-[var(--tinte-leise)] py-2">Keine Schicht an diesem Tag.</p>) : (<div className="space-y-2">
                        {dayShifts.map(shift => (<div key={shift.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 bg-[var(--papier-tief)] rounded-lg">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${SHIFT_COLORS[shift.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
                              {shiftLabel(shift.shift_type)}
                            </span>
                            {shift.start_time && shift.end_time ? (<span className="text-sm font-medium text-[var(--tinte)] tabular-nums">
                                {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
                              </span>) : (<span className="text-sm text-[var(--tinte-leise)]">{t("mp.noTime")}</span>)}
                            <span className="min-w-0 text-sm text-[var(--tinte-leise)]">{shift.station}</span>
                            
                            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center sm:justify-end gap-2">
                              {swapReceived.has(shift.id) && (<span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--ok-flaeche)] text-[var(--ok)] border border-[var(--linie)] inline-flex items-center gap-1 flex-shrink-0" title="Diese Schicht hast du per Tausch übernommen — du arbeitest sie.">
                                  <Repeat size={11}/> Getauscht
                                </span>)}
                              {shift.notes ? (<span className="text-xs text-[var(--tinte-leise)] truncate max-w-[160px]">{shift.notes}</span>) : null}
                              
                              {isToday && zfReady && !active && (<button onClick={() => setConfirmShift(shift)} className="flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent)] active:scale-95 transition flex-shrink-0">
                                  <Play size={13}/> Schicht starten
                                </button>)}
                              
                              
                              {selectedDate >= today && swapPendingOut.has(shift.id) && (<span className="inline-flex items-center gap-1 text-[11px] text-[var(--warnung)] flex-shrink-0" title="Für diese Schicht läuft bereits eine Tausch-Anfrage.">
                                  <Repeat size={11}/> Anfrage läuft
                                </span>)}
                              {selectedDate >= today && !swapReceived.has(shift.id) && !swapPendingOut.has(shift.id) && !(runningHere && activeShift?.id === shift.id) && (swapMode === "leitung_only" || (!selbst.tausch && !selbst.abgabe) ? (<span className="inline-flex items-center gap-1 text-[11px] text-[var(--tinte-leise)] flex-shrink-0">
                                    <Repeat size={11}/> Tausch über Leitung
                                  </span>) : (<>
                                    
                                    {selbst.abgabe && <button onClick={() => setAbgabeModal(shift)} className="flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] hover:bg-[var(--akzent-flaeche)] border border-[var(--linie)] active:scale-95 transition flex-shrink-0">
                                      <UserMinus size={13}/> Kann ich nicht
                                    </button>}
                                    {selbst.tausch && <button onClick={() => openSwap(shift)} className="flex items-center gap-1.5 min-h-11 px-4 rounded-lg text-[13px] font-semibold text-[var(--tinte-matt)] bg-[var(--papier-tief)] hover:bg-[var(--papier-tief)] border border-[var(--linie)] active:scale-95 transition flex-shrink-0">
                                      <Repeat size={13}/> Tauschen
                                    </button>}
                                  </>))}
                            </div>
                          </div>))}
                      </div>)}
                    {swapGivenAway.filter(g => g.date === selectedDate).map(g => (<div key={"given-" + g.id} className="flex items-center gap-3 px-3 py-2.5 bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg mt-2">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)] flex-shrink-0">
                          {shiftLabel(g.type)}
                        </span>
                        <span className="text-sm text-[var(--gefahr)] font-medium line-through">Abgegeben</span>
                        <span className="ml-auto text-[11px] text-[var(--gefahr)] font-medium inline-flex items-center gap-1 text-right">
                          <Repeat size={12}/> getauscht mit {g.partner} · du arbeitest nicht
                        </span>
                      </div>))}
                    {dayEntries.length > 0 && (<div className="mt-2 space-y-1">
                        {dayEntries.map(entry => (<div key={entry.id} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-lg">
                            <CheckCircle size={13} className="text-[var(--ok)] flex-shrink-0"/>
                            <span className="text-xs text-[var(--ok)] font-medium">
                              {fmtTime(entry.check_in)}
                              {entry.check_out ? ` – ${fmtTime(entry.check_out)}` : " (läuft)"}
                            </span>
                            {entry.duration_minutes != null && (<span className="text-xs text-[var(--ok)] ml-auto">{fmtDur(entry.duration_minutes)}</span>)}
                          </div>))}
                      </div>)}

                    
                    {selectedDate >= today && (<div className="mt-3 pt-3 border-t border-[var(--linie)] flex flex-wrap gap-2">
                        {sickEnabled && dayShifts.length > 0 && (<button onClick={() => openAction("krank")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] hover:bg-[var(--gefahr-flaeche)] border border-[var(--linie)] transition-colors">
                            <Thermometer size={13}/> Krank melden
                          </button>)}
                        {!sickEnabled && dayShifts.length > 0 && (<span className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[var(--tinte-matt)]">
                            <Thermometer size={13}/> Krank? Bitte die Leitung anrufen.
                          </span>)}
                        {selbst.urlaub && <button onClick={() => openAction("urlaub")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--akzent)] bg-[var(--akzent-flaeche)] hover:bg-[var(--akzent-flaeche)] border border-[var(--linie)] transition-colors">
                          <Plane size={13}/> Urlaub beantragen
                        </button>}
                        {selbst.wuensche && <button onClick={() => openAction("wunsch")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--tinte-matt)] bg-[var(--papier-tief)] hover:bg-[var(--papier-tief)] border border-[var(--linie)] transition-colors">
                          <Sparkles size={13}/> Wunsch / Verfügbarkeit
                        </button>}
                        {(!selbst.urlaub || !selbst.wuensche) && (<span className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[var(--tinte-matt)]">
                            {!selbst.urlaub && !selbst.wuensche ? "Urlaub und Wünsche bitte direkt mit der Praxisleitung absprechen."
                                : !selbst.urlaub ? "Urlaub bitte direkt bei der Praxisleitung beantragen." : "Wünsche bitte direkt mit der Praxisleitung absprechen."}
                          </span>)}
                      </div>)}
                  </div>);
            })()}
            </div>))}

        
        {tab === "station" && (allStationShifts.length === 0 ? (<div className="card py-12 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[var(--papier-tief)] flex items-center justify-center">
                <Users size={24} className="text-[var(--tinte-leise)]"/>
              </div>
              <div>
                <h2 className="font-semibold text-[var(--tinte)]">Kein Stationsplan</h2>
                <p className="text-[var(--tinte-leise)] text-sm mt-1">Die Pflegeleitung hat noch keinen Plan für diesen Monat erstellt.</p>
              </div>
            </div>) : (<div className="space-y-3">
              {Object.entries(stationByDate).map(([date, dayShifts]) => {
                const isToday = date === today;
                const isPast = date < today;
                const d = new Date(date + "T12:00:00");
                const dateLabel = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
                return (<div key={date} className={`card ${isPast ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-3 mb-3 pb-2 border-b border-[var(--linie)]">
                      <p className={`text-sm font-semibold ${isToday ? "text-[var(--akzent)]" : "text-[var(--tinte-matt)]"}`}>
                        {isToday ? `Heute — ${dateLabel}` : dateLabel}
                      </p>
                      {isToday && (<span className="text-xs bg-[var(--akzent-flaeche)] text-[var(--akzent)] px-2 py-0.5 rounded-full font-medium">Heute</span>)}
                    </div>
                    <div className="space-y-2">
                      {dayShifts.map(shift => {
                        const assigned = assignmentsByShift[shift.id] ?? [];
                        const isMyShift = assigned.includes(userName);
                        return (<div key={shift.id} className={`px-3 py-2.5 rounded-lg border transition-colors ${isMyShift ? "bg-[var(--akzent-flaeche)] border-[var(--akzent)]" : "bg-[var(--papier-tief)] border-transparent"}`}>
                            <div className="flex items-center gap-3 mb-1.5">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${SHIFT_COLORS[shift.shift_type] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>
                                {shiftLabel(shift.shift_type)}
                              </span>
                              {shift.start_time && shift.end_time ? (<span className="text-sm font-medium text-[var(--tinte)] tabular-nums">
                                  {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
                                </span>) : null}
                              {isMyShift && (<span className="text-xs bg-[var(--akzent-flaeche)] text-[var(--akzent)] px-2 py-0.5 rounded-full font-medium ml-auto">
                                  Du
                                </span>)}
                              {!isMyShift && assigned.length > 0 && (<span className="text-xs text-[var(--tinte-leise)] ml-auto tabular-nums">
                                  {assigned.length} Kollege{assigned.length !== 1 ? "n" : ""}
                                </span>)}
                            </div>
                            {assigned.length > 0 && (<div className="flex flex-wrap gap-1.5 mt-1">
                                {assigned.map(name => (<span key={name} className={`text-xs px-2 py-0.5 rounded-full ${name === userName
                                        ? "bg-[#5eead4] text-[var(--tinte)] font-semibold"
                                        : "bg-[var(--papier-tief)] text-[var(--tinte-matt)]"}`}>
                                    {name}
                                  </span>))}
                              </div>)}
                          </div>);
                    })}
                    </div>
                  </div>);
            })}
            </div>))}

      </div>

      
      <Modal open={!!confirmShift} onClose={() => { if (!busyShift)
        setConfirmShift(null); }} title="Schicht starten?" description={confirmShift ? `${shiftTheme(confirmShift.shift_type).label} · ${confirmShift.station}` : undefined} widthClass="max-w-sm" footer={confirmShift && (<>
            <button onClick={() => setConfirmShift(null)} disabled={busyShift} className="px-4 py-2.5 rounded-lg text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
              Abbrechen
            </button>
            <button onClick={() => startShift(confirmShift)} disabled={busyShift} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              <Play size={14}/> {busyShift ? "Startet…" : "Jetzt starten"}
            </button>
          </>)}>
        {confirmShift && (<>
            <p className="text-[var(--tinte-matt)] text-[13px]">
              {confirmShift.start_time && confirmShift.end_time
                ? <span className="tabular-nums">{`Geplant ${confirmShift.start_time.slice(0, 5)} – ${confirmShift.end_time.slice(0, 5)}. `}</span>
                : ""}
              Deine Zeiterfassung beginnt jetzt; dein Standort wird – falls erlaubt – geprüft.
            </p>
            {zfError && <p className="text-[13px] text-[var(--gefahr)] mt-2">{zfError}</p>}
          </>)}
      </Modal>

      
      {(() => {
            if (!actionModal)
                return null;
            const dLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
            const cfg = actionModal === "krank"
                ? { title: "Krank melden", btn: "bg-[var(--gefahr)] hover:bg-[var(--gefahr)]" }
                : actionModal === "urlaub"
                    ? { title: "Urlaub beantragen", btn: "bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]" }
                    : { title: "Wunsch / Verfügbarkeit", btn: "bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]" };
            return (<Modal open onClose={() => { if (!actBusy)
                setActionModal(null); }} title={cfg.title} description={dLabel} widthClass="max-w-sm" footer={<>
                <button onClick={() => setActionModal(null)} disabled={actBusy} className="px-4 py-2.5 rounded-lg text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                  Abbrechen
                </button>
                <button onClick={submitAction} disabled={actBusy || !!actDone} className={`px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold transition-colors disabled:opacity-60 ${cfg.btn}`}>
                  {actBusy ? "Sende…" : "Senden"}
                </button>
              </>}>
              {actionModal === "krank" && (<textarea aria-label="Notiz zur Krankmeldung" value={krankNote} onChange={e => setKrankNote(e.target.value)} rows={3} placeholder="Optionale Notiz (z.B. Arztbesuch)…" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)]/30 resize-none bg-[var(--papier-tief)]"/>)}

              {actionModal === "urlaub" && (<div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-[var(--tinte-leise)] w-12">Von</span>
                    <span className="font-medium text-[var(--tinte)] tabular-nums">{selectedDate}</span>
                    <span className="text-[var(--tinte-leise)] ml-2">bis</span>
                    <input type="date" aria-label="Urlaub bis" min={selectedDate} value={urlaubTo} onChange={e => setUrlaubTo(e.target.value)} className="px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                  </div>
                  <textarea aria-label="Grund für den Urlaub" value={urlaubReason} onChange={e => setUrlaubReason(e.target.value)} rows={2} placeholder="Optionaler Grund…" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 resize-none bg-[var(--papier-tief)]"/>
                </div>)}

              {actionModal === "wunsch" && (<div className="space-y-2.5">
                  <div className="flex gap-2">
                    <select aria-label="Art des Wunsches" value={wunschType} onChange={e => setWunschType(e.target.value as "preference" | "avoid" | "unavailable")} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none">
                      <option value="preference">Möchte arbeiten</option>
                      <option value="avoid">Möchte vermeiden</option>
                      <option value="unavailable">Nicht verfügbar</option>
                    </select>
                    <select aria-label="Schicht" value={wunschShift} onChange={e => setWunschShift(e.target.value)} className="flex-1 px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none">
                      <option value="all">Alle Schichten</option>
                      <option value="frueh">Frühschicht</option>
                      <option value="spaet">Spätschicht</option>
                      <option value="nacht">Nachtschicht</option>
                    </select>
                  </div>
                  <textarea aria-label="Nachricht an die Leitung" value={wunschMsg} onChange={e => setWunschMsg(e.target.value)} rows={2} placeholder="Kurze Nachricht an die Leitung…" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--linie)]/30 resize-none bg-[var(--papier-tief)]"/>
                </div>)}

              {actError && <p className="text-[13px] text-[var(--gefahr)] mt-2">{actError}</p>}
              {actDone && <p className="text-[13px] text-[var(--ok)] mt-2 flex items-center gap-1"><CheckCircle size={13}/> {actDone}</p>}

          </Modal>);
        })()}

      
      {abgabeModal && (<SchichtabgabeDialog schicht={{ id: abgabeModal.id, date: abgabeModal.date, shift_type: abgabeModal.shift_type, station: abgabeModal.station }} onClose={() => setAbgabeModal(null)} onFertig={() => { setAbgabeStand(n => n + 1); router.refresh(); }}/>)}

      {(() => {
            if (!swapModal)
                return null;
            const dLabel = new Date(swapModal.date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
            return (<Modal open onClose={() => { if (!swapBusy)
                setSwapModal(null); }} title="Schicht tauschen" description={`Deine ${shiftLabel(swapModal.shift_type)} am ${dLabel}`} widthClass="max-w-md" footer={<>
                <button onClick={() => setSwapModal(null)} disabled={swapBusy} className="px-4 py-2.5 rounded-lg text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                  Abbrechen
                </button>
                <button onClick={submitSwap} disabled={swapBusy || !!swapDone || swapOptions === null || swapOptions.length === 0 || !swapTarget} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  <Repeat size={14}/> {swapBusy ? "Sende…" : "Anfrage senden"}
                </button>
              </>}>
              {swapOptions === null ? (<p className="text-[13px] text-[var(--tinte-leise)] py-6 text-center">Suche mögliche Tauschpartner…</p>) : swapOptions.length === 0 ? (<div className="rounded-xl bg-[var(--papier-tief)] border border-[var(--linie)] p-4">
                  <p className="text-[13px] font-medium text-[var(--tinte)]">{swapBlockReason(swapDiag).headline}</p>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1 leading-relaxed">{swapBlockReason(swapDiag).detail}</p>
                  
                </div>) : (<>
                  <p className="text-[13px] font-medium text-[var(--tinte-leise)] mb-2">Tausch-Schicht wählen</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto mb-3">
                    {swapOptions.map(o => {
                        const sel = swapTarget?.shiftId === o.shiftId && swapTarget?.staffId === o.staffId;
                        return (<button key={`${o.shiftId}:${o.staffId}`} onClick={() => setSwapTarget(o)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors ${sel ? "border-[var(--akzent)] ring-1 ring-[var(--akzent)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                          <span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${SHIFT_COLORS[o.shiftType] ?? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border border-[var(--linie)]"}`}>{shiftLabel(o.shiftType)}</span>
                          <span className="text-[13px] text-[var(--tinte)] tabular-nums">{fmtSwapDate(o.shiftDate)}</span>
                          <span className="text-[13px] text-[var(--tinte-leise)] ml-auto truncate max-w-[45%]">{o.staffName}</span>
                          {sel && <CheckCircle size={15} className="text-[var(--tinte-matt)] flex-shrink-0"/>}
                        </button>);
                    })}
                  </div>
                  <textarea aria-label="Grund für den Tausch" value={swapReason} onChange={e => setSwapReason(e.target.value)} rows={2} placeholder="Grund für den Tausch (für Kollege & Leitung)…" className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--linie)]/30 resize-none bg-[var(--papier-tief)]"/>
                </>)}

              {swapError && <p className="text-[13px] text-[var(--gefahr)] mt-2">{swapError}</p>}
              {swapDone && <p className="text-[13px] text-[var(--ok)] mt-2 flex items-center gap-1"><CheckCircle size={13}/> {swapDone}</p>}

          </Modal>);
        })()}
    </div>);
}

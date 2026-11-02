"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import { useLang, type TKey } from "@/lib/LanguageContext";
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import SchichtBerichte from "@/components/SchichtBerichte";
import { todayISO } from "@/lib/date";
import Modal from "@/components/Modal";
const ERR_GENERIC = "Hat leider nicht geklappt. Bitte versuche es erneut.";
type LocStatus = "idle" | "checking" | "ok" | "denied";
type Entry = {
    id: string;
    user_id: string;
    user_name: string | null;
    facility: string;
    station: string | null;
    check_in: string;
    check_out: string | null;
    duration_minutes: number | null;
    location_verified: boolean;
    checkout_location_verified?: boolean;
    paused_at?: string | null;
    total_pause_minutes?: number;
    required_break_minutes?: number | null;
    break_compliant?: boolean | null;
    _offline?: boolean;
};
type OfflineAction = {
    type: "checkin";
    tempId: string;
    ts: string;
    station: string | null;
    lat: number | null;
    lng: number | null;
    loc: boolean;
    offlineToken?: string;
} | {
    type: "checkout";
    entryId: string;
    ts: string;
    lat: number | null;
    lng: number | null;
    loc: boolean;
};
function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDuration(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0)
        return `${m}min`;
    if (m === 0)
        return `${h}h`;
    return `${h}h ${m}min`;
}
function fmtDurationExact(checkIn: string, checkOut?: string | null): string {
    const endMs = checkOut ? new Date(checkOut).getTime() : Date.now();
    const totalSec = Math.max(0, Math.floor((endMs - new Date(checkIn).getTime()) / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const ss = s.toString().padStart(2, "0");
    if (h > 0)
        return `${h}h ${m.toString().padStart(2, "0")}min ${ss}s`;
    if (m > 0)
        return `${m}min ${ss}s`;
    return `${s}s`;
}
function netElapsedSec(entry: Entry, nowMs: number): number {
    const totalMs = Math.max(0, nowMs - new Date(entry.check_in).getTime());
    const pausedMs = (entry.total_pause_minutes ?? 0) * 60000;
    const currentPauseMs = entry.paused_at ? Math.max(0, nowMs - new Date(entry.paused_at).getTime()) : 0;
    return Math.max(0, Math.floor((totalMs - pausedMs - currentPauseMs) / 1000));
}
function fmtSec(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const ss = s.toString().padStart(2, "0");
    if (h > 0)
        return `${h}h ${m.toString().padStart(2, "0")}min ${ss}s`;
    if (m > 0)
        return `${m}min ${ss}s`;
    return `${s}s`;
}
function exportCSV(entries: Entry[], t: (k: TKey) => string) {
    const headers = [t("ui.date"), t("zt.checkInTime"), t("zt.checkOutTime"), t("zt.duration"), t("zt.csvPauseMin"), t("zt.csvRequiredPauseMin"), t("zt.csvRequiredPauseMet"), t("zt.station"), t("zt.location")];
    const rows = entries.map(e => [
        fmtDate(e.check_in),
        fmt(e.check_in),
        e.check_out ? fmt(e.check_out) : "",
        e.check_in && e.check_out ? fmtDurationExact(e.check_in, e.check_out) : "",
        String(e.total_pause_minutes ?? 0),
        e.required_break_minutes != null ? String(e.required_break_minutes) : "",
        e.break_compliant === false ? "Nein" : e.break_compliant === true ? "Ja" : "",
        e.station ?? "",
        e.location_verified ? "Ja" : "Nein",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zeiterfassung_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
const KEY_STORE = "nurvo_zt_k";
const QUEUE_STORE = "nurvo_zt_q";
const TOKEN_STORE = "nurvo_zt_t";
type StoredToken = {
    token: string;
    issuedAt: string;
    expiresAt: string;
};
async function getCryptoKey(): Promise<CryptoKey> {
    const stored = localStorage.getItem(KEY_STORE);
    if (stored) {
        try {
            const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        }
        catch { }
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(KEY_STORE, btoa(String.fromCharCode(...new Uint8Array(raw))));
    return key;
}
async function encryptJson(data: unknown, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const buf = new Uint8Array(12 + ct.byteLength);
    buf.set(iv);
    buf.set(new Uint8Array(ct), 12);
    return btoa(String.fromCharCode(...buf));
}
async function decryptJson<T>(b64: string, key: CryptoKey): Promise<T | null> {
    try {
        const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
        return JSON.parse(new TextDecoder().decode(pt));
    }
    catch {
        return null;
    }
}
async function loadQueue(key: CryptoKey): Promise<OfflineAction[]> {
    const raw = localStorage.getItem(QUEUE_STORE);
    if (!raw)
        return [];
    return (await decryptJson<OfflineAction[]>(raw, key)) ?? [];
}
async function persistQueue(actions: OfflineAction[], key: CryptoKey): Promise<void> {
    if (actions.length === 0) {
        localStorage.removeItem(QUEUE_STORE);
        return;
    }
    localStorage.setItem(QUEUE_STORE, await encryptJson(actions, key));
}
async function loadToken(key: CryptoKey): Promise<StoredToken | null> {
    const raw = localStorage.getItem(TOKEN_STORE);
    if (!raw)
        return null;
    const t = await decryptJson<StoredToken>(raw, key);
    if (!t || new Date(t.expiresAt) < new Date()) {
        localStorage.removeItem(TOKEN_STORE);
        return null;
    }
    return t;
}
async function saveToken(t: StoredToken, key: CryptoKey): Promise<void> {
    localStorage.setItem(TOKEN_STORE, await encryptJson(t, key));
}
async function fetchAndStoreToken(key: CryptoKey): Promise<StoredToken | null> {
    try {
        const res = await fetch("/api/zeiterfassung/token", { method: "POST" });
        if (!res.ok)
            return null;
        const t: StoredToken = await res.json();
        await saveToken(t, key);
        return t;
    }
    catch {
        return null;
    }
}
async function syncQueueItems(queue: OfflineAction[], key: CryptoKey): Promise<{
    remaining: OfflineAction[];
    synced: Entry[];
    newActive?: Entry | null;
}> {
    const tempToReal = new Map<string, string>();
    const synced: Entry[] = [];
    const remaining: OfflineAction[] = [];
    let newActive: Entry | null | undefined = undefined;
    for (const action of queue) {
        if (action.type === "checkin") {
            try {
                const res = await fetch("/api/zeiterfassung", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        station: action.station, latitude: action.lat, longitude: action.lng,
                        location_verified: action.loc, check_in: action.ts,
                        offline_token: action.offlineToken,
                    }),
                });
                if (res.ok) {
                    const d = await res.json();
                    tempToReal.set(action.tempId, d.entry.id);
                    newActive = d.entry;
                }
                else if (res.status === 409) {
                    const gr = await fetch("/api/zeiterfassung");
                    if (gr.ok) {
                        const gd = await gr.json();
                        if (gd.active?.id) {
                            tempToReal.set(action.tempId, gd.active.id);
                            newActive = gd.active;
                        }
                    }
                }
                else {
                    remaining.push(action);
                }
            }
            catch {
                remaining.push(action);
            }
        }
        else {
            const realId = action.entryId.startsWith("temp-")
                ? tempToReal.get(action.entryId)
                : action.entryId;
            if (!realId) {
                remaining.push(action);
                continue;
            }
            try {
                const res = await fetch("/api/zeiterfassung", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: realId, latitude: action.lat, longitude: action.lng,
                        location_verified: action.loc, check_out: action.ts,
                    }),
                });
                if (res.ok) {
                    const d = await res.json();
                    synced.push(d.entry);
                    newActive = null;
                }
                else {
                    remaining.push({ ...action, entryId: realId });
                }
            }
            catch {
                remaining.push({ ...action, entryId: realId });
            }
        }
    }
    await persistQueue(remaining, key);
    return { remaining, synced, newActive };
}
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function getLocation(): Promise<{
    lat: number;
    lng: number;
    ok: boolean;
}> {
    return new Promise(resolve => {
        if (!navigator.geolocation)
            return resolve({ lat: 0, lng: 0, ok: false });
        let done = false;
        const finish = (r: {
            lat: number;
            lng: number;
            ok: boolean;
        }) => { if (!done) {
            done = true;
            resolve(r);
        } };
        const hardTimeout = setTimeout(() => finish({ lat: 0, lng: 0, ok: false }), 10000);
        navigator.geolocation.getCurrentPosition(p => { clearTimeout(hardTimeout); finish({ lat: p.coords.latitude, lng: p.coords.longitude, ok: true }); }, () => { clearTimeout(hardTimeout); finish({ lat: 0, lng: 0, ok: false }); }, { timeout: 8000, enableHighAccuracy: true });
    });
}
const SQL = `create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_name text,
  facility text not null,
  station text,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  duration_minutes integer,
  location_verified boolean default false,
  latitude double precision,
  longitude double precision,
  checkout_location_verified boolean default false,
  checkout_latitude double precision,
  checkout_longitude double precision,
  paused_at timestamptz,
  total_pause_minutes integer default 0,
  required_break_minutes integer,
  break_compliant boolean
);
create index if not exists time_entries_user on time_entries(user_id, check_in desc);
create index if not exists time_entries_fac  on time_entries(facility, check_in desc);
-- Migration für bestehende Tabellen:
alter table time_entries add column if not exists checkout_location_verified boolean default false;
alter table time_entries add column if not exists checkout_latitude double precision;
alter table time_entries add column if not exists checkout_longitude double precision;
alter table time_entries add column if not exists paused_at timestamptz;
alter table time_entries add column if not exists total_pause_minutes integer default 0;
alter table time_entries add column if not exists required_break_minutes integer;
alter table time_entries add column if not exists break_compliant boolean;`;
export default function ZeiterfassungPage() {
    const { t } = useLang();
    const [role, setRole] = useState<"mitarbeiter" | "leitung">("mitarbeiter");
    const [loading, setLoading] = useState(true);
    const showLoading = useDelayedLoading(loading);
    const [tableMissing, setTableMissing] = useState(false);
    const [error, setError] = useState("");
    const [active, setActive] = useState<Entry | null>(null);
    const [activeAll, setActiveAll] = useState<Entry[]>([]);
    const [todayAll, setTodayAll] = useState<Entry[]>([]);
    const [pausing, setPausing] = useState(false);
    const [checking, setChecking] = useState(false);
    const [locStatus, setLocStatus] = useState<LocStatus>("idle");
    const [checkoutLocStatus, setCheckoutLocStatus] = useState<LocStatus>("idle");
    const [selectedStation, setSelectedStation] = useState("");
    const [stations, setStations] = useState<{
        name: string;
        color: string;
    }[]>([]);
    const [facilityGeo, setFacilityGeo] = useState<{
        lat: number | null;
        lng: number | null;
        radius_m: number;
    } | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [geoForm, setGeoForm] = useState({ lat: "", lng: "", radius: "300" });
    const [geoSaving, setGeoSaving] = useState(false);
    const [geoLocating, setGeoLocating] = useState(false);
    const [geoLocError, setGeoLocError] = useState("");
    const [isOnline, setIsOnline] = useState(true);
    const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
    const [pendingQueue, setPendingQueue] = useState<OfflineAction[]>([]);
    const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
    const [offlineToken, setOfflineToken] = useState<StoredToken | null>(null);
    const offlineTokenRef = useRef<StoredToken | null>(null);
    useEffect(() => { offlineTokenRef.current = offlineToken; }, [offlineToken]);
    const [showDifficultyModal, setShowDifficultyModal] = useState(false);
    const [diffRating, setDiffRating] = useState(0);
    const [diffNote, setDiffNote] = useState("");
    const [diffEntry, setDiffEntry] = useState<Entry | null>(null);
    const [diffSubmitting, setDiffSubmitting] = useState(false);
    const [jetzt, setJetzt] = useState<number>(() => Date.now());
    const cryptoKeyRef = useRef<CryptoKey | null>(null);
    const pendingQueueRef = useRef<OfflineAction[]>([]);
    const isSyncingRef = useRef(false);
    useEffect(() => { cryptoKeyRef.current = cryptoKey; }, [cryptoKey]);
    useEffect(() => { pendingQueueRef.current = pendingQueue; }, [pendingQueue]);
    useEffect(() => {
        const id = setInterval(() => setJetzt(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const load = useCallback(async (silent = false) => {
        if (!silent)
            setLoading(true);
        try {
            const res = await fetch("/api/zeiterfassung");
            const d = await res.json();
            if (d.tableMissing) {
                setTableMissing(true);
                setLoading(false);
                return;
            }
            setRole(d.role ?? "mitarbeiter");
            if (d.role === "leitung") {
                setActiveAll(d.active ?? []);
                setTodayAll(d.today ?? []);
                setActive(d.myEntry ?? null);
            }
            else {
                setActive(d.active ?? null);
            }
        }
        catch {
            setIsOnline(false);
        }
        setLoading(false);
    }, []);
    async function doSync(q: OfflineAction[], k: CryptoKey) {
        if (isSyncingRef.current)
            return;
        isSyncingRef.current = true;
        setSyncStatus("syncing");
        try {
            const { remaining, synced, newActive } = await syncQueueItems(q, k);
            setPendingQueue(remaining);
            pendingQueueRef.current = remaining;
            if (newActive !== undefined) {
                if (newActive)
                    setActive(newActive);
                else if (synced.length > 0)
                    setActive(null);
            }
            setSyncStatus(remaining.length === 0 ? "done" : "error");
            if (remaining.length === 0) {
                setTimeout(() => setSyncStatus("idle"), 3000);
                load();
            }
        }
        catch {
            setSyncStatus("error");
        }
        finally {
            isSyncingRef.current = false;
        }
    }
    useEffect(() => {
        let aktiv = true;
        void Promise.resolve().then(() => { if (aktiv)
            load(); });
        return () => { aktiv = false; };
    }, [load]);
    useEffect(() => {
        fetch("/api/leitung/stations")
            .then(r => r.json())
            .then(d => setStations(d.stations ?? []))
            .catch(() => { });
    }, []);
    useEffect(() => {
        fetch("/api/leitung/facility-settings")
            .then(r => r.json())
            .then(d => {
            if (d.settings) {
                setFacilityGeo({ lat: d.settings.geo_lat, lng: d.settings.geo_lng, radius_m: d.settings.check_in_radius_m ?? 300 });
                setGeoForm({ lat: String(d.settings.geo_lat ?? ""), lng: String(d.settings.geo_lng ?? ""), radius: String(d.settings.check_in_radius_m ?? 300) });
            }
        })
            .catch(() => { });
    }, []);
    useEffect(() => {
        getCryptoKey().then(async (k) => {
            setCryptoKey(k);
            cryptoKeyRef.current = k;
            let tok = await loadToken(k);
            if (!tok && navigator.onLine)
                tok = await fetchAndStoreToken(k);
            if (tok) {
                setOfflineToken(tok);
                offlineTokenRef.current = tok;
            }
            const q = await loadQueue(k);
            setPendingQueue(q);
            pendingQueueRef.current = q;
            const pendingIn = q.find(a => a.type === "checkin" &&
                !q.some(b => b.type === "checkout" && b.entryId === (a as {
                    tempId: string;
                }).tempId));
            if (pendingIn && pendingIn.type === "checkin") {
                setActive(prev => prev ?? {
                    id: pendingIn.tempId, user_id: "", user_name: null, facility: "",
                    station: pendingIn.station, check_in: pendingIn.ts, check_out: null,
                    duration_minutes: null, location_verified: pendingIn.loc, _offline: true,
                });
            }
            if (navigator.onLine && q.length > 0)
                doSync(q, k);
        }).catch(console.error);
    }, []);
    useEffect(() => {
        void Promise.resolve().then(() => setIsOnline(navigator.onLine));
        const handleOnline = async () => {
            setIsOnline(true);
            const k = cryptoKeyRef.current;
            if (k) {
                const tok = await fetchAndStoreToken(k);
                if (tok) {
                    setOfflineToken(tok);
                    offlineTokenRef.current = tok;
                }
            }
            const q = pendingQueueRef.current;
            if (q.length > 0 && k)
                doSync(q, k);
        };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);
    function checkInRange(loc: {
        lat: number;
        lng: number;
        ok: boolean;
    }): boolean {
        if (!loc.ok)
            return false;
        if (!facilityGeo?.lat || !facilityGeo?.lng)
            return true;
        const dist = haversineMeters(loc.lat, loc.lng, facilityGeo.lat, facilityGeo.lng);
        return dist <= (facilityGeo.radius_m ?? 300);
    }
    async function handleCheckIn() {
        setChecking(true);
        setError("");
        setLocStatus("checking");
        const loc = await getLocation();
        const inRange = checkInRange(loc);
        setLocStatus(inRange ? "ok" : loc.ok ? "denied" : "denied");
        const payload = {
            station: selectedStation || null,
            latitude: loc.ok ? loc.lat : null, longitude: loc.ok ? loc.lng : null,
            location_verified: inRange,
        };
        if (!navigator.onLine) {
            await saveOfflineCheckin(loc);
            setChecking(false);
            return;
        }
        try {
            const res = await fetch("/api/zeiterfassung", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(d?.error ? `Anmelden fehlgeschlagen: ${d.error}` : ERR_GENERIC);
                setChecking(false);
                return;
            }
            setActive(d.entry);
            load(true);
        }
        catch {
            setIsOnline(false);
            await saveOfflineCheckin(loc);
        }
        setChecking(false);
    }
    async function saveOfflineCheckin(loc: {
        lat: number;
        lng: number;
        ok: boolean;
    }) {
        const tempId = `temp-${Date.now()}`;
        const ts = new Date().toISOString();
        const tok = offlineTokenRef.current;
        const action: OfflineAction = {
            type: "checkin", tempId, ts,
            station: selectedStation || null,
            lat: loc.ok ? loc.lat : null, lng: loc.ok ? loc.lng : null, loc: loc.ok,
            offlineToken: tok?.token,
        };
        const newQ = [...pendingQueueRef.current, action];
        if (cryptoKeyRef.current)
            await persistQueue(newQ, cryptoKeyRef.current);
        setPendingQueue(newQ);
        pendingQueueRef.current = newQ;
        setActive({
            id: tempId, user_id: "", user_name: null, facility: "",
            station: selectedStation || null, check_in: ts, check_out: null,
            duration_minutes: null, location_verified: loc.ok, _offline: true,
        });
    }
    async function handleCheckOut() {
        if (!active)
            return;
        setChecking(true);
        setError("");
        setCheckoutLocStatus("checking");
        const loc = await getLocation();
        const inRange = checkInRange(loc);
        setCheckoutLocStatus(inRange ? "ok" : loc.ok ? "denied" : "denied");
        if (!navigator.onLine || active._offline) {
            await saveOfflineCheckout(active, loc);
            setChecking(false);
            return;
        }
        try {
            const res = await fetch("/api/zeiterfassung", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: active.id,
                    latitude: loc.ok ? loc.lat : null, longitude: loc.ok ? loc.lng : null,
                    location_verified: inRange,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(d?.error ? `Abmelden fehlgeschlagen: ${d.error}` : ERR_GENERIC);
                setCheckoutLocStatus("idle");
                setChecking(false);
                return;
            }
            setActive(null);
            setCheckoutLocStatus("idle");
            setDiffEntry(d.entry);
            setDiffRating(0);
            setDiffNote("");
            setShowDifficultyModal(true);
            load(true);
        }
        catch {
            setIsOnline(false);
            await saveOfflineCheckout(active, loc);
        }
        setChecking(false);
    }
    async function saveOfflineCheckout(entry: Entry, loc: {
        lat: number;
        lng: number;
        ok: boolean;
    }) {
        const ts = new Date().toISOString();
        const dur = Math.round((new Date(ts).getTime() - new Date(entry.check_in).getTime()) / 60000);
        const action: OfflineAction = {
            type: "checkout", entryId: entry.id, ts,
            lat: loc.ok ? loc.lat : null, lng: loc.ok ? loc.lng : null, loc: loc.ok,
        };
        const newQ = [...pendingQueueRef.current, action];
        if (cryptoKeyRef.current)
            await persistQueue(newQ, cryptoKeyRef.current);
        setPendingQueue(newQ);
        pendingQueueRef.current = newQ;
        const completedEntry = { ...entry, check_out: ts, duration_minutes: dur, checkout_location_verified: loc.ok, _offline: true };
        setActive(null);
        setCheckoutLocStatus("idle");
        setDiffEntry(completedEntry);
        setDiffRating(0);
        setDiffNote("");
        setShowDifficultyModal(true);
    }
    async function handlePause() {
        if (!active || active._offline)
            return;
        setPausing(true);
        setError("");
        try {
            const res = await fetch("/api/zeiterfassung", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: active.id, pause_action: "pause" }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok)
                setActive(d.entry);
            else
                setError(d?.error ? `Pause fehlgeschlagen: ${d.error}` : ERR_GENERIC);
        }
        catch {
            setActive(prev => prev ? { ...prev, paused_at: new Date().toISOString() } : prev);
        }
        setPausing(false);
    }
    async function handleResume() {
        if (!active || active._offline)
            return;
        setPausing(true);
        setError("");
        try {
            const res = await fetch("/api/zeiterfassung", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: active.id, pause_action: "resume" }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok)
                setActive(d.entry);
            else
                setError(d?.error ? `Fortsetzen fehlgeschlagen: ${d.error}` : ERR_GENERIC);
        }
        catch {
            const addedMins = active.paused_at
                ? Math.round((Date.now() - new Date(active.paused_at).getTime()) / 60000) : 0;
            setActive(prev => prev ? {
                ...prev,
                paused_at: null,
                total_pause_minutes: (prev.total_pause_minutes ?? 0) + addedMins,
            } : prev);
        }
        setPausing(false);
    }
    async function saveGeoSettings() {
        setGeoSaving(true);
        const lat = parseFloat(geoForm.lat);
        const lng = parseFloat(geoForm.lng);
        const radius = parseInt(geoForm.radius, 10);
        if (isNaN(lat) || isNaN(lng)) {
            setGeoSaving(false);
            return;
        }
        const res = await fetch("/api/leitung/facility-settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geo_lat: lat, geo_lng: lng, check_in_radius_m: isNaN(radius) ? 300 : radius }),
        });
        if (res.ok) {
            setFacilityGeo({ lat, lng, radius_m: isNaN(radius) ? 300 : radius });
            setSettingsOpen(false);
        }
        setGeoSaving(false);
    }
    async function useCurrentLocationForFacility() {
        setGeoLocating(true);
        setGeoLocError("");
        const loc = await getLocation();
        setGeoLocating(false);
        if (loc.ok) {
            setGeoForm(f => ({ ...f, lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6) }));
        }
        else {
            setGeoLocError(t("zt.geoError"));
        }
    }
    async function submitDifficulty(rating: number) {
        if (!diffEntry)
            return;
        setDiffSubmitting(true);
        try {
            await fetch("/api/zeiterfassung/difficulty", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating,
                    note: diffNote || null,
                    station: diffEntry.station,
                    shiftDate: diffEntry.check_in.slice(0, 10),
                    timeEntryId: diffEntry._offline ? null : diffEntry.id,
                }),
            });
        }
        catch { }
        setDiffSubmitting(false);
        setShowDifficultyModal(false);
        setDiffEntry(null);
    }
    if (loading) {
        if (!showLoading)
            return null;
        return (<div>
        <Header title={t("zt.title")} subtitle={t(role === "leitung" ? "zt.subtitle.mgmt" : "zt.subtitle.staff")}/>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--tinte-matt)]">
          <PulseLoader size={20}/>
          <span className="text-sm">Zeiterfassung wird geladen…</span>
        </div>
      </div>);
    }
    const offlineBanner = !isOnline ? (<div className="bg-[var(--papier)] border border-[var(--linie)] bg-[var(--warnung-flaeche)] rounded-xl p-4 flex items-start gap-3">
      <span className="material-symbols-outlined text-[var(--warnung)] flex-shrink-0 mt-0.5" style={{ fontSize: 16 }}>wifi_off</span>
      <div>
        <p className="text-[var(--warnung)] font-semibold text-[13px]">{t("zt.offline")}</p>
        <p className="text-[var(--warnung)] text-[13px] mt-0.5">{t("zt.offlineHint")}</p>
      </div>
    </div>) : syncStatus !== "idle" ? (<div className="bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-xl p-3 flex items-center gap-3">
      {syncStatus === "syncing"
            ? <span className="material-symbols-outlined text-[var(--akzent)] animate-spin flex-shrink-0" style={{ fontSize: 15 }}>sync</span>
            : syncStatus === "done"
                ? <span className="material-symbols-outlined text-[var(--akzent)] flex-shrink-0" style={{ fontSize: 15 }}>check_circle</span>
                : <span className="material-symbols-outlined text-[var(--gefahr)] flex-shrink-0" style={{ fontSize: 15 }}>error</span>}
      <p className="text-[var(--akzent)] text-[13px] font-medium">
        {syncStatus === "syncing" ? t("zt.syncing") : syncStatus === "done" ? t("zt.syncDone") : t("zt.syncFailed")}
      </p>
    </div>) : null;
    const errorBanner = error ? (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-xl p-3 flex items-center gap-3" role="alert">
      <span className="material-symbols-outlined text-[var(--gefahr)] flex-shrink-0" style={{ fontSize: 16 }}>error</span>
      <p className="text-[var(--gefahr)] text-[13px]">{error}</p>
    </div>) : null;
    const tableMissingBanner = tableMissing ? (<details className="bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-xl p-4 cursor-pointer">
      <summary className="flex items-center gap-2 text-[var(--warnung)] font-semibold text-[13px] select-none">
        <span className="material-symbols-outlined text-[var(--warnung)] flex-shrink-0" style={{ fontSize: 16 }}>warning</span>
        {t("zt.tableMissing")} — {t("zt.tableMissingHint")}
      </summary>
      <pre className="mt-3 bg-[var(--tinte)] text-[var(--auf-tinte)] text-[13px] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono">{SQL}</pre>
    </details>) : null;
    if (role === "leitung") {
        const completed = todayAll.filter(e => e.check_out);
        const isLeitungCheckedIn = !!active;
        return (<div>
        <Header title={t("zt.title")} subtitle={t("zt.subtitle.mgmt")}/>
        <div className="px-7 pb-7 pt-4 space-y-6 max-w-5xl mx-auto">
          {tableMissingBanner}
          {offlineBanner}
          {errorBanner}

          
          <div className={`bg-[var(--papier)] border rounded-xl p-5 flex items-center justify-between gap-4 ${isLeitungCheckedIn ? "border-[var(--linie)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)]"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isLeitungCheckedIn ? "bg-[var(--akzent)]" : "bg-[var(--akzent-flaeche)]"}`}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
                  {isLeitungCheckedIn ? "check_circle" : "schedule"}
                </span>
              </div>
              <div>
                <p className="font-semibold text-[var(--tinte)] text-[14px]">Meine Schicht</p>
                {isLeitungCheckedIn ? (<p className="text-[var(--akzent)] text-[13px]">
                    Eingestempelt seit {fmt(active.check_in)} · {fmtSec(netElapsedSec(active, jetzt))}
                  </p>) : (<p className="text-[var(--tinte-matt)] text-[13px]">Noch nicht eingestempelt</p>)}
              </div>
            </div>
            {isLeitungCheckedIn ? (<button onClick={handleCheckOut} disabled={checking} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-semibold bg-[var(--gefahr)] hover:bg-[var(--gefahr)] disabled:opacity-60 transition-colors">
                {checking ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>logout</span>}
                Abmelden
              </button>) : (<button onClick={handleCheckIn} disabled={checking} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent)] disabled:opacity-60 transition-colors">
                {checking ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>login</span>}
                Anmelden
              </button>)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5" style={{ borderTop: "3px solid #0d9488" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>groups</span>
                <span className="text-[var(--tinte-matt)] text-[13px]">{t("zt.currentlyIn")}</span>
              </div>
              <p className="text-[32px] font-semibold text-[var(--akzent)] leading-none">{activeAll.length}</p>
            </div>
            <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5" style={{ borderTop: "3px solid #64748b" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>check_circle</span>
                <span className="text-[var(--tinte-matt)] text-[13px]">{t("zt.finishedToday")}</span>
              </div>
              <p className="text-[32px] font-semibold text-[var(--tinte-matt)] leading-none">{completed.length}</p>
            </div>
            <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5" style={{ borderTop: "3px solid var(--akzent)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>calendar_today</span>
                <span className="text-[var(--tinte-matt)] text-[13px]">{t("zt.todayTotal")}</span>
              </div>
              <p className="text-[32px] font-semibold text-[var(--akzent)] leading-none">{todayAll.length}</p>
            </div>
          </div>

          
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>location_on</span>
                <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("zt.locSettings")}</h2>
              </div>
              <button onClick={() => setSettingsOpen(v => !v)} className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>settings</span>
                {settingsOpen ? t("common.close") : t("common.edit")}
              </button>
            </div>
            {facilityGeo?.lat ? (<p className="text-[var(--tinte-matt)] text-[13px] mb-3">
                {facilityGeo.lat.toFixed(5)}, {facilityGeo.lng?.toFixed(5)} · {t("zt.radius")}: {facilityGeo.radius_m} m
              </p>) : (<p className="text-[var(--warnung)] text-[13px] mb-3">{t("zt.noLocationSet")}</p>)}
            {settingsOpen && (<div className="space-y-3 pt-3 border-t border-[var(--linie)]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="zeiterfassung-latitude" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("zt.latitude")}</label>
                    <input id="zeiterfassung-latitude" type="number" step="any" value={geoForm.lat} onChange={e => setGeoForm(f => ({ ...f, lat: e.target.value }))} placeholder="48.137154" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                  </div>
                  <div>
                    <label htmlFor="zeiterfassung-longitude" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("zt.longitude")}</label>
                    <input id="zeiterfassung-longitude" type="number" step="any" value={geoForm.lng} onChange={e => setGeoForm(f => ({ ...f, lng: e.target.value }))} placeholder="11.575382" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                  </div>
                </div>
                <div>
                  <label htmlFor="zeiterfassung-checkinradius" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("zt.checkinRadius")}</label>
                  <input id="zeiterfassung-checkinradius" type="number" min="50" max="5000" step="50" value={geoForm.radius} onChange={e => setGeoForm(f => ({ ...f, radius: e.target.value }))} placeholder="300" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                  <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("zt.radiusHint")}</p>
                </div>
                {geoLocError && (<p className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2">{geoLocError}</p>)}
                <div className="flex gap-2">
                  <button onClick={useCurrentLocationForFacility} disabled={geoLocating} className="flex items-center gap-1.5 px-3 py-2 text-[var(--tinte-matt)] text-[13px] font-medium rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                    {geoLocating
                    ? <PulseLoader size={12}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>my_location</span>}
                    {geoLocating ? t("zt.locating") : t("zt.useMyLocation")}
                  </button>
                  <button onClick={saveGeoSettings} disabled={geoSaving || !geoForm.lat || !geoForm.lng} className="flex items-center gap-1.5 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                    {geoSaving
                    ? <PulseLoader size={12}/>
                    : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>save</span>}
                    {t("common.save")}
                  </button>
                </div>
              </div>)}
          </div>

          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[var(--akzent)] animate-pulse"/>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("zt.currentlyIn")}</h2>
            </div>
            {activeAll.length === 0 ? (<p className="text-[var(--tinte-matt)] text-[13px] py-4 text-center">{t("zt.noEntries")}</p>) : (<div className="space-y-2">
                {activeAll.map(e => (<div key={e.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--akzent-flaeche)] border border-[var(--linie)]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--akzent)] flex items-center justify-center text-white text-[13px] font-semibold">
                        {e.user_name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="text-[var(--tinte)] font-medium text-[13px]">{e.user_name ?? "—"}</p>
                        <p className="text-[var(--tinte-matt)] text-[13px]">{e.station ?? t("zt.station")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[var(--akzent)] font-semibold text-[13px] tabular-nums">{fmt(e.check_in)}</p>
                      <p className={`text-[13px] flex items-center gap-1 justify-end tabular-nums ${e.paused_at ? "text-[var(--warnung)]" : "text-[var(--tinte-matt)]"}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{e.paused_at ? "pause" : "timer"}</span>
                        {e.paused_at && `${t("zt.pauseWord")} · `}{fmtSec(netElapsedSec(e, jetzt))}
                      </p>
                    </div>
                    {e.location_verified && (<span title={t("zt.locationVerified")}>
                        <span className="material-symbols-outlined text-[var(--akzent)] ml-2 flex-shrink-0" style={{ fontSize: 14 }}>location_on</span>
                      </span>)}
                  </div>))}
              </div>)}
          </div>

          {completed.length > 0 && (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--linie)] flex items-center justify-between">
                <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("zt.checkouts")}</h2>
                <button onClick={() => exportCSV(completed, t)} className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span>
                  CSV
                </button>
              </div>
              <table className="w-full text-[13px] hidden md:table">
                <thead>
                  <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                    {[t("zt.name"), t("zt.station"), t("zt.checkInTime"), t("zt.checkOutTime"), t("zt.duration"), ""].map(h => (<th key={h} className="text-left px-5 py-3 text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {completed.map((e, i) => (<tr key={e.id} className={`hover:bg-[var(--papier-tief)] ${i < completed.length - 1 ? "border-b border-[var(--linie)]" : ""}`}>
                      <td className="px-5 py-3 text-[var(--tinte)] font-medium">{e.user_name ?? "—"}</td>
                      <td className="px-5 py-3 text-[var(--tinte-matt)]">{e.station ?? "—"}</td>
                      <td className="px-5 py-3 text-[var(--tinte-matt)]">{fmt(e.check_in)}</td>
                      <td className="px-5 py-3 text-[var(--tinte-matt)]">{e.check_out ? fmt(e.check_out) : "—"}</td>
                      <td className="px-5 py-3">
                        {e.check_out ? (<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--papier-tief)] text-[var(--tinte-leise)] tabular-nums">{fmtDurationExact(e.check_in, e.check_out)}</span>) : e.duration_minutes != null ? (<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--papier-tief)] text-[var(--tinte-leise)] tabular-nums">{fmtDuration(e.duration_minutes)}</span>) : null}
                        {e.break_compliant === false && (<span title={`Gesetzliche Mindestpause nicht erfüllt — ${e.total_pause_minutes ?? 0} von ${e.required_break_minutes ?? 0} min genommen (ArbZG §4).`} className="ml-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)] align-middle">
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>coffee</span>
                            Pause {e.total_pause_minutes ?? 0}/{e.required_break_minutes ?? 0}
                          </span>)}
                      </td>
                      <td className="px-5 py-3 flex items-center gap-1.5">
                        {e.location_verified && <span title="Standort Anmeldung"><span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 13 }}>location_on</span></span>}
                        {e.checkout_location_verified && <span title="Standort Abmeldung"><span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 13 }}>location_on</span></span>}
                      </td>
                    </tr>))}
                </tbody>
              </table>

              
              <div className="md:hidden divide-y divide-[var(--linie)]">
                {completed.map(e => (<div key={e.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-[var(--tinte)] truncate">{e.user_name ?? "—"}</span>
                      <span className="text-[13px] font-semibold text-[var(--tinte-leise)] tabular-nums flex-shrink-0">
                        {e.check_out ? fmtDurationExact(e.check_in, e.check_out) : e.duration_minutes != null ? fmtDuration(e.duration_minutes) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[13px] text-[var(--tinte-matt)]">
                      <span className="truncate">{e.station ?? "—"}</span>
                      <span className="tabular-nums flex-shrink-0">{fmt(e.check_in)} – {e.check_out ? fmt(e.check_out) : "…"}</span>
                    </div>
                    {e.break_compliant === false && (<div className="mt-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border border-[var(--linie)]">
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>coffee</span>
                        Pflichtpause nicht erfüllt · {e.total_pause_minutes ?? 0}/{e.required_break_minutes ?? 0} min
                      </div>)}
                  </div>))}
              </div>
            </div>)}

          
          <SchichtBerichte modus="leitung"/>
        </div>
      </div>);
    }
    const isCheckedIn = !!active;
    return (<div>
      <Header title={t("zt.title")} subtitle={t("zt.subtitle.staff")}/>
      <div className="px-7 pb-7 pt-4 space-y-6 max-w-lg mx-auto">

        {tableMissingBanner}
        {offlineBanner}
        {errorBanner}

        
        {(() => {
            const isPaused = !!active?.paused_at;
            const netSec = active ? netElapsedSec(active, jetzt) : 0;
            const pausedSinceMins = active?.paused_at
                ? Math.floor((jetzt - new Date(active.paused_at).getTime()) / 60000) : 0;
            return (<div className={`bg-[var(--papier)] border rounded-xl text-center py-10 transition ${isCheckedIn
                    ? isPaused
                        ? "border-[var(--linie)] bg-[var(--warnung-flaeche)]"
                        : "border-[var(--linie)] bg-[var(--akzent-flaeche)]"
                    : "border-[var(--linie)] bg-[var(--papier-tief)]"}`}>

          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${isCheckedIn
                    ? isPaused
                        ? "bg-[var(--warnung)]  shadow-amber-200"
                        : "bg-[var(--akzent)]  shadow-teal-200"
                    : "bg-[var(--akzent-flaeche)]"}`}>
            <span className={`material-symbols-outlined text-white`} style={{ fontSize: 36, fontVariationSettings: "'FILL' 1" }}>
              {isCheckedIn ? (isPaused ? "pause" : "check_circle") : "schedule"}
            </span>
          </div>

          {isCheckedIn ? (<>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-1">
                {isPaused ? t("zt.pauseSince") : t("zt.checkedInSince")}
              </p>
              <p className="text-[24px] font-semibold text-[var(--tinte)] mb-0.5">
                {isPaused ? fmt(active.paused_at!) : fmt(active.check_in)}
              </p>
              {active.station && <p className="text-[var(--tinte-matt)] text-[13px] mb-3">{active.station}</p>}

              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-semibold mb-1 tabular-nums ${isPaused ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]"}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>timer</span>
                {fmtSec(netSec)}
              </div>

              {isPaused && (<p className="text-[var(--warnung)] text-[13px] mb-3 mt-1">
                  {t("zt.pausedFor")} {pausedSinceMins > 0 ? `${pausedSinceMins} min` : t("zt.justNow")}
                  {(active.total_pause_minutes ?? 0) > 0
                            ? ` · ${active.total_pause_minutes} ${t("zt.minPauseTotal")}`
                            : ""}
                </p>)}
              {!isPaused && (active.total_pause_minutes ?? 0) > 0 && (<p className="text-[var(--tinte-matt)] text-[13px] mb-3 mt-1">
                  {active.total_pause_minutes} {t("zt.minPauseDeducted")}
                </p>)}

              {active._offline && (<div className="flex items-center justify-center gap-1.5 text-[var(--warnung)] text-[13px] mb-3 mt-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>wifi_off</span>
                  {t("zt.offlineSaved")}
                </div>)}

              {active.location_verified && !isPaused && (<div className="flex items-center justify-center gap-1.5 text-[var(--akzent)] text-[13px] mb-4">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>location_on</span>
                  {t("zt.locOk")}
                </div>)}

              {checkoutLocStatus === "checking" && (<div className="flex items-center justify-center gap-2 text-[var(--akzent)] text-[13px] mb-4">
                  <PulseLoader size={13}/>
                  {t("zt.checking")}
                </div>)}

              <div className="flex flex-col gap-3 mt-2">
                {!active._offline && (isPaused ? (<button onClick={handleResume} disabled={pausing} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-white font-semibold text-[15px] transition bg-[var(--akzent)] hover:bg-[var(--akzent)] active:scale-95  shadow-teal-200 disabled:opacity-60">
                      {pausing
                            ? <PulseLoader size={18}/>
                            : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>}
                      Weiter
                    </button>) : (<button onClick={handlePause} disabled={pausing || checking} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[15px] transition border-2 border-[var(--warnung)] text-[var(--warnung)] bg-[var(--warnung-flaeche)] hover:bg-[var(--warnung-flaeche)] active:scale-95 disabled:opacity-60">
                      {pausing
                            ? <PulseLoader size={18}/>
                            : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>pause</span>}
                      Pause
                    </button>))}

                <button onClick={handleCheckOut} disabled={checking} className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-white font-semibold text-[15px] transition bg-[var(--gefahr)] hover:bg-[var(--gefahr)] active:scale-95  shadow-red-200 disabled:opacity-60">
                  {checking
                        ? <PulseLoader size={20}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>}
                  {checking ? t("zt.checking") : t("zt.checkout")}
                </button>
              </div>
            </>) : (<>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-2">{t("zt.notIn")}</p>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-6">
                {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
              </p>

              {stations.length > 0 && (<select value={selectedStation} onChange={e => setSelectedStation(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-[13px] border border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 mb-4">
                  <option value="">{t("zt.selectStation")}</option>
                  {stations.map(s => (<option key={s.name} value={s.name}>{s.name}</option>))}
                </select>)}

              {locStatus === "checking" && (<div className="flex items-center justify-center gap-2 text-[var(--akzent)] text-[13px] mb-4">
                  <PulseLoader size={14}/>
                  {t("zt.checking")}
                </div>)}
              {locStatus === "ok" && (<div className="flex items-center justify-center gap-1.5 text-[var(--akzent)] text-[13px] mb-4">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
                  {t("zt.locOk")}
                </div>)}
              {locStatus === "denied" && (<div className="flex items-center justify-center gap-1.5 text-[var(--tinte-matt)] text-[13px] mb-4">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_off</span>
                  {t("zt.locDenied")}
                </div>)}

              <button onClick={handleCheckIn} disabled={checking} className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl text-white font-semibold text-[15px] transition bg-[var(--akzent)] hover:bg-[var(--akzent)] active:scale-95  shadow-teal-200 disabled:opacity-60">
                {checking
                        ? <PulseLoader size={20}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 20 }}>login</span>}
                {checking ? t("zt.checking") : t("zt.checkin")}
              </button>

              <p className="text-[var(--tinte-matt)] text-[13px] mt-3 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>location_on</span>
                {t("zt.locHint")}
              </p>
            </>)}
        </div>);
        })()}

        
        <div className="bg-[var(--papier-tief)] border border-[var(--linie)] rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0 mt-0.5" style={{ fontSize: 16 }}>lock</span>
          <div>
            <p className="text-[var(--tinte-matt)] font-medium text-[13px]">Schichtdaten gesichert</p>
            <p className="text-[var(--tinte-matt)] text-[13px] mt-0.5">
              Abgeschlossene Schichten werden sicher bei der Leitung gespeichert und sind unveränderlich.
              Deine Arbeitszeiten kannst du dort einsehen lassen.
            </p>
          </div>
        </div>

        
        {!isOnline && (<div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${offlineToken ? "bg-[var(--akzent-flaeche)] border border-[var(--linie)] text-[var(--akzent)]" : "bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[var(--warnung)]"}`}>
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 13 }}>
              {offlineToken ? "verified_user" : "warning"}
            </span>
            {offlineToken
                ? t("zt.offlineTokenActive")
                : t("zt.noOfflineToken")}
          </div>)}
      </div>

      
      <div className="px-7 pb-7 max-w-3xl mx-auto">
        <SchichtBerichte modus="mitarbeiter"/>
      </div>

      
      <Modal open={showDifficultyModal} onClose={() => { setShowDifficultyModal(false); setDiffEntry(null); }} title={t("zt.feedbackTitle")} description={t("zt.feedbackSub")} widthClass="max-w-sm">
        {showDifficultyModal && (<>
            
            <div className="flex justify-center gap-2 mb-5">
              {[1, 2, 3, 4, 5].map(n => (<button key={n} onClick={() => setDiffRating(n)} className="transition-transform hover:scale-110 active:scale-95">
                  <span className="material-symbols-outlined" style={{
                    fontSize: 36,
                    fontVariationSettings: "'FILL' 1",
                    color: n <= diffRating
                        ? diffRating <= 2 ? "#10b981" : diffRating === 3 ? "#f59e0b" : "#ef4444"
                        : "#d1d5db",
                }}>
                    star
                  </span>
                </button>))}
            </div>

            {diffRating > 0 && (<p className="text-center text-[13px] font-medium mb-4 text-[var(--tinte-matt)]">
                {diffRating === 1 ? t("zt.rating1") : diffRating === 2 ? t("zt.rating2") : diffRating === 3 ? t("zt.rating3") : diffRating === 4 ? t("zt.rating4") : t("zt.rating5")}
              </p>)}

            <textarea value={diffNote} onChange={e => setDiffNote(e.target.value)} placeholder={t("zt.feedbackPlaceholder")} rows={3} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] text-[var(--tinte)] placeholder-[var(--tinte-leise)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 resize-none mb-4 bg-[var(--papier-tief)]"/>

            <div className="flex gap-2">
              <button onClick={() => { setShowDifficultyModal(false); setDiffEntry(null); }} className="flex-1 py-2.5 rounded-xl text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                {t("ma.skip")}
              </button>
              <button onClick={() => diffRating > 0 && submitDifficulty(diffRating)} disabled={diffRating === 0 || diffSubmitting} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {diffSubmitting ? <PulseLoader size={14}/> : null}
                {t("zt.submit")}
              </button>
            </div>
          </>)}
      </Modal>
    </div>);
}

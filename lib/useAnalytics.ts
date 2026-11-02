"use client";
import { useCallback, useRef } from "react";
let sessionId: string | null = null;
function getSessionId(): string {
    if (!sessionId) {
        try {
            sessionId = sessionStorage.getItem("nurvo_sid") ?? crypto.randomUUID();
            sessionStorage.setItem("nurvo_sid", sessionId);
        }
        catch {
            sessionId = crypto.randomUUID();
        }
    }
    return sessionId;
}
import { CONSENT_KEY, CONSENT_VERSION } from "./consent-stand";
export { CONSENT_KEY, CONSENT_VERSION };
export const LEGACY_CONSENT_KEYS = ["nurvo_cookie_consent_v2", "nurvo_cookie_consent_v1", "nurvo_cookie_ok", "nurvo_analytics_disabled"];
export type CookieConsent = {
    v: number;
    ts: string;
    analytics: boolean;
};
export const CONSENT_CHANGED_EVENT = "nurvo:consent-changed";
export function readConsent(): CookieConsent | null {
    try {
        const raw = localStorage.getItem(CONSENT_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw) as CookieConsent;
        return typeof parsed?.v === "number" ? parsed : null;
    }
    catch {
        return null;
    }
}
export function writeConsent(analytics: boolean) {
    try {
        localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, ts: new Date().toISOString(), analytics }));
        for (const k of LEGACY_CONSENT_KEYS)
            localStorage.removeItem(k);
    }
    catch { }
    try {
        window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { analytics } }));
    }
    catch { }
}
export function isAnalyticsEnabled(): boolean {
    return readConsent()?.analytics === true;
}
export function setAnalyticsEnabled(enabled: boolean) {
    writeConsent(enabled);
}
export function track(eventName: string, properties?: Record<string, unknown>) {
    if (typeof window === "undefined")
        return;
    if (!isAnalyticsEnabled())
        return;
    try {
        fetch("/api/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event: eventName,
                page: window.location.pathname,
                session_id: getSessionId(),
                properties: properties ?? {},
            }),
            keepalive: true,
        }).catch(() => { });
    }
    catch { }
}
const pageOpenTimes: Record<string, number> = {};
const firstActionFired: Record<string, boolean> = {};
export function trackPageOpen(page?: string) {
    const p = page ?? (typeof window !== "undefined" ? window.location.pathname : "");
    pageOpenTimes[p] = Date.now();
    firstActionFired[p] = false;
    track("page_view", { path: p });
}
export function trackFirstAction(page?: string) {
    if (typeof window === "undefined")
        return;
    if (!isAnalyticsEnabled())
        return;
    const p = page ?? window.location.pathname;
    if (firstActionFired[p])
        return;
    firstActionFired[p] = true;
    const openAt = pageOpenTimes[p];
    if (!openAt)
        return;
    const ms = Date.now() - openAt;
    fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            event: "first_action",
            page: p,
            session_id: getSessionId(),
            time_to_first_action_ms: ms,
        }),
        keepalive: true,
    }).catch(() => { });
}
export function useAnalytics() {
    const trackedPageRef = useRef<string | null>(null);
    const trackEvent = useCallback((eventName: string, properties?: Record<string, unknown>) => {
        track(eventName, properties);
    }, []);
    const trackPageView = useCallback((page?: string) => {
        const p = page ?? (typeof window !== "undefined" ? window.location.pathname : "");
        if (trackedPageRef.current === p)
            return;
        trackedPageRef.current = p;
        trackPageOpen(p);
    }, []);
    return { trackEvent, trackPageView, trackFirstAction };
}

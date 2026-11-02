"use client";
import { useSyncExternalStore } from "react";
const abos = new Map<string, (neuzeichnen: () => void) => () => void>();
function aboFuer(abfrage: string) {
    let abo = abos.get(abfrage);
    if (!abo) {
        abo = (neuzeichnen: () => void) => {
            if (typeof window === "undefined" || !window.matchMedia)
                return () => { };
            const mql = window.matchMedia(abfrage);
            mql.addEventListener("change", neuzeichnen);
            return () => mql.removeEventListener("change", neuzeichnen);
        };
        abos.set(abfrage, abo);
    }
    return abo;
}
export function useMediaQuery(abfrage: string, serverwert = false): boolean {
    return useSyncExternalStore(aboFuer(abfrage), () => (typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(abfrage).matches
        : serverwert), () => serverwert);
}
export function useReducedMotion(): boolean {
    return useMediaQuery("(prefers-reduced-motion: reduce)");
}
function netzAbo(neuzeichnen: () => void) {
    window.addEventListener("online", neuzeichnen);
    window.addEventListener("offline", neuzeichnen);
    return () => {
        window.removeEventListener("online", neuzeichnen);
        window.removeEventListener("offline", neuzeichnen);
    };
}
export function useOnline(): boolean {
    return useSyncExternalStore(netzAbo, () => navigator.onLine, () => true);
}
const KEIN_ABO = () => () => { };
export function useClientValue<T>(lesen: () => T, serverwert: T): T {
    return useSyncExternalStore(KEIN_ABO, () => (typeof window === "undefined" ? serverwert : lesen()), () => serverwert);
}

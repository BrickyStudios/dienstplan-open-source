"use client";
import { useState, useEffect } from "react";
export function useDelayedLoading(loading: boolean, delayMs = 900): boolean {
    const [abgelaufen, setAbgelaufen] = useState(false);
    useEffect(() => {
        if (!loading)
            return;
        const t = setTimeout(() => setAbgelaufen(true), delayMs);
        return () => {
            clearTimeout(t);
            setAbgelaufen(false);
        };
    }, [loading, delayMs]);
    return loading && abgelaufen;
}

"use client";
import { useEffect } from "react";
const DEVICE_ID_KEY = "nurvo_device_id";
function getOrCreateDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}
export default function DeviceCheck({ userId }: {
    userId: string;
}) {
    useEffect(() => {
        const sessionKey = `nurvo_device_checked_${userId}`;
        if (sessionStorage.getItem(sessionKey))
            return;
        const deviceId = getOrCreateDeviceId();
        fetch("/api/user/device-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: deviceId }),
        })
            .then(() => {
            sessionStorage.setItem(sessionKey, "1");
        })
            .catch(() => { });
    }, []);
    return null;
}

"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/browser-zustand";
export default function OfflineBanner() {
    const online = useOnline();
    if (online)
        return null;
    return (<div className="flex items-center gap-2 px-4 py-2 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] text-[var(--warnung)] text-[13px] font-medium">
      <WifiOff size={13} className="flex-shrink-0"/>
      Offline-Modus — gespeicherte Daten werden angezeigt
    </div>);
}

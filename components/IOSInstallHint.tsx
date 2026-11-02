"use client";
import { useState, useSyncExternalStore } from "react";
const DISMISS_KEY = "nurvo_ios_install_dismissed";
function passtDieUmgebung(): boolean {
    try {
        if (localStorage.getItem(DISMISS_KEY) === "1")
            return false;
        const ua = window.navigator.userAgent;
        const isIOS = /iphone|ipad|ipod/i.test(ua);
        const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
            (window.navigator as unknown as {
                standalone?: boolean;
            }).standalone === true;
        const isSafari = /^((?!crios|fxios|edgios).)*safari/i.test(ua);
        return isIOS && isSafari && !standalone;
    }
    catch {
        return false;
    }
}
const nichtsAbonnieren = () => () => { };
const aufDemServerNie = () => false;
export default function IOSInstallHint() {
    const passt = useSyncExternalStore(nichtsAbonnieren, passtDieUmgebung, aufDemServerNie);
    const [weggeklickt, setWeggeklickt] = useState(false);
    const show = passt && !weggeklickt;
    if (!show)
        return null;
    return (<div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="bg-[var(--papier)] rounded-2xl  border border-[var(--linie)] p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--akzent)] flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>ios_share</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[var(--tinte)]">Nurvo als App installieren</p>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 leading-relaxed">
              Tippe unten auf <span className="inline-flex items-center gap-0.5 font-medium text-[var(--akzent)]">
                Teilen <span className="material-symbols-outlined" style={{ fontSize: 13 }}>ios_share</span>
              </span> und dann auf <strong>„Zum Home-Bildschirm“</strong>. Danach startet Nurvo wie eine echte App.
            </p>
          </div>
          <button onClick={() => { try {
        localStorage.setItem(DISMISS_KEY, "1");
    }
    catch { } setWeggeklickt(true); }} className="text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)] flex-shrink-0" aria-label="Hinweis schließen">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      </div>
    </div>);
}

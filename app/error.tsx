"use client";
import { useEffect } from "react";
export default function Error({ error, unstable_retry, }: {
    error: Error & {
        digest?: string;
    };
    unstable_retry: () => void;
}) {
    useEffect(() => {
        console.error("[nurvo:error-boundary]", error.digest ?? "", error.message);
    }, [error]);
    return (<div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-white rounded-2xl border border-[var(--linie)] shadow-sm p-8">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-red-600" aria-hidden>error</span>
        </div>
        <h2 className="text-lg font-semibold text-[var(--tinte)]">Etwas ist schiefgelaufen</h2>
        <p className="text-[13px] text-[var(--tinte-leise)] mt-1.5 leading-snug">
          Dieser Bereich konnte nicht geladen werden. Deine Daten sind sicher — versuche es bitte erneut.
        </p>
        {error.digest && (<p className="text-[13px] text-[var(--tinte-leise)] mt-3 font-mono">Fehler-Code: {error.digest}</p>)}
        <div className="flex gap-2 mt-6">
          <button onClick={() => unstable_retry()} className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
            Erneut versuchen
          </button>
          <a href="/dashboard" className="flex-1 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors flex items-center justify-center">
            Zum Dashboard
          </a>
        </div>
      </div>
    </div>);
}

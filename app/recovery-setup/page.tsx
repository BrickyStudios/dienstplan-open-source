"use client";
import Wortmarke from "@/components/Wortmarke";
export const dynamic = "force-dynamic";
import { PulseLoader } from "@/components/PulseLoader";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function RecoverySetupPage() {
    const [checking, setChecking] = useState(true);
    const [phrase, setPhrase] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");
    const [finishing, setFinishing] = useState(false);
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                window.location.href = "/login";
                return;
            }
            setChecking(false);
        });
    }, []);
    async function generate() {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/user/recovery", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.recovery_phrase) {
                setPhrase(data.recovery_phrase);
            }
            else {
                setError(data.error ?? "Phrase konnte nicht erstellt werden. Bitte erneut versuchen.");
            }
        }
        catch {
            setError("Server nicht erreichbar. Bitte erneut versuchen.");
        }
        setLoading(false);
    }
    async function finish() {
        setFinishing(true);
        let target = "/dashboard";
        try {
            const res = await fetch("/api/auth/admin-check");
            const { isAdmin, role } = await res.json();
            target = isAdmin ? "/admin" : role === "mitarbeiter" ? "/mein-dashboard" : "/dashboard";
        }
        catch { }
        window.location.href = target;
    }
    if (checking) {
        return (<div className="min-h-svh flex items-center justify-center bg-[var(--papier-tief)]">
        <PulseLoader size={24}/>
      </div>);
    }
    return (<div className="min-h-svh flex items-center justify-center px-4 bg-[var(--papier-tief)]">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <Wortmarke className="text-[var(--tinte)] font-semibold text-2xl tracking-tight"/>
          </div>
        </div>

        <div className="bg-[var(--papier)] rounded-2xl  border border-[var(--linie)] p-8">
          <div className="w-12 h-12 bg-[var(--akzent)]/10 rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 24 }}>key</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--tinte)] mb-1">Wiederherstellungs-Phrase einrichten</h1>
          <p className="text-[var(--tinte-leise)] text-sm mb-6">
            Bevor es weitergeht, richte deine Wiederherstellungs-Phrase ein. Sie ist der <strong>einzige</strong>
            Weg, dein Passwort ohne Anmeldung zurückzusetzen — es gibt keinen Reset per E-Mail. Dieser Schritt
            ist <strong>verpflichtend</strong>.
          </p>

          {!phrase ? (<>
              {error && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-sm px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>)}
              <button type="button" onClick={generate} disabled={loading} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <PulseLoader size={16}/>}
                {loading ? "Wird erstellt…" : "Phrase jetzt erstellen"}
              </button>
            </>) : (<>
              <div className="rounded-xl border-2 border-dashed border-[var(--akzent)]/40 bg-[var(--akzent)]/5 px-4 py-4 mb-3">
                <p className="text-center font-mono text-[14px] font-semibold text-[var(--tinte)] leading-relaxed break-words">
                  {phrase}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-3 py-2 rounded-lg mb-4">
                <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 14 }}>warning</span>
                Wird nur einmal angezeigt. Notiere sie jetzt sicher.
              </div>

              <button type="button" onClick={() => {
                navigator.clipboard?.writeText(phrase).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => { });
            }} className="w-full py-2.5 mb-4 border border-[var(--linie)] rounded-lg text-sm font-medium text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors flex items-center justify-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{copied ? "check" : "content_copy"}</span>
                {copied ? "Kopiert!" : "Phrase kopieren"}
              </button>

              <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
                <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--akzent)]"/>
                <span className="text-sm text-[var(--tinte-matt)]">
                  Ich habe die Wiederherstellungs-Phrase sicher notiert.
                </span>
              </label>

              <button type="button" disabled={!saved || finishing} onClick={finish} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {finishing && <PulseLoader size={16}/>}
                {finishing ? "Weiter…" : "Weiter zur App"}
              </button>
            </>)}
        </div>

        <p className="text-center text-[13px] text-[var(--tinte-leise)] mt-6">
          DSGVO-konform · Hosting in der EU
        </p>
      </div>
    </div>);
}

"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PulseLoader } from "@/components/PulseLoader";
export default function EmailCodeBestaetigen({ email, onBestaetigt, }: {
    email: string;
    onBestaetigt: () => void | Promise<void>;
}) {
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hinweis, setHinweis] = useState("");
    const ziffern = code.replace(/\D/g, "");
    async function pruefen(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setHinweis("");
        const supabase = createClient();
        const { error: fehler } = await supabase.auth.verifyOtp({ email, token: ziffern, type: "email" });
        if (fehler) {
            setError(/expired|invalid/i.test(fehler.message)
                ? "Der Code stimmt nicht oder ist abgelaufen. Bitte prüfen Sie die Ziffern oder lassen Sie sich einen neuen schicken."
                : fehler.message);
            setLoading(false);
            return;
        }
        await onBestaetigt();
    }
    async function neuSenden() {
        setError("");
        setHinweis("");
        const supabase = createClient();
        const { error: fehler } = await supabase.auth.resend({ type: "signup", email });
        if (fehler) {
            setError(/rate limit|seconds/i.test(fehler.message)
                ? "Bitte warten Sie eine Minute, bevor Sie einen neuen Code anfordern."
                : fehler.message);
            return;
        }
        setHinweis("Ein neuer Code ist unterwegs.");
    }
    return (<form onSubmit={pruefen} className="space-y-4">
      <p className="text-[14px] text-[var(--tinte-matt)] leading-relaxed">
        Wir haben Ihnen einen Bestätigungscode an <strong className="text-[var(--tinte)]">{email}</strong> geschickt.
        Geben Sie ihn hier ein, um Ihr Konto zu aktivieren.
      </p>
      <label htmlFor="email-code" className="sr-only">Bestätigungscode</label>
      <input id="email-code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={e => setCode(e.target.value)} placeholder="123456" className="w-full px-4 py-3 bg-[var(--papier)] border border-[var(--linie)] rounded-lg text-[18px] font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:border-[var(--akzent)] transition"/>
      {error && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-sm px-4 py-3 rounded-lg">{error}</div>)}
      {hinweis && (<div className="bg-[var(--akzent-flaeche)] border border-[var(--linie)] text-[var(--akzent)] text-sm px-4 py-3 rounded-lg">{hinweis}</div>)}
      <button type="submit" disabled={loading || ziffern.length < 6} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? <PulseLoader size={16}/> : "Bestätigen"}
      </button>
      <button type="button" onClick={neuSenden} className="w-full text-sm text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)] text-center">
        Keinen Code bekommen? Neu senden
      </button>
    </form>);
}

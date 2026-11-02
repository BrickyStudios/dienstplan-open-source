"use client";
import Wortmarke from "@/components/Wortmarke";
export const dynamic = "force-dynamic";
import { PulseLoader } from "@/components/PulseLoader";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sicheresZiel } from "@/lib/safe-redirect";
import { useLang } from "@/lib/LanguageContext";
import EmailCodeBestaetigen from "@/components/EmailCodeBestaetigen";
function fehlversuchMelden(email: string, stufe: "passwort" | "zweiter_faktor") {
    fetch("/api/sicherheit/anmeldung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, stufe }),
        keepalive: true,
    }).catch(() => { });
}
async function passwortGeleakt(password: string): Promise<boolean> {
    const frage = fetch("/api/user/passwort-leak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    })
        .then(r => (r.ok ? r.json() : { geleakt: false }))
        .then((d: {
        geleakt?: boolean;
    }) => d.geleakt === true)
        .catch(() => false);
    const frist = new Promise<boolean>(fertig => setTimeout(() => fertig(false), 2000));
    return Promise.race([frage, frist]);
}
function LoginForm() {
    const { t } = useLang();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirect");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const isDesktop = searchParams.get("app") === "1";
    const [mfaFaktor, setMfaFaktor] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const [unbestaetigt, setUnbestaetigt] = useState(false);
    const leakPruefung = useRef<Promise<boolean> | null>(null);
    useEffect(() => {
        if (searchParams.get("zweiter_faktor") !== "1")
            return;
        const supabase = createClient();
        supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(async ({ data }) => {
            if (!data || data.nextLevel !== "aal2" || data.currentLevel === "aal2")
                return;
            const { data: faktoren } = await supabase.auth.mfa.listFactors();
            const totp = (faktoren?.totp ?? []).find((f) => f.status === "verified");
            if (totp)
                setMfaFaktor(totp.id);
        });
    }, [searchParams]);
    function loginErrorText(err: {
        message?: string;
        status?: number;
    }): string {
        const msg = (err.message ?? "").toLowerCase();
        if (msg.includes("email not confirmed"))
            return t("auth.login.errEmail");
        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
            return t("auth.login.errPwd");
        }
        if (!err.status || msg.includes("fetch") || msg.includes("network") || msg.includes("load failed")) {
            return t("auth.login.errNet");
        }
        return `${t("auth.login.errUnexpected")} ${err.message ?? ""}`.trim();
    }
    async function weiter() {
        const res = await fetch("/api/auth/admin-check");
        const { isAdmin, role } = await res.json();
        if (!isAdmin && leakPruefung.current && await leakPruefung.current) {
            window.location.href = "/einstellungen?hinweis=passwort-geleakt";
            return;
        }
        const safeRedirect = redirectTo ? sicheresZiel(redirectTo, window.location.href, "") || null : null;
        if (safeRedirect) {
            window.location.href = safeRedirect;
        }
        else if (isAdmin) {
            window.location.href = "/admin";
        }
        else if (role === "demo") {
            window.location.href = "/dashboard";
        }
        else if (role === "mitarbeiter") {
            window.location.href = "/mein-dashboard";
        }
        else {
            window.location.href = "/dashboard";
        }
    }
    async function faktorNoetig(supabase: ReturnType<typeof createClient>): Promise<string | null> {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || !data)
            return null;
        if (data.nextLevel !== "aal2" || data.currentLevel === data.nextLevel)
            return null;
        const { data: faktoren } = await supabase.auth.mfa.listFactors();
        const totp = (faktoren?.totp ?? []).find((f) => f.status === "verified");
        return totp?.id ?? null;
    }
    async function handleMfa(e: React.FormEvent) {
        e.preventDefault();
        if (!mfaFaktor)
            return;
        setLoading(true);
        setError("");
        try {
            const supabase = createClient();
            const { data: ch, error: chFehler } = await supabase.auth.mfa.challenge({
                factorId: mfaFaktor,
            });
            if (chFehler || !ch) {
                setError(chFehler?.message ?? t("auth.login.errUnexpected"));
                setLoading(false);
                return;
            }
            const { error: pruefFehler } = await supabase.auth.mfa.verify({
                factorId: mfaFaktor,
                challengeId: ch.id,
                code: mfaCode.replace(/\s/g, ""),
            });
            if (pruefFehler) {
                setError("Die Zahl stimmt nicht. Sie wechselt alle 30 Sekunden — bitte die aktuelle eingeben.");
                setLoading(false);
                fehlversuchMelden(email, "zweiter_faktor");
                return;
            }
            await weiter();
        }
        catch (err) {
            setError(`${t("auth.login.errUnexpected")} ${(err as Error)?.message ?? String(err)}`.trim());
            setLoading(false);
        }
    }
    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if ((error.message ?? "").toLowerCase().includes("email not confirmed")) {
                    await supabase.auth.resend({ type: "signup", email }).catch(() => { });
                    setUnbestaetigt(true);
                    setLoading(false);
                    return;
                }
                setError(loginErrorText(error));
                setLoading(false);
                fehlversuchMelden(email, "passwort");
                return;
            }
            leakPruefung.current = passwortGeleakt(password);
            const faktorId = await faktorNoetig(supabase);
            if (faktorId) {
                setMfaFaktor(faktorId);
                setLoading(false);
                return;
            }
            await weiter();
        }
        catch (e) {
            setError(`${t("auth.login.errUnexpected")} ${(e as Error)?.message ?? String(e)}`.trim());
            setLoading(false);
        }
    }
    return (<main className="hoehe-ohne-hinweis flex flex-col md:flex-row" style={{ background: "var(--papier-tief)" }}>

      
      <section className={`${isDesktop ? "hidden" : "hidden md:flex"} md:w-1/2 flex-col justify-between p-10 border-r border-[var(--linie)]`} style={{ background: "var(--papier)" }}>
        
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Wortmarke className="font-semibold text-[var(--tinte)] text-xl tracking-tight"/>
        </Link>

        
        <div className="space-y-8">
          <div className="inline-flex items-center px-3 py-1.5 bg-[var(--akzent-flaeche)] border border-[var(--akzent)]/30 rounded-sm">
            <span className="material-symbols-outlined text-[var(--akzent)] mr-1.5" style={{ fontSize: 16 }}>fact_check</span>
            <span className="text-[13px] font-medium text-[var(--akzent)]">Besetzungsnachweis</span>
          </div>

          <div>
            <h1 className="stimme text-[var(--tinte)] text-4xl leading-tight mb-4 max-w-sm" style={{ letterSpacing: "-0.02em" }}>
              Der Nachweis entsteht beim Planen, nicht am Monatsende.
            </h1>
            <p className="text-[var(--tinte-matt)] text-base leading-relaxed max-w-sm">
              Soll und Ist stehen schichtgenau nebeneinander, solange sich noch etwas ändern lässt. Der Export nach PPBV oder § 113c SGB XI ist dann nur noch ein Knopf.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[var(--papier-tief)] border border-[var(--linie)] rounded-sm">
              <span className="material-symbols-outlined text-[var(--akzent)] mb-2 block" style={{ fontSize: 20 }}>fact_check</span>
              <div className="text-[var(--tinte)] text-2xl font-semibold tabular-nums">1 Klick</div>
              <div className="text-[var(--tinte-leise)] text-[13px] mt-0.5">zum Besetzungsnachweis</div>
            </div>
            <div className="p-4 bg-[var(--papier-tief)] border border-[var(--linie)] rounded-sm">
              <span className="material-symbols-outlined text-[var(--akzent)] mb-2 block" style={{ fontSize: 20 }}>gavel</span>
              <div className="text-[var(--tinte)] text-2xl font-semibold">§ 5 ArbZG</div>
              <div className="text-[var(--tinte-leise)] text-[13px] mt-0.5">beim Planen geprüft</div>
            </div>
          </div>
        </div>

        
        <div className="border-t border-[var(--linie)] pt-6">
          <p className="text-[var(--tinte-matt)] text-[13px]">
            Nurvo Community Edition, kostenlos und selbst betrieben.
          </p>
          <p className="text-[var(--tinte-leise)] text-[13px] mt-1">
            Mit App, KI und Betrieb durch uns:{" "}
            <a href="https://www.nurvo.de" target="_blank" rel="noopener" className="text-[var(--akzent)] font-semibold hover:underline">nurvo.de</a>
          </p>
        </div>
      </section>

      
      <section className="flex-1 flex flex-col justify-center items-center px-6 md:px-10 py-10 bg-[var(--papier-tief)]">
        <div className="w-full max-w-[400px] space-y-7">

          
          <Link href="/" className="md:hidden flex flex-col items-center mb-2 hover:opacity-80 transition-opacity">
            <Wortmarke className="font-semibold text-[var(--tinte)] text-2xl tracking-tight"/>
          </Link>

          
          <div>
            <h2 className="text-2xl font-semibold text-[var(--tinte)]">{t("auth.login.title")}</h2>
            <p className="text-[14px] text-[var(--tinte-matt)] mt-1">{t("auth.login.subtitle")}</p>
          </div>

          
          {unbestaetigt ? (<EmailCodeBestaetigen email={email} onBestaetigt={weiter}/>) : mfaFaktor ? (<form onSubmit={handleMfa} className="space-y-4">
              <p className="text-[14px] text-[var(--tinte-matt)] leading-relaxed">
                Dieses Konto ist mit einem zweiten Faktor geschützt. Bitte die
                sechsstellige Zahl aus der Authenticator-App eingeben — sie wechselt alle
                30 Sekunden.
              </p>
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder="123456" className="w-full px-4 py-3 bg-[var(--papier)] border border-[var(--linie)] rounded-lg text-[18px] font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:border-[var(--akzent)] transition"/>
              {error && (<div className="flex items-start gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                  <span>{error}</span>
                </div>)}
              <button type="submit" disabled={loading || mfaCode.replace(/\s/g, "").length < 6} className="w-full py-3 bg-[var(--akzent)] text-white text-[14px] font-semibold rounded-lg hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                {loading ? <PulseLoader size={14}/> : "Bestätigen"}
              </button>
              <p className="text-[13px] text-[var(--tinte-leise)] leading-relaxed">
                Telefon weg? Dann hilft die Wiederherstellungs-Phrase weiter:{" "}
                <Link href="/passwort-vergessen" className="text-[var(--akzent)] hover:underline">
                  Passwort zurücksetzen
                </Link>
                . Ist auch die weg, stellt die Leitung eine neue aus.
              </p>
            </form>) : (<>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[var(--tinte-matt)]" htmlFor="email">
                {t("auth.login.email")}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>mail</span>
                <input id="email" type="email" enterKeyHint="next" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@klinik.de" className="w-full pl-10 pr-4 py-3 bg-[var(--papier)] border border-[var(--linie)] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:border-[var(--akzent)] transition"/>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[13px] font-medium text-[var(--tinte-matt)]" htmlFor="password">
                  {t("auth.login.password")}
                </label>
                <Link href="/passwort-vergessen" className="text-[13px] text-[var(--akzent)] hover:underline">
                  Vergessen?
                </Link>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>lock</span>
                <input id="password" type={showPassword ? "text" : "password"} enterKeyHint="go" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full pl-10 pr-16 py-3 bg-[var(--papier)] border border-[var(--linie)] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:border-[var(--akzent)] transition"/>
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-[var(--akzent)] hover:text-[var(--akzent-tief)]">
                  {showPassword ? t("auth.login.hide") : t("auth.login.show")}
                </button>
              </div>
            </div>

            {error && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-[13px] px-4 py-3 rounded-lg">
                {error}
              </div>)}

            <button type="submit" disabled={loading} className="w-full py-3 bg-[var(--akzent)] text-white font-semibold rounded-lg text-[14px] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2  active:scale-[0.98]">
              {loading && (<PulseLoader size={16}/>)}
              {loading ? t("auth.login.loading") : t("auth.login.submit")}
            </button>
          </form>

          
          <p className="text-center text-[13px] text-[var(--tinte-matt)]">
            {t("auth.login.noAccount")}{" "}
            <Link href="/register" className="text-[var(--akzent)] font-medium hover:underline">
              {t("auth.login.register")}
            </Link>
          </p>
          </>)}
          {!isDesktop && (<div className="flex flex-wrap justify-center gap-4 text-[13px] text-[var(--tinte-matt)]">
              <Link href="/" className="hover:text-[var(--akzent)]">← Zur Website</Link>
            </div>)}
        </div>
      </section>

      
    </main>);
}
export default function LoginPage() {
    return (<Suspense>
      <LoginForm />
    </Suspense>);
}

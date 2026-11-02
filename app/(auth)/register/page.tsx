"use client";
import Wortmarke from "@/components/Wortmarke";
import { PulseLoader } from "@/components/PulseLoader";
export const dynamic = "force-dynamic";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Key, Building2, Shield, User, ArrowLeft, Mail } from "lucide-react";
import { useLang } from "@/lib/LanguageContext";
import PasswordStrength from "@/components/PasswordStrength";
import { passwordOk, PASSWORD_HINT } from "@/lib/password";
import { passwortPruefen } from "@/lib/passwort-pruefen";
import { clientSiteUrl } from "@/lib/site-url";
import EmailCodeBestaetigen from "@/components/EmailCodeBestaetigen";
type Step = "code" | "details" | "bestaetigen";
type CodeInfo = {
    role: "leitung" | "mitarbeiter" | "admin" | "demo";
    facility_id: string | null;
    facility_name: string;
    code: string;
    preset_password?: string;
    preset_name?: string;
    preset_email?: string;
    preset_first_name?: string;
    preset_last_name?: string;
    invited_email?: string;
};
function signUpFehler(message: string): string {
    if (/sending confirmation email/i.test(message))
        return "Die Bestätigungs-E-Mail konnte gerade nicht verschickt werden. Das liegt nicht an Ihren Angaben — bitte versuchen Sie es später erneut oder wenden Sie sich an Ihre Leitung.";
    if (/rate limit/i.test(message))
        return "Gerade wurden zu viele E-Mails verschickt. Bitte versuchen Sie es in einer Stunde erneut.";
    if (/already registered/i.test(message))
        return "Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an.";
    return message;
}
function RegisterForm() {
    const searchParams = useSearchParams();
    const adminPreview = searchParams.get("preview") === "1";
    const previewCode = searchParams.get("code") ?? "";
    const inviteCode = searchParams.get("invite_code") ?? "";
    const { t } = useLang();
    const [step, setStep] = useState<Step>(adminPreview ? "details" : "code");
    const [codeInput, setCodeInput] = useState("");
    const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(adminPreview ? { role: "demo", facility_id: null, facility_name: "Admin-Vorschau", code: previewCode } : null);
    const [codeError, setCodeError] = useState("");
    const [codeLoading, setCodeLoading] = useState(!!inviteCode);
    const [invitedFlow, setInvitedFlow] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
    const [postRedirect, setPostRedirect] = useState("/mein-plan");
    const [phraseSaved, setPhraseSaved] = useState(false);
    const [phraseCopied, setPhraseCopied] = useState(false);
    const [offenePhrase, setOffenePhrase] = useState<string | null>(null);
    useEffect(() => {
        if (!inviteCode)
            return;
        const supabase = createClient();
        Promise.all([
            fetch("/api/invite/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: inviteCode }),
            }).then(r => r.json()),
            supabase.auth.getUser(),
        ])
            .then(([data, { data: { user } }]) => {
            if (data.valid) {
                setCodeInfo(data as CodeInfo);
                setForm(f => ({ ...f, name: data.preset_name ?? "", email: data.preset_email ?? f.email }));
                setInvitedFlow(!!user);
                setStep("details");
            }
            else {
                setCodeError(data.error ?? "Ungültiger Einladungslink");
            }
        })
            .catch(() => setCodeError("Einladungslink konnte nicht geprüft werden"))
            .finally(() => setCodeLoading(false));
    }, []);
    const isDemo = codeInfo?.role === "demo";
    async function handleCodeValidate(e: React.FormEvent) {
        e.preventDefault();
        setCodeLoading(true);
        setCodeError("");
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch("/api/invite/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: codeInput }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            let data: {
                error?: string;
                valid?: boolean;
                role?: string;
                facility_id?: string;
                facility_name?: string;
                code?: string;
            };
            try {
                data = await res.json();
            }
            catch {
                setCodeError(`Server-Fehler (HTTP ${res.status})`);
                return;
            }
            if (!res.ok) {
                setCodeError(data.error || "Ungültiger Code");
                return;
            }
            const info = data as CodeInfo;
            setCodeInfo(info);
            if (info.preset_name || info.preset_email) {
                setForm(f => ({ ...f, name: info.preset_name ?? f.name, email: info.preset_email ?? f.email }));
            }
            setStep("details");
        }
        catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") {
                setCodeError("Zeitüberschreitung — Supabase antwortet nicht.");
            }
            else {
                setCodeError("API-Route nicht erreichbar.");
            }
        }
        finally {
            setCodeLoading(false);
        }
    }
    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        if (!codeInfo)
            return;
        setLoading(true);
        setError("");
        try {
            await registrieren();
        }
        catch {
            setError("Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.");
            setLoading(false);
        }
    }
    async function registrieren() {
        if (!codeInfo)
            return;
        if (adminPreview) {
            const res = await fetch("/api/demo/preview-seed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: previewCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Fehler beim Laden der Demo");
                setLoading(false);
                return;
            }
            window.location.href = "/dashboard";
            return;
        }
        if (isDemo) {
            const res = await fetch("/api/demo/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: codeInfo.code,
                    name: "Demo Nutzer",
                    emailRaw: form.email,
                    password: codeInfo.preset_password || form.password || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Registrierung fehlgeschlagen");
                setLoading(false);
                return;
            }
            const supabase = createClient();
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: data.email,
                password: data.password,
            });
            if (signInErr) {
                setError(signInErr.message);
                setLoading(false);
                return;
            }
            await fetch("/api/auth/admin-check").catch(() => { });
            window.location.href = "/dashboard";
            return;
        }
        if (invitedFlow) {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setError("Ihre Sitzung ist abgelaufen. Bitte klicken Sie erneut auf den Link in Ihrer Einladungs-E-Mail.");
                setLoading(false);
                return;
            }
            if (!passwordOk(form.password)) {
                setError(PASSWORD_HINT);
                setLoading(false);
                return;
            }
            {
                const befund = await passwortPruefen(form.password);
                if (befund && !befund.ok) {
                    setError(befund.hinweis ?? PASSWORD_HINT);
                    setLoading(false);
                    return;
                }
            }
            const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
            if (updateError) {
                setError(updateError.message);
                setLoading(false);
                return;
            }
            const redeemRes = await fetch("/api/invite/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: codeInfo.code,
                    user_id: user.id,
                    full_name: form.name,
                    role: codeInfo.role,
                    facility_name: codeInfo.facility_name,
                }),
            });
            const redeemData = await redeemRes.json().catch(() => ({}));
            if (!redeemRes.ok) {
                setError(redeemData.error ?? "Einladung konnte nicht eingelöst werden");
                setLoading(false);
                return;
            }
            if (redeemData.recovery_phrase) {
                setPostRedirect("/mein-plan");
                setRecoveryPhrase(redeemData.recovery_phrase);
                setLoading(false);
                return;
            }
            window.location.href = "/mein-plan";
            return;
        }
        const supabase = createClient();
        if (!passwordOk(form.password)) {
            setError(PASSWORD_HINT);
            setLoading(false);
            return;
        }
        {
            const befund = await passwortPruefen(form.password);
            if (befund && !befund.ok) {
                setError(befund.hinweis ?? PASSWORD_HINT);
                setLoading(false);
                return;
            }
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
                emailRedirectTo: `${clientSiteUrl({ erlaubeLokal: true })}/auth/callback`,
                data: {
                    full_name: form.name,
                    role: codeInfo.role,
                    facility: codeInfo.facility_name,
                    facility_id: codeInfo.facility_id,
                },
            },
        });
        if (signUpError) {
            setError(signUpFehler(signUpError.message));
            setLoading(false);
            return;
        }
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            setError("Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte melden Sie sich damit an oder registrieren Sie sich mit einer anderen Adresse — der Einladungscode bleibt gültig.");
            setLoading(false);
            return;
        }
        let phrase: string | null = null;
        if (data.user) {
            const redeemRes = await fetch("/api/invite/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: codeInfo.code,
                    user_id: data.user.id,
                    full_name: form.name,
                    role: codeInfo.role,
                    facility_name: codeInfo.facility_name,
                }),
            });
            const redeemData = await redeemRes.json().catch(() => ({}));
            if (!redeemRes.ok) {
                setError(redeemData.error ?? "Einladungscode konnte nicht eingelöst werden");
                setLoading(false);
                return;
            }
            phrase = redeemData.recovery_phrase ?? null;
        }
        if (!data.session) {
            setOffenePhrase(phrase);
            setStep("bestaetigen");
            setLoading(false);
            return;
        }
        await abschliessen(phrase);
    }
    async function abschliessen(phrase: string | null) {
        if (!codeInfo)
            return;
        const checkRes = await fetch("/api/auth/admin-check");
        const { isAdmin } = await checkRes.json();
        const target = isAdmin ? "/admin" : codeInfo.role === "mitarbeiter" ? "/mein-plan" : "/dashboard";
        if (phrase) {
            setPostRedirect(target);
            setRecoveryPhrase(phrase);
            setLoading(false);
            return;
        }
        window.location.href = target;
    }
    return (<div className="hoehe-ohne-hinweis flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md">
      
      <div className="flex justify-center mb-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Wortmarke className="text-[var(--tinte)] font-semibold text-2xl tracking-tight"/>
        </Link>
      </div>

      <div className="bg-[var(--papier)] rounded-2xl  border border-[var(--linie)] p-8">

        
        {recoveryPhrase ? (<div>
            <div className="w-12 h-12 bg-[var(--akzent)]/10 rounded-full flex items-center justify-center mb-4">
              <Key size={22} className="text-[var(--akzent)]"/>
            </div>
            <h1 className="text-xl font-semibold text-[var(--tinte)] mb-1">Ihre Wiederherstellungs-Phrase</h1>
            <p className="text-[var(--tinte-leise)] text-sm mb-5">
              Notieren Sie diese Wörter (mit Bindestrichen) und bewahren Sie sie sicher auf. Nur damit können Sie Ihr Passwort
              zurücksetzen — es gibt <strong>keinen</strong> E-Mail-Reset. Wir zeigen sie <strong>nur dieses eine Mal</strong>.
            </p>

            <div className="rounded-xl border-2 border-dashed border-[var(--akzent)]/40 bg-[var(--akzent)]/5 px-4 py-5 mb-4">
              <p className="text-center font-mono text-[14px] font-semibold text-[var(--tinte)] leading-relaxed break-words">
                {recoveryPhrase}
              </p>
            </div>

            <button type="button" onClick={() => {
                navigator.clipboard?.writeText(recoveryPhrase).then(() => { setPhraseCopied(true); setTimeout(() => setPhraseCopied(false), 2000); }, () => { });
            }} className="w-full py-2.5 mb-4 border border-[var(--linie)] rounded-lg text-sm font-medium text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors flex items-center justify-center gap-2">
              <CheckCircle size={15} className={phraseCopied ? "text-[var(--ok)]" : "text-[var(--tinte-leise)]"}/>
              {phraseCopied ? "Kopiert!" : "Phrase kopieren"}
            </button>

            <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
              <input type="checkbox" checked={phraseSaved} onChange={e => setPhraseSaved(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--akzent)]"/>
              <span className="text-sm text-[var(--tinte-matt)]">
                Ich habe die Wiederherstellungs-Phrase sicher notiert.
              </span>
            </label>

            <button type="button" disabled={!phraseSaved} onClick={() => { window.location.href = postRedirect; }} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Weiter
            </button>
          </div>) : (<>

        
        {step === "code" && (<>
            {codeLoading ? (<div className="flex flex-col items-center py-10 gap-3 text-[var(--tinte-leise)]">
                <PulseLoader size={24}/>
                <p className="text-sm">Einladung wird geprüft…</p>
              </div>) : (<>
                <h1 className="text-xl font-semibold text-[var(--tinte)] mb-1">{t("auth.register.title")}</h1>
                <p className="text-[var(--tinte-leise)] text-sm mb-6">{t("auth.register.subtitle")}</p>

                <form onSubmit={handleCodeValidate} className="space-y-4">
                  <div>
                    <label htmlFor="register-codelabel" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">{t("auth.register.codeLabel")}</label>
                    <div className="relative">
                      <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-leise)]"/>
                      <input id="register-codelabel" type="text" required value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} placeholder="z.B. NRV-XYZABC" className="w-full pl-10 pr-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)] uppercase"/>
                    </div>
                  </div>

                  {codeError && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-sm px-4 py-3 rounded-lg">
                      {codeError}
                    </div>)}

                  <button type="submit" disabled={codeLoading} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {codeLoading && <PulseLoader size={16}/>}
                    {codeLoading ? t("auth.register.checking") : t("auth.register.checkCode")}
                  </button>
                </form>
              </>)}
          </>)}

        
        {step === "bestaetigen" && (<>
            <h1 className="text-xl font-semibold text-[var(--tinte)] mb-4">E-Mail bestätigen</h1>
            <EmailCodeBestaetigen email={form.email} onBestaetigt={() => abschliessen(offenePhrase)}/>
          </>)}

        
        {step === "details" && codeInfo && (<>
            {adminPreview && (<div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-5 bg-[var(--warnung-flaeche)] border border-[var(--linie)]">
                <span className="text-[var(--warnung)] text-[13px] font-semibold uppercase tracking-wider">Admin-Vorschau</span>
                <span className="text-[var(--warnung)] text-[13px]">· Code wird nicht eingelöst ·</span>
                <a href="/admin" className="ml-auto flex items-center gap-1 text-[13px] text-[var(--warnung)] hover:text-[var(--warnung)] font-medium">
                  <ArrowLeft size={11}/> Zurück
                </a>
              </div>)}
            <h1 className="text-xl font-semibold text-[var(--tinte)] mb-1">
              {invitedFlow ? "Einladung annehmen" : isDemo ? (adminPreview ? "Demo laden" : "Demo starten") : t("auth.register.createTitle")}
            </h1>
            <p className="text-[var(--tinte-leise)] text-sm mb-5">
              {invitedFlow
                    ? "Legen Sie Ihren Namen und ein Passwort für zukünftige Anmeldungen fest."
                    : isDemo
                        ? (adminPreview ? "Testdaten werden befüllt — kein Account wird erstellt." : "Vollständige Demo-Umgebung — kein echter Account nötig.")
                        : t("auth.register.createSubtitle")}
            </p>

            
            {invitedFlow ? (<div className="flex items-start gap-3 p-3 rounded-xl mb-5 bg-[var(--akzent-flaeche)] border border-[var(--linie)]">
                <CheckCircle size={18} className="text-[var(--akzent)]"/>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--akzent)]">Persönliche Einladung</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 size={12} className="text-[var(--akzent)]"/>
                    <span className="text-[13px] text-[var(--akzent)]">{codeInfo.facility_name}</span>
                  </div>
                  {codeInfo.invited_email && (<div className="flex items-center gap-1.5 mt-0.5">
                      <Mail size={12} className="text-[var(--akzent)]"/>
                      <span className="text-[13px] text-[var(--akzent)]">{codeInfo.invited_email}</span>
                    </div>)}
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--akzent-flaeche)]">
                  <User size={16} className="text-[var(--akzent)]"/>
                </div>
              </div>) : codeInfo.role === "admin" ? (<div className="flex items-start gap-3 p-3 rounded-xl mb-5 bg-[var(--ki-flaeche)] border border-[var(--linie)]">
                <CheckCircle size={18} className="text-[var(--ki)]"/>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--ki)]">{t("auth.register.codeValid.admin")}</p>
                  <p className="text-[13px] text-[var(--ki)] mt-1">{t("auth.register.codeValid.adminHint")}</p>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--ki-flaeche)]">
                  <Shield size={16} className="text-[var(--ki)]"/>
                </div>
              </div>) : isDemo ? (<div className="flex items-start gap-3 p-3 rounded-xl mb-5 bg-[var(--akzent-flaeche)] border border-[var(--linie)]">
                <CheckCircle size={18} className="text-[var(--akzent)]"/>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--akzent)]">Demo-Zugang — volle Funktionen</p>
                  <p className="text-[13px] text-[var(--akzent)] mt-1">Schichtplan, Zeiterfassung, Mitarbeiterverwaltung und mehr sind vorausgefüllt.</p>
                </div>
              </div>) : (<div className={`flex items-start gap-3 p-3 rounded-xl mb-5 ${codeInfo.role === "leitung" ? "bg-[var(--akzent-flaeche)] border border-[var(--linie)]" : "bg-[var(--akzent-flaeche)] border border-[var(--linie)]"}`}>
                <CheckCircle size={18} className={codeInfo.role === "leitung" ? "text-[var(--akzent)]" : "text-[var(--akzent)]"}/>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${codeInfo.role === "leitung" ? "text-[var(--akzent)]" : "text-[var(--akzent)]"}`}>
                    {codeInfo.role === "leitung" ? t("auth.register.codeValid.leitung") : t("auth.register.codeValid.staff")}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 size={12} className={codeInfo.role === "leitung" ? "text-[var(--akzent)]" : "text-[var(--akzent)]"}/>
                    <span className={`text-[13px] ${codeInfo.role === "leitung" ? "text-[var(--akzent)]" : "text-[var(--akzent)]"}`}>
                      {codeInfo.facility_name}
                    </span>
                  </div>
                </div>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${codeInfo.role === "leitung" ? "bg-[var(--akzent-flaeche)]" : "bg-[var(--akzent-flaeche)]"}`}>
                  {codeInfo.role === "leitung" ? <Shield size={16} className="text-[var(--akzent)]"/> : <User size={16} className="text-[var(--akzent)]"/>}
                </div>
              </div>)}

            <form onSubmit={handleRegister} className="space-y-4">
              
              {!isDemo && (<div>
                  <label htmlFor="register-name" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">
                    {t("auth.register.name")}
                  </label>
                  <input id="register-name" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vorname Nachname" className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                </div>)}

              
              {!invitedFlow && !adminPreview && (<div>
                  <label htmlFor="register-emaillabel" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">
                    {isDemo ? "E-Mail" : t("auth.register.emailLabel")}
                  </label>
                  <input id="register-emaillabel" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={isDemo ? "name@beispiel.de" : "name@einrichtung.de"} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  {isDemo && (<p className="text-[13px] text-[var(--tinte-leise)] mt-1">
                      Bitte echte E-Mail angeben — wir nutzen sie nur für eine kurze Abschluss-Befragung am Ende der Demo.
                    </p>)}
                </div>)}

              
              {!isDemo && (<div>
                  <label htmlFor="register-passwordlabel" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">
                    {t("auth.register.passwordLabel")}
                  </label>
                  <div className="flex gap-2">
                    <input id="register-passwordlabel" type={showPassword ? "text" : "password"} required={!(isDemo && codeInfo?.preset_password)} minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={t("auth.register.passwordHint")} className="flex-1 px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[var(--tinte-leise)] hover:text-[var(--tinte)] hover:bg-[var(--papier-tief)] transition-colors text-[13px] font-medium flex-shrink-0">
                      {showPassword ? t("auth.login.hide") : t("auth.login.show")}
                    </button>
                  </div>
                  <PasswordStrength password={form.password}/>
                </div>)}

              {error && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-sm px-4 py-3 rounded-lg">{error}</div>)}

              <button type="submit" disabled={loading} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <PulseLoader size={16}/>}
                {loading
                    ? (isDemo ? "Wird vorbereitet…" : t("auth.register.creating"))
                    : (adminPreview ? "Demo laden →" : isDemo ? "Demo starten →" : t("auth.register.create"))}
              </button>

              
              <p className="text-[13px] text-[var(--tinte-leise)] text-center leading-relaxed">
                {!invitedFlow && !isDemo && (<>Mit der Registrierung gelten unsere{" "}.{" "}</>)}
                Wie wir Ihre Daten verarbeiten, steht in der{" "}.
              </p>

              {!invitedFlow && (<button type="button" onClick={() => setStep("code")} className="w-full text-sm text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)] text-center">
                  {t("auth.register.back")}
                </button>)}
            </form>
          </>)}

        <p className="text-center text-sm text-[var(--tinte-leise)] mt-6">
          {t("auth.register.haveAccount")}{" "}
          <Link href="/login" className="text-[var(--akzent)] font-medium hover:text-[var(--akzent)]">{t("auth.register.login")}</Link>
        </p>
        </>)}
      </div>

      <p className="text-center text-[13px] text-[var(--tinte-leise)] mt-6">{t("auth.footer")}</p>
    </div>
    </div>);
}
export default function RegisterPage() {
    return (<Suspense>
      <RegisterForm />
    </Suspense>);
}

"use client";
import Wortmarke from "@/components/Wortmarke";
import { PulseLoader } from "@/components/PulseLoader";
import { useState } from "react";
import Link from "next/link";
import PasswordStrength from "@/components/PasswordStrength";
import { passwordOk, PASSWORD_HINT } from "@/lib/password";
export default function PasswortVergessenPage() {
    const [email, setEmail] = useState("");
    const [phrase, setPhrase] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password !== passwordConfirm) {
            setError("Die Passwörter stimmen nicht überein.");
            return;
        }
        if (!passwordOk(password)) {
            setError(PASSWORD_HINT);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/recover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, phrase, newPassword: password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? "Zurücksetzen fehlgeschlagen. Bitte erneut versuchen.");
                setLoading(false);
                return;
            }
            setDone(true);
        }
        catch {
            setError("Server nicht erreichbar. Bitte erneut versuchen.");
        }
        setLoading(false);
    }
    return (<div className="hoehe-ohne-hinweis flex items-center justify-center px-4">
    <div className="w-full max-w-md">
      <div className="flex justify-center mb-8">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Wortmarke className="text-[var(--tinte)] font-semibold text-2xl tracking-tight"/>
        </Link>
      </div>

      <div className="bg-[var(--papier)] rounded-2xl  border border-[var(--linie)] p-8">
        {done ? (<div className="text-center">
            <div className="w-12 h-12 bg-[var(--ok-flaeche)] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 24 }}>check_circle</span>
            </div>
            <h1 className="text-xl font-semibold text-[var(--tinte)] mb-2">Passwort geändert</h1>
            <p className="text-[var(--tinte-leise)] text-sm mb-6">
              Sie können sich jetzt mit Ihrem neuen Passwort anmelden.
            </p>
            <Link href="/login" className="text-[var(--akzent)] font-medium hover:text-[var(--akzent)] text-sm">
              Zur Anmeldung
            </Link>
          </div>) : (<>
            <h1 className="text-xl font-semibold text-[var(--tinte)] mb-1">Passwort zurücksetzen</h1>
            <p className="text-[var(--tinte-leise)] text-sm mb-6">
              Geben Sie Ihre E-Mail und Ihre <strong>Wiederherstellungs-Phrase</strong> ein, um ein neues
              Passwort zu setzen. Einen Reset per E-Mail gibt es nicht — die Phrase haben Sie bei der
              Registrierung erhalten. Verlegt? Ihre Leitung kann Ihnen eine neue erzeugen.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="passwort-vergessen-e-mail-adresse" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">E-Mail Adresse</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>mail</span>
                  <input id="passwort-vergessen-e-mail-adresse" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@einrichtung.de" className="w-full pl-10 pr-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)] transition-colors"/>
                </div>
              </div>

              <div>
                <label htmlFor="passwort-vergessen-wiederherstellungs-phrase" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">Wiederherstellungs-Phrase</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-3 text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>key</span>
                  <textarea id="passwort-vergessen-wiederherstellungs-phrase" required rows={2} value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="die Wörter aus Ihrer Registrierung (mit Bindestrichen)" className="w-full pl-10 pr-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)] transition-colors resize-none"/>
                </div>
              </div>

              <div>
                <label htmlFor="passwort-vergessen-neues-passwort" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">Neues Passwort</label>
                <div className="flex gap-2">
                  <input id="passwort-vergessen-neues-passwort" type={showPassword ? "text" : "password"} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mind. 8 Zeichen" className="flex-1 px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[var(--tinte-leise)] hover:text-[var(--tinte)] hover:bg-[var(--papier-tief)] transition-colors text-[13px] font-medium flex-shrink-0">
                    {showPassword ? "Verbergen" : "Zeigen"}
                  </button>
                </div>
                <PasswordStrength password={password}/>
              </div>

              <div>
                <label htmlFor="passwort-vergessen-passwort-bestaetigen" className="block text-sm font-medium text-[var(--tinte-matt)] mb-1.5">Passwort bestätigen</label>
                <input id="passwort-vergessen-passwort-bestaetigen" type={showPassword ? "text" : "password"} required minLength={6} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="Passwort wiederholen" className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
              </div>

              {error && (<div className="bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[var(--gefahr)] text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>)}

              <button type="submit" disabled={loading} className="w-full py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <PulseLoader size={16}/>}
                {loading ? "Wird gesetzt…" : "Neues Passwort setzen"}
              </button>
            </form>
          </>)}

        <p className="text-center text-sm text-[var(--tinte-leise)] mt-6">
          <Link href="/login" className="text-[var(--akzent)] font-medium hover:text-[var(--akzent)]">
            ← Zurück zur Anmeldung
          </Link>
        </p>
      </div>

      <p className="text-center text-[13px] text-[var(--tinte-leise)] mt-6">
        DSGVO-konform · Hosting in der EU
      </p>
    </div>
    </div>);
}

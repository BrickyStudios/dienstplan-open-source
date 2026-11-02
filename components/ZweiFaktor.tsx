"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PulseLoader } from "@/components/PulseLoader";
type Faktor = {
    id: string;
    friendly_name?: string;
    status: string;
    created_at: string;
};
type Einrichtung = {
    faktorId: string;
    qr: string;
    geheim: string;
};
export default function ZweiFaktor({ pflicht }: {
    pflicht?: boolean;
}) {
    const supabase = createClient();
    const [faktoren, setFaktoren] = useState<Faktor[]>([]);
    const [laedt, setLaedt] = useState(true);
    const [neu, setNeu] = useState<Einrichtung | null>(null);
    const [zahl, setZahl] = useState("");
    const [fehler, setFehler] = useState("");
    const [meldung, setMeldung] = useState("");
    const [laeuft, setLaeuft] = useState(false);
    const holen = useCallback(async (): Promise<Faktor[]> => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        return error ? [] : ((data?.totp ?? []) as Faktor[]);
    }, [supabase]);
    const neuLaden = useCallback(async () => {
        setFaktoren(await holen());
    }, [holen]);
    useEffect(() => {
        let abgebrochen = false;
        holen().then((gefunden) => {
            if (abgebrochen)
                return;
            setFaktoren(gefunden);
            setLaedt(false);
        });
        return () => {
            abgebrochen = true;
        };
    }, [holen]);
    async function einrichten() {
        setFehler("");
        setMeldung("");
        setLaeuft(true);
        const { data, error } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: `Nurvo ${new Date().toLocaleDateString("de-DE")}`,
        });
        setLaeuft(false);
        if (error || !data) {
            setFehler(error?.message ??
                "Der zweite Faktor ließ sich nicht anlegen. Ist MFA in Supabase eingeschaltet?");
            return;
        }
        setNeu({ faktorId: data.id, qr: data.totp.qr_code, geheim: data.totp.secret });
    }
    async function bestaetigen() {
        if (!neu)
            return;
        setFehler("");
        setLaeuft(true);
        const { data: ch, error: chFehler } = await supabase.auth.mfa.challenge({
            factorId: neu.faktorId,
        });
        if (chFehler || !ch) {
            setLaeuft(false);
            setFehler(chFehler?.message ?? "Die Prüfung ließ sich nicht starten.");
            return;
        }
        const { error } = await supabase.auth.mfa.verify({
            factorId: neu.faktorId,
            challengeId: ch.id,
            code: zahl.replace(/\s/g, ""),
        });
        setLaeuft(false);
        if (error) {
            setFehler("Die Zahl stimmt nicht. Sie wechselt alle 30 Sekunden — bitte die aktuelle eingeben.");
            return;
        }
        setNeu(null);
        setZahl("");
        setMeldung("Der zweite Faktor ist eingerichtet. Ab der nächsten Anmeldung wird er abgefragt.");
        await neuLaden();
    }
    async function abbrechen() {
        if (!neu)
            return;
        await supabase.auth.mfa.unenroll({ factorId: neu.faktorId }).catch(() => { });
        setNeu(null);
        setZahl("");
        setFehler("");
        await neuLaden();
    }
    async function entfernen(id: string) {
        setFehler("");
        setLaeuft(true);
        const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
        setLaeuft(false);
        if (error) {
            setFehler(error.message);
            return;
        }
        setMeldung("Der zweite Faktor wurde entfernt.");
        await neuLaden();
    }
    const bestaetigte = faktoren.filter((f) => f.status === "verified");
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>
          verified_user
        </span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">
          Zweiter Faktor (Authenticator-App)
        </h2>
      </div>
      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed mb-4">
        Das Konto enthält Dienstplan, Lohnabrechnung und Personalakte — bei einer Leitung
        zusätzlich die Daten der ganzen Einrichtung. Mit einem zweiten Faktor reicht ein
        abgeschautes Passwort dafür nicht mehr: Bei der Anmeldung fragt Nurvo zusätzlich
        nach der Zahl aus der Authenticator-App.
      </p>

      {pflicht && bestaetigte.length === 0 && (<div className="flex items-start gap-2 text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg mb-4">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            warning
          </span>
          <span>
            Diese Einrichtung verlangt einen zweiten Faktor für Leitungskonten. Solange
            keiner eingerichtet ist, bleibt der Zugang eingeschränkt.
          </span>
        </div>)}

      {laedt ? (<PulseLoader size={14}/>) : neu ? (<div className="space-y-3">
          <p className="text-[13px] text-[var(--tinte)]">
            1. In der Authenticator-App (Aegis, 2FAS, Google Authenticator, …)
            &bdquo;Konto hinzufügen&ldquo; wählen und diesen Code scannen.
          </p>
          
          
          <img src={neu.qr} alt="QR-Code für die Authenticator-App" width={180} height={180} className="border border-[var(--linie)] rounded-lg bg-white p-2"/>
          <details className="text-[13px] text-[var(--tinte-matt)]">
            <summary className="cursor-pointer">Kein Scanner? Schlüssel zum Abtippen</summary>
            <code className="block mt-2 font-mono text-[13px] break-all text-[var(--tinte)]">
              {neu.geheim}
            </code>
          </details>
          <p className="text-[13px] text-[var(--tinte)]">
            2. Die sechsstellige Zahl aus der App eingeben. Sie wechselt alle 30 Sekunden.
          </p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={zahl} onChange={(e) => setZahl(e.target.value)} placeholder="123456" className="w-40 px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[15px] font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)] focus:bg-[var(--papier)]"/>
          <div className="flex gap-2">
            <button onClick={() => void bestaetigen()} disabled={laeuft || zahl.replace(/\s/g, "").length < 6} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
              {laeuft ? <PulseLoader size={14}/> : null}
              Bestätigen
            </button>
            <button onClick={() => void abbrechen()} className="px-5 py-2.5 text-[13px] font-semibold rounded-lg border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]">
              Abbrechen
            </button>
          </div>
        </div>) : bestaetigte.length === 0 ? (<div className="space-y-3">
          <p className="text-[13px] text-[var(--tinte-leise)] leading-relaxed">
            Wichtig vorher: Wer sein Telefon verliert, kommt <strong>nicht</strong> über
            einen Backup-Code wieder hinein — Nurvo hat dafür die
            Wiederherstellungs-Phrase, und die Leitung kann eine neue ausstellen. Den Weg
            also kennen, bevor er gebraucht wird.
          </p>
          <button onClick={() => void einrichten()} disabled={laeuft} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
            {laeuft ? <PulseLoader size={14}/> : (<span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>)}
            Einrichten
          </button>
        </div>) : (<div className="space-y-3">
          {bestaetigte.map((f) => (<div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[var(--papier-tief)] border border-[var(--linie)]">
              <div>
                <div className="text-[13px] font-medium text-[var(--tinte)]">
                  {f.friendly_name || "Authenticator"}
                </div>
                <div className="text-[13px] text-[var(--tinte-matt)]">
                  eingerichtet am {new Date(f.created_at).toLocaleDateString("de-DE")}
                </div>
              </div>
              <button onClick={() => void entfernen(f.id)} disabled={laeuft} className="px-4 py-2 text-[13px] font-semibold rounded-lg border border-[var(--gefahr)] text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] disabled:opacity-50">
                Entfernen
              </button>
            </div>))}
        </div>)}

      {fehler && (<div className="flex items-center gap-2 mt-3 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
          {fehler}
        </div>)}
      {meldung && (<div className="flex items-center gap-2 mt-3 text-[var(--ok)] bg-[var(--ok-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
          {meldung}
        </div>)}
    </div>);
}

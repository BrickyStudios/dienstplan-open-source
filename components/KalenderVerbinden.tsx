"use client";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/LanguageContext";
type Adressen = {
    https: string;
    webcal: string;
    google: string;
};
export default function KalenderVerbinden() {
    const { t } = useLang();
    const [stand, setStand] = useState<{
        eingerichtet: boolean;
        verfuegbar: boolean;
    } | null>(null);
    const [adressen, setAdressen] = useState<Adressen | null>(null);
    const [laeuft, setLaeuft] = useState(false);
    const [fehler, setFehler] = useState("");
    const [kopiert, setKopiert] = useState(false);
    useEffect(() => {
        fetch("/api/mitarbeiter/kalender").then(r => r.json()).then(setStand).catch(() => setStand(null));
    }, []);
    async function verbinden() {
        setLaeuft(true);
        setFehler("");
        try {
            const r = await fetch("/api/mitarbeiter/kalender", { method: "POST" });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                setFehler(d.error ?? t("kal.fehler"));
                return;
            }
            setAdressen(d.adressen);
            setStand({ eingerichtet: true, verfuegbar: true });
        }
        finally {
            setLaeuft(false);
        }
    }
    async function trennen() {
        setLaeuft(true);
        setFehler("");
        try {
            const r = await fetch("/api/mitarbeiter/kalender", { method: "DELETE" });
            if (!r.ok) {
                setFehler(t("kal.fehler"));
                return;
            }
            setAdressen(null);
            setStand({ eingerichtet: false, verfuegbar: true });
        }
        finally {
            setLaeuft(false);
        }
    }
    async function kopieren() {
        if (!adressen)
            return;
        try {
            await navigator.clipboard.writeText(adressen.https);
            setKopiert(true);
            setTimeout(() => setKopiert(false), 2000);
        }
        catch { }
    }
    if (!stand || !stand.verfuegbar)
        return null;
    const knopf = "inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-[var(--linie)] text-[13px] font-medium text-[var(--tinte)] hover:bg-[var(--papier-tief)] transition-colors";
    return (<section className="rounded-xl border border-[var(--linie)] bg-[var(--papier)] p-4" aria-labelledby="kalender-titel">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 22 }} aria-hidden>calendar_month</span>
        <div className="flex-1 min-w-0">
          <h2 id="kalender-titel" className="text-[13px] font-semibold text-[var(--tinte)]">{t("kal.titel")}</h2>

          {!adressen && !stand.eingerichtet && (<>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("kal.erklaerung")}</p>
              <button onClick={verbinden} disabled={laeuft} className={`${knopf} mt-3 bg-[var(--akzent)] text-white border-[var(--akzent)] hover:bg-[var(--akzent-tief)]`}>
                {t("kal.verbinden")}
              </button>
            </>)}

          {!adressen && stand.eingerichtet && (<>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("kal.verbunden")}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button onClick={verbinden} disabled={laeuft} className={knopf}>{t("kal.neueAdresse")}</button>
                <button onClick={trennen} disabled={laeuft} className={knopf}>{t("kal.trennen")}</button>
              </div>
            </>)}

          {adressen && (<>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("kal.waehlen")}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <a href={adressen.webcal} className={knopf}>{t("kal.apple")}</a>
                <a href={adressen.google} target="_blank" rel="noopener noreferrer" className={knopf}>{t("kal.google")}</a>
                <button onClick={kopieren} className={knopf}>{kopiert ? t("kal.kopiert") : t("kal.kopieren")}</button>
              </div>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-3 break-all">{adressen.https}</p>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-2">{t("kal.hinweis")}</p>
            </>)}

          {fehler && <p role="alert" className="text-[13px] text-[var(--gefahr)] mt-2">{fehler}</p>}
        </div>
      </div>
    </section>);
}

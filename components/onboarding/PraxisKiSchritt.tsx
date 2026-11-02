"use client";
import { useEffect, useRef, useState } from "react";
import { KiLabel } from "@/components/KiLabel";
import Wochenraster from "@/components/onboarding/Wochenraster";
import TagesBesetzung from "@/components/onboarding/TagesBesetzung";
import Spracheingabe from "@/components/onboarding/Spracheingabe";
import Personalbedarf from "@/components/onboarding/Personalbedarf";
import { ERLAUBTE_TYPEN, dateiPruefen, liesDokument, type GelesenesDokument } from "@/lib/dokument-lesen";
import { WOCHENTAGE, type RasterVorschlag } from "@/lib/scheduling/praxis-raster";
import { keineDateien } from "@/lib/keine-dateien";
const BEISPIEL = "Wir sind eine Hausarztpraxis mit zwei Ärztinnen, 7 MFA und einer Auszubildenden. Sprechstunde Mo–Fr 8–12 Uhr, " +
    "Mo, Di und Do zusätzlich 15–18 Uhr, Mittwoch- und Freitagnachmittag ist zu. Das Team ist ab 7:30 da, " +
    "das Labor fängt um 7 an. Vormittags arbeiten beide Ärztinnen und 5 aus dem Team, nachmittags eine Ärztin und 3. Wenn vormittags eine MFA fehlt, " +
    "schaffen wir das, nachmittags nicht. Am Empfang müssen immer mindestens zwei sein.";
export type HochgeladenerPlan = {
    dateiname: string;
    gelesen: GelesenesDokument;
};
const ART_TEXT: Record<GelesenesDokument["art"], string> = {
    "pdf-text": "PDF",
    "pdf-scan": "gescanntes PDF, per Texterkennung gelesen",
    foto: "Foto, per Texterkennung gelesen",
};
export default function PraxisKiSchritt({ beschreibung, setBeschreibung, plan, setPlan, uebernommen, onUebernehmen, }: {
    beschreibung: string;
    setBeschreibung: (s: string) => void;
    plan: HochgeladenerPlan | null;
    setPlan: (p: HochgeladenerPlan | null) => void;
    uebernommen: boolean;
    onUebernehmen: (v: RasterVorschlag) => void;
}) {
    const [laeuft, setLaeuft] = useState(false);
    const beschreibungRef = useRef(beschreibung);
    useEffect(() => { beschreibungRef.current = beschreibung; }, [beschreibung]);
    const [fehler, setFehler] = useState("");
    const [vorschlag, setVorschlag] = useState<RasterVorschlag | null>(null);
    const [geschwaerzt, setGeschwaerzt] = useState(false);
    const [antworten, setAntworten] = useState<Record<number, string>>({});
    const [gefragt, setGefragt] = useState<string[]>([]);
    const [liest, setLiest] = useState<string | null>(null);
    const [dateiFehler, setDateiFehler] = useState("");
    const dateiFeld = useRef<HTMLInputElement>(null);
    const dokumentText = plan?.gelesen.text ?? "";
    const genugEingabe = beschreibung.trim().length >= 20 || dokumentText.trim().length >= 20;
    async function dateiGewaehlt(datei: File | undefined) {
        if (!datei)
            return;
        setDateiFehler("");
        const problem = dateiPruefen(datei);
        if (problem) {
            setDateiFehler(problem);
            return;
        }
        setLiest("Datei wird geöffnet …");
        try {
            const gelesen = await liesDokument(datei, setLiest);
            setPlan({ dateiname: datei.name, gelesen });
        }
        catch (e) {
            setDateiFehler(e instanceof Error ? e.message : "Die Datei ließ sich nicht lesen.");
        }
        finally {
            setLiest(null);
            if (dateiFeld.current)
                dateiFeld.current.value = "";
        }
    }
    async function vorschlagen(text: string) {
        setLaeuft(true);
        setFehler("");
        try {
            const res = await fetch("/api/onboarding/praxis-ki", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    beschreibung: text,
                    dokument: dokumentText || undefined,
                    ...(vorschlag ? {
                        bisher: { ...vorschlag, mitarbeitende: [], annahmen: [], hinweise: [], rueckfragen: [] },
                        gefragt: [...new Set([...gefragt, ...vorschlag.rueckfragen])],
                    } : {}),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.vorschlag) {
                setFehler(json.error || "Der Vorschlag hat nicht geklappt. Sie können das Raster auch von Hand eintragen.");
                return;
            }
            if (vorschlag)
                setGefragt(prev => [...new Set([...prev, ...vorschlag.rueckfragen])]);
            setVorschlag(json.vorschlag as RasterVorschlag);
            setGeschwaerzt(Boolean(json.geschwaerzt));
            setAntworten({});
        }
        catch {
            setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
        }
        finally {
            setLaeuft(false);
        }
    }
    function mitAntwortenNeu() {
        if (!vorschlag)
            return;
        const zusatz = vorschlag.rueckfragen
            .map((f, i) => antworten[i]?.trim() ? `${f} ${antworten[i].trim()}` : "")
            .filter(Boolean).join("\n");
        if (!zusatz)
            return;
        const neu = `${beschreibung.trim()}\n\n${zusatz}`.trim();
        setBeschreibung(neu);
        void vorschlagen(neu);
    }
    const bedarf = (art: string) => vorschlag?.schichten.find(s => s.art === art)?.bedarf ?? 0;
    const mindestens = (art: string) => vorschlag?.schichten.find(s => s.art === art)?.mindestens ?? null;
    const abweichungen = vorschlag
        ? WOCHENTAGE.flatMap(wt => vorschlag.schichten
            .map(s => ({ s, z: vorschlag.zeitenJeTag?.[String(wt.dow)]?.[s.art] }))
            .filter(({ z }) => !!z)
            .map(({ s, z }) => `${wt.name} · ${s.name} ${z!.start}–${z!.end}`))
        : [];
    if (vorschlag?.mittagspause) {
        abweichungen.unshift(`Mittagspause ${vorschlag.mittagspause.start}–${vorschlag.mittagspause.end}: Praxis geschlossen, alle machen gleichzeitig Pause`);
    }
    const personen = vorschlag?.mitarbeitende ?? [];
    return (<div className="p-8 overflow-y-auto flex-1">
      <h2 className="text-[18px] font-semibold text-[var(--tinte)] mb-1">Erzählen Sie von Ihrer Praxis</h2>
      <p className="text-[var(--tinte-matt)] text-[13px] leading-relaxed mb-4">
        Laden Sie Ihren bisherigen Dienstplan hoch, erzählen Sie in eigenen Worten, wie Ihre Praxis arbeitet,
        oder beides. Nurvo macht daraus Ihr Dienstplanraster mit Schichtzeiten für jeden Wochentag. Sie prüfen
        es in den nächsten Schritten.
      </p>

      
      <div className="rounded-xl border border-dashed border-[var(--linie)] bg-[var(--papier-tief)] p-4 mb-5">
        <p className="text-[13px] font-semibold text-[var(--tinte)] mb-0.5">Bisherigen Dienstplan hochladen</p>
        <p className="text-[13px] text-[var(--tinte-matt)] mb-3">
          PDF oder Foto, gern eine typische Woche. Die Datei bleibt auf Ihrem Gerät: Nurvo liest sie hier im
          Browser, an die KI geht nur der Text, Namen geschwärzt.
        </p>
        <input ref={dateiFeld} type="file" accept={[...ERLAUBTE_TYPEN, ".pdf"].join(",")} className="sr-only" id="praxis-dienstplan-datei" onChange={e => void dateiGewaehlt(e.target.files?.[0])} disabled={!!liest}/>

        {liest ? (<p role="status" className="inline-flex items-center gap-2 text-[13px] text-[var(--tinte)]">
            <span className="w-3 h-3 border-2 rounded-full animate-spin border-[var(--linie)] border-t-[var(--akzent)]"/>
            {liest}
          </p>) : plan ? (<div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium text-[var(--tinte)] break-all">{plan.dateiname}</span>
              <span className="text-[13px] text-[var(--tinte-leise)]">
                {ART_TEXT[plan.gelesen.art]}{plan.gelesen.seiten > 1 ? `, ${plan.gelesen.seiten} Seiten` : ""}
              </span>
              <button type="button" onClick={() => setPlan(null)} className="text-[13px] text-[var(--gefahr)] font-medium hover:underline">
                Entfernen
              </button>
              <label htmlFor="praxis-dienstplan-datei" className="text-[13px] text-[var(--akzent)] font-medium hover:underline cursor-pointer">
                Andere Datei
              </label>
            </div>
            {plan.gelesen.gekuerzt && (<p className="mt-1 text-[13px] text-[var(--warnung)]">Der Plan war sehr lang. Gelesen wurde der Anfang — eine typische Woche reicht.</p>)}
            <details className="mt-2">
              <summary className="text-[13px] text-[var(--tinte-matt)] cursor-pointer select-none">Gelesenen Text ansehen und korrigieren</summary>
              <textarea aria-label="Gelesener Text des Dienstplans" {...keineDateien} value={plan.gelesen.text} onChange={e => setPlan({ ...plan, gelesen: { ...plan.gelesen, text: e.target.value } })} rows={8} className="mt-2 w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] font-mono leading-snug bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)] resize-y"/>
              <p className="text-[13px] text-[var(--tinte-leise)]">Diesen Text sieht nur Ihr Browser. Vor dem Senden schwärzt Nurvo die Namen.</p>
            </details>
          </div>) : (<label htmlFor="praxis-dienstplan-datei" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] cursor-pointer transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>upload_file</span>
            PDF oder Foto wählen
          </label>)}

        {dateiFehler && <p role="alert" className="mt-2 text-[13px] text-[var(--gefahr)]">{dateiFehler}</p>}
      </div>

      <label htmlFor="praxis-beschreibung" className="block text-[13px] font-medium text-[var(--tinte)] mb-1.5">
        {plan ? "Ergänzungen in eigenen Worten (freiwillig)" : "Ihre Praxis in eigenen Worten"}
      </label>
      <textarea id="praxis-beschreibung" {...keineDateien} value={beschreibung} onChange={e => setBeschreibung(e.target.value)} rows={plan ? 3 : 6} maxLength={3000} placeholder={plan ? "Zum Beispiel: Wenn vormittags eine fehlt, schaffen wir das. Am Empfang immer mindestens zwei." : BEISPIEL} className="w-full px-3 py-2.5 rounded-lg border border-[var(--linie)] text-[14px] leading-relaxed bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)] resize-y"/>
      <Spracheingabe onText={t => setBeschreibung(`${beschreibungRef.current.trimEnd()} ${t}`.trim().slice(0, 3000))}/>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
        <p className="text-[13px] text-[var(--tinte-leise)]">Bitte keine Namen oder Gesundheitsangaben. Namen werden vor dem Senden geschwärzt.</p>
        {!beschreibung && !plan && (<button type="button" onClick={() => setBeschreibung(BEISPIEL)} className="text-[13px] text-[var(--akzent)] font-medium hover:underline">
            Beispiel einsetzen
          </button>)}
      </div>

      <button type="button" onClick={() => vorschlagen(beschreibung)} disabled={laeuft || !!liest || !genugEingabe} className={`mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-40 ${vorschlag ? "border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)]"
            : "text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]"}`}>
        {laeuft && <span className={`w-3 h-3 border-2 rounded-full animate-spin ${vorschlag ? "border-[var(--linie)] border-t-[var(--tinte)]" : "border-white/30 border-t-white"}`}/>}
        {laeuft ? (plan ? "Nurvo liest den Plan …" : "Nurvo liest mit …") : vorschlag ? "Neu vorschlagen" : "Raster vorschlagen"}
      </button>
      {laeuft && plan && <p className="mt-2 text-[13px] text-[var(--tinte-leise)]">Bei einem ganzen Dienstplan kann das bis zu einer Minute dauern.</p>}

      {fehler && (<div role="alert" className="mt-4 p-3 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{fehler}</div>)}

      {vorschlag && (<section aria-label="Vorschlag" className="mt-6 pt-5 border-t border-[var(--linie)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[15px] font-semibold text-[var(--tinte)]">Ihr Dienstplanraster</h3>
            <KiLabel />
          </div>

          <Wochenraster schichten={vorschlag.schichten} geschlossen={vorschlag.geschlossen} turnus={vorschlag.turnus} bedarf={bedarf} mindestens={mindestens} aerzte={art => vorschlag.schichten.find(s => s.art === art)?.aerzte ?? 0}/>
          <TagesBesetzung schichten={vorschlag.schichten} besetzung={vorschlag.besetzungJeTag ?? {}} geschlossen={vorschlag.geschlossen}/>
          <Personalbedarf raster={vorschlag}/>
          {vorschlag.empfehlungen && vorschlag.empfehlungen.length > 0 && (<div className="mt-4">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">Vorschläge für Ihre Öffnungszeiten</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
                {vorschlag.empfehlungen.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>)}

          {abweichungen.length > 0 && (<div className="mt-4">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">{vorschlag.mittagspause ? "Mittagspause und abweichende Zeiten" : "An einzelnen Tagen andere Zeiten"}</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
                {abweichungen.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>)}
          {personen.length > 0 && (<div className="mt-4">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">
                Auf dem Plan erkannt: {personen.length} {personen.length === 1 ? "Person" : "Personen"}
              </p>
              <p className="text-[13px] text-[var(--tinte-matt)]">
                {personen.slice(0, 8).map(p => p.name).join(", ")}{personen.length > 8 ? " …" : ""}.
                Sie prüfen die Liste im Schritt „Mitarbeiter“; angelegt wird erst am Ende.
              </p>
            </div>)}
          {vorschlag.annahmen.length > 0 && (<div className="mt-4">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">Angenommen, weil es nicht dastand</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
                {vorschlag.annahmen.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>)}
          {vorschlag.hinweise.length > 0 && (<div className="mt-3">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1">Gut zu wissen</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-[var(--tinte-matt)]">
                {vorschlag.hinweise.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>)}
          {geschwaerzt && (<p className="mt-3 text-[13px] text-[var(--tinte-leise)]">Einzelne Wörter (etwa Namen) hat Nurvo vor dem Senden geschwärzt.</p>)}

          {vorschlag.rueckfragen.length > 0 && (<div className="mt-4 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] p-4">
              <p className="text-[13px] font-semibold text-[var(--tinte)] mb-2">Noch kurz gefragt</p>
              <div className="space-y-3">
                {vorschlag.rueckfragen.map((f, i) => (<label key={i} className="block">
                    <span className="block text-[13px] text-[var(--tinte-matt)] mb-1">{f}</span>
                    <input value={antworten[i] ?? ""} {...keineDateien} onChange={e => setAntworten(a => ({ ...a, [i]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]"/>
                  </label>))}
              </div>
              <button type="button" onClick={mitAntwortenNeu} disabled={laeuft || !Object.values(antworten).some(a => a.trim())} className="mt-3 px-4 py-2 rounded-lg text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)] transition-colors disabled:opacity-40">
                Mit Antworten neu vorschlagen
              </button>
            </div>)}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => onUebernehmen(vorschlag)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[var(--tinte)] transition-colors">
              Raster übernehmen und prüfen
            </button>
            {uebernommen && <span className="text-[13px] text-[var(--akzent)] font-medium">Übernommen. Die nächsten Schritte sind vorausgefüllt.</span>}
          </div>
        </section>)}

      {!vorschlag && (<p className="mt-6 text-[13px] text-[var(--tinte-leise)]">
          Lieber selbst eintragen? Einfach auf „Weiter“, dann tragen Sie Zeiten und Besetzung von Hand ein.
        </p>)}
    </div>);
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
type Ergebnis = {
    isFinal: boolean;
    0: {
        transcript: string;
    };
};
type Erkennung = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((e: {
        resultIndex: number;
        results: ArrayLike<Ergebnis>;
    }) => void) | null;
    onerror: ((e: {
        error: string;
    }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
};
type ErkennungKlasse = new () => Erkennung;
function erkennungKlasse(): ErkennungKlasse | null {
    if (typeof window === "undefined")
        return null;
    const w = window as unknown as {
        SpeechRecognition?: ErkennungKlasse;
        webkitSpeechRecognition?: ErkennungKlasse;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const FEHLER: Record<string, string> = {
    "not-allowed": "Das Mikrofon ist für diese Seite gesperrt. Klicken Sie links neben der Adresse auf das Symbol mit den zwei Reglern (Seiteninformationen), stellen Sie das Mikrofon auf „Zulassen“ und laden Sie die Seite neu.",
    "service-not-allowed": "Das Mikrofon ist für diese Seite gesperrt. Klicken Sie links neben der Adresse auf das Symbol mit den zwei Reglern (Seiteninformationen), stellen Sie das Mikrofon auf „Zulassen“ und laden Sie die Seite neu.",
    "audio-capture": "Es wurde kein Mikrofon gefunden.",
    network: "Die Spracherkennung Ihres Browsers ist gerade nicht erreichbar. Bitte tippen Sie den Text.",
};
export default function Spracheingabe({ onText }: {
    onText: (text: string) => void;
}) {
    const [verfuegbar, setVerfuegbar] = useState(false);
    const [hoert, setHoert] = useState(false);
    const [zwischen, setZwischen] = useState("");
    const [fehler, setFehler] = useState("");
    const erkennung = useRef<Erkennung | null>(null);
    useEffect(() => { setVerfuegbar(erkennungKlasse() !== null); }, []);
    useEffect(() => () => erkennung.current?.stop(), []);
    async function starten() {
        const Klasse = erkennungKlasse();
        if (!Klasse)
            return;
        setFehler("");
        if (navigator.mediaDevices?.getUserMedia) {
            try {
                const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
                strom.getTracks().forEach(spur => spur.stop());
            }
            catch (e) {
                const name = (e as {
                    name?: string;
                })?.name;
                setFehler(name === "NotFoundError" ? FEHLER["audio-capture"] : FEHLER["not-allowed"]);
                return;
            }
        }
        const r = new Klasse();
        r.lang = "de-DE";
        r.continuous = true;
        r.interimResults = true;
        r.onresult = e => {
            let vorlaeufig = "";
            const fertig: string[] = [];
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const teil = e.results[i];
                if (teil.isFinal)
                    fertig.push(teil[0].transcript.trim());
                else
                    vorlaeufig += teil[0].transcript;
            }
            if (fertig.length)
                onText(fertig.join(" "));
            setZwischen(vorlaeufig);
        };
        r.onerror = e => { if (e.error !== "no-speech" && e.error !== "aborted")
            setFehler(FEHLER[e.error] ?? "Die Spracheingabe wurde unterbrochen. Bitte erneut versuchen."); };
        r.onend = () => { setHoert(false); setZwischen(""); erkennung.current = null; };
        erkennung.current = r;
        r.start();
        setHoert(true);
    }
    if (!verfuegbar)
        return null;
    return (<div className="mt-2">
      <button type="button" onClick={() => (hoert ? erkennung.current?.stop() : void starten())} aria-pressed={hoert} className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${hoert ? "border-[var(--gefahr)] text-[var(--gefahr)] bg-[var(--gefahr-flaeche)]"
            : "border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)]"}`}>
        {hoert ? <Square size={13}/> : <Mic size={14}/>}
        {hoert ? "Aufnahme beenden" : "Einsprechen statt tippen"}
      </button>
      {hoert && (<p aria-live="polite" className="mt-1.5 text-[13px] text-[var(--tinte-matt)]">
          {zwischen ? `„${zwischen}"` : "Sprechen Sie einfach los. Der Text erscheint im Feld oben."}
        </p>)}
      {fehler && <p role="alert" className="mt-1.5 text-[13px] text-[var(--gefahr)]">{fehler}</p>}
      {!hoert && !fehler && (<p className="mt-1.5 text-[13px] text-[var(--tinte-leise)]">
          Die Erkennung übernimmt Ihr Browser, je nach Browser über den Dienst seines Herstellers (Google, Microsoft, Apple).
          Nurvo erhält nur den Text.
        </p>)}
    </div>);
}

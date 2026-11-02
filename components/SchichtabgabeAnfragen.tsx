"use client";
import { useCallback, useEffect, useState } from "react";
import { Clock, Check, X, Undo2 } from "lucide-react";
type Vorgang = {
    id: string;
    shift_date: string;
    shift_type: string;
    station: string | null;
    reason: string;
    status: string;
    ersatz_noetig: boolean | null;
    diagnoseText?: string;
};
type Angebot = {
    id: string;
    frist: string;
    rang: number;
};
const SCHICHT_WORT: Record<string, string> = { frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" };
const STATUS_WORT: Record<string, string> = {
    sucht_ersatz: "Ersatz wird gesucht",
    wartet_auf_kandidat: "Jemand wurde gefragt — Frist läuft",
    wartet_auf_leitung: "Die Leitung bestätigt die Absage",
    ohne_ersatz_abgesagt: "Erledigt — die Schicht ist nicht mehr deine",
    uebernommen: "Übernommen",
    eskaliert: "Niemand gefunden — die Leitung übernimmt",
    abgelehnt_leitung: "Abgelehnt — der Dienst bleibt bei dir",
    zurueckgezogen: "Von dir zurückgenommen",
};
const OFFEN = ["sucht_ersatz", "wartet_auf_kandidat", "wartet_auf_leitung"];
function fmtTag(d: string): string {
    try {
        return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return d;
    }
}
function fmtFrist(iso: string): string {
    try {
        return new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    catch {
        return iso;
    }
}
export default function SchichtabgabeAnfragen({ onAenderung }: {
    onAenderung?: () => void;
}) {
    const [eigene, setEigene] = useState<Vorgang[]>([]);
    const [anfragen, setAnfragen] = useState<{
        angebot: Angebot;
        vorgang: Vorgang;
    }[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [fehler, setFehler] = useState("");
    const laden = useCallback(() => {
        fetch("/api/mitarbeiter/shift-release")
            .then(r => r.json())
            .then((d: {
            migrationFehlt?: boolean;
            eigene?: Vorgang[];
            anfragen?: {
                angebot: Angebot;
                vorgang: Vorgang;
            }[];
        }) => {
            if (d.migrationFehlt) {
                setEigene([]);
                setAnfragen([]);
                return;
            }
            setEigene(d.eigene ?? []);
            setAnfragen(d.anfragen ?? []);
        })
            .catch(() => { });
    }, []);
    useEffect(() => { laden(); }, [laden]);
    async function antworten(offerId: string, antwort: "annehmen" | "ablehnen") {
        setBusy(offerId);
        setFehler("");
        try {
            const res = await fetch("/api/mitarbeiter/shift-release", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offer_id: offerId, antwort }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || d.ok === false)
                setFehler(d.meldung ?? d.error ?? "Hat nicht geklappt.");
            laden();
            onAenderung?.();
        }
        catch {
            setFehler("Keine Verbindung.");
        }
        finally {
            setBusy(null);
        }
    }
    async function zurueckziehen(releaseId: string) {
        setBusy(releaseId);
        setFehler("");
        try {
            const res = await fetch("/api/mitarbeiter/shift-release", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ release_id: releaseId }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || d.ok === false)
                setFehler(d.meldung ?? d.error ?? "Hat nicht geklappt.");
            laden();
            onAenderung?.();
        }
        catch {
            setFehler("Keine Verbindung.");
        }
        finally {
            setBusy(null);
        }
    }
    const offeneEigene = eigene.filter(v => OFFEN.includes(v.status));
    const erledigteEigene = eigene.filter(v => !OFFEN.includes(v.status)).slice(0, 3);
    if (anfragen.length === 0 && offeneEigene.length === 0 && erledigteEigene.length === 0)
        return null;
    return (<div className="space-y-2.5">
      {fehler && (<div className="px-3 py-2 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{fehler}</div>)}

      {anfragen.map(({ angebot, vorgang }) => (<div key={angebot.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-[var(--linie)] bg-[var(--warnung-flaeche)]">
          <div className="w-10 h-10 rounded-xl bg-[var(--warnung-flaeche)] flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-[var(--warnung)]"/>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--tinte)]">
              Kannst du diese Schicht übernehmen?
            </p>
            <p className="text-[13px] text-[var(--tinte-matt)]">
              {SCHICHT_WORT[vorgang.shift_type] ?? vorgang.shift_type} am {fmtTag(vorgang.shift_date)}
              {vorgang.station ? ` · ${vorgang.station}` : ""}
              {vorgang.reason ? <span className="text-[var(--tinte-matt)]">{` · „${vorgang.reason}“`}</span> : null}
            </p>
            <p className="text-[13px] text-[var(--warnung)] font-medium mt-1">
              Antwort bis {fmtFrist(angebot.frist)} — danach wird die nächste Person gefragt.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => antworten(angebot.id, "ablehnen")} disabled={busy === angebot.id} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
              <X size={13}/> Kann nicht
            </button>
            <button onClick={() => antworten(angebot.id, "annehmen")} disabled={busy === angebot.id} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition disabled:opacity-60 inline-flex items-center gap-1.5">
              <Check size={13}/> Übernehmen
            </button>
          </div>
        </div>))}

      {[...offeneEigene, ...erledigteEigene].map(v => (<div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--linie)] bg-[var(--papier)]">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[var(--tinte)]">
              <span className="font-medium">{SCHICHT_WORT[v.shift_type] ?? v.shift_type} am {fmtTag(v.shift_date)}</span>
              {" — "}{STATUS_WORT[v.status] ?? v.status}
            </p>
            
            {v.status === "eskaliert" && v.diagnoseText && (<p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{v.diagnoseText}</p>)}
          </div>
          {OFFEN.includes(v.status) && (<button onClick={() => zurueckziehen(v.id)} disabled={busy === v.id} className="px-2.5 py-1 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60 inline-flex items-center gap-1 flex-shrink-0">
              <Undo2 size={12}/> Geht doch
            </button>)}
        </div>))}
    </div>);
}

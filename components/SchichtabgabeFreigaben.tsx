"use client";
import { useCallback, useEffect, useState } from "react";
import { UserMinus, Check, X } from "lucide-react";
type Verlaufszeile = {
    rang: number;
    status: string;
    frist: string;
    decided_at: string | null;
    name: string;
};
type Vorgang = {
    id: string;
    staffName: string;
    shift_date: string;
    shift_type: string;
    station: string | null;
    reason: string;
    status: string;
    ersatz_noetig: boolean | null;
    luecke: number | null;
    diagnoseText: string;
    verlauf: Verlaufszeile[];
};
const SCHICHT_WORT: Record<string, string> = { frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" };
const VERLAUF_WORT: Record<string, string> = {
    offen: "gefragt, Frist läuft",
    angenommen: "hat zugesagt",
    abgelehnt: "hat abgelehnt",
    frist_abgelaufen: "Frist verstrichen",
    uebersprungen: "übersprungen",
};
function fmtTag(d: string): string {
    try {
        return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return d;
    }
}
export default function SchichtabgabeFreigaben() {
    const [offen, setOffen] = useState<Vorgang[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [fehler, setFehler] = useState("");
    const laden = useCallback(() => {
        fetch("/api/leitung/shift-release")
            .then(r => r.json())
            .then((d: {
            migrationFehlt?: boolean;
            vorgaenge?: Vorgang[];
        }) => {
            if (d.migrationFehlt) {
                setOffen([]);
                return;
            }
            setOffen((d.vorgaenge ?? []).filter(v => v.status === "wartet_auf_leitung" || v.status === "eskaliert"));
        })
            .catch(() => { });
    }, []);
    useEffect(() => { laden(); }, [laden]);
    async function entscheiden(id: string, entscheidung: "freigeben" | "ablehnen") {
        setBusy(id);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/shift-release", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ release_id: id, entscheidung }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || d.ok === false)
                setFehler(d.meldung ?? d.error ?? "Hat nicht geklappt.");
            laden();
        }
        catch {
            setFehler("Keine Verbindung.");
        }
        finally {
            setBusy(null);
        }
    }
    if (offen.length === 0)
        return null;
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--linie)] flex items-center gap-2.5">
        <UserMinus size={16} className="text-[var(--akzent)]"/>
        <div>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Schichtabgaben</h2>
          <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">
            {offen.length === 1 ? "Ein Vorgang wartet" : `${offen.length} Vorgänge warten`} auf deine Entscheidung
          </p>
        </div>
      </div>

      {fehler && (<div className="px-6 py-2.5 bg-[var(--gefahr-flaeche)] border-b border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{fehler}</div>)}

      <div className="divide-y divide-[var(--linie)]">
        {offen.map(v => (<div key={v.id} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[var(--tinte)]">
                  <span className="font-semibold">{v.staffName}</span>
                  {" kann die "}
                  {SCHICHT_WORT[v.shift_type] ?? v.shift_type} am {fmtTag(v.shift_date)}
                  {v.station ? ` (${v.station})` : ""} nicht übernehmen.
                </p>
                {v.reason && (<p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">Grund: {v.reason}</p>)}

                
                <p className="text-[13px] mt-1.5">
                  {v.status === "wartet_auf_leitung" ? (<span className="text-[var(--ok)]">
                      Der Tag ist auch ohne diese Person besetzt — es braucht keinen Ersatz.
                    </span>) : (<span className="text-[var(--gefahr)]">
                      Kein Ersatz gefunden{typeof v.luecke === "number" && v.luecke > 0 ? ` · es fehlt ${v.luecke === 1 ? "eine Person" : `${v.luecke} Personen`}` : ""}.
                    </span>)}
                </p>
                {v.status === "eskaliert" && v.diagnoseText && (<p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{v.diagnoseText}</p>)}

                {v.verlauf.length > 0 && (<ul className="mt-2 space-y-0.5">
                    {v.verlauf.map((z, i) => (<li key={i} className="text-[13px] text-[var(--tinte-matt)]">
                        {z.rang + 1}. {z.name} — {VERLAUF_WORT[z.status] ?? z.status}
                      </li>))}
                  </ul>)}
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => entscheiden(v.id, "ablehnen")} disabled={busy === v.id} className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
                  <X size={13}/> Dienst bleibt
                </button>
                <button onClick={() => entscheiden(v.id, "freigeben")} disabled={busy === v.id} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition disabled:opacity-60 inline-flex items-center gap-1.5">
                  <Check size={13}/> Freigeben
                </button>
              </div>
            </div>
          </div>))}
      </div>
    </div>);
}

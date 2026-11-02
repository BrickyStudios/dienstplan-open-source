"use client";
import { useState } from "react";
import Modal from "@/components/Modal";
import { RECHTE, SELBSTBEDIENUNG, type Recht, type Selbst, type SelbstWerte } from "@/lib/rechte";
export type RechteEintrag = {
    userId: string;
    rechte: Recht[];
    selbstbedienung: SelbstWerte;
};
export default function MitarbeiterRechte({ person, eintrag, vergebbar, praxis, onClose, onGespeichert }: {
    person: {
        id: string;
        full_name: string;
    };
    eintrag?: RechteEintrag;
    vergebbar: Recht[];
    praxis: SelbstWerte;
    onClose: () => void;
    onGespeichert: (e: RechteEintrag) => void;
}) {
    const [rechte, setRechte] = useState<Recht[]>(eintrag?.rechte ?? []);
    const [selbst, setSelbst] = useState<SelbstWerte>(eintrag?.selbstbedienung ?? {});
    const [speichert, setSpeichert] = useState(false);
    const [fehler, setFehler] = useState("");
    const alle = vergebbar.length === RECHTE.length && RECHTE.every(r => rechte.includes(r.id));
    async function speichern() {
        setSpeichert(true);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/mitarbeiter-rechte", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: person.id, rechte, selbstbedienung: selbst }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setFehler(j.error || "Speichern hat nicht geklappt.");
                return;
            }
            onGespeichert({ userId: person.id, rechte: j.rechte ?? rechte, selbstbedienung: j.selbstbedienung ?? selbst });
            onClose();
        }
        catch {
            setFehler("Keine Verbindung. Bitte noch einmal versuchen.");
        }
        finally {
            setSpeichert(false);
        }
    }
    const wert = (id: Selbst) => selbst[id] === undefined ? "praxis" : selbst[id] ? "an" : "aus";
    const setze = (id: Selbst, v: string) => setSelbst(prev => {
        const neu = { ...prev };
        if (v === "praxis")
            delete neu[id];
        else
            neu[id] = v === "an";
        return neu;
    });
    return (<Modal open onClose={() => { if (!speichert)
        onClose(); }} widthClass="max-w-xl" title={`Rechte von ${person.full_name}`} description="Was diese Person zusätzlich darf. Mit allen Rechten kann sie die Praxis so führen wie Sie." footer={<>
        <button type="button" onClick={onClose} disabled={speichert} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold border border-[var(--linie)] text-[var(--tinte)] bg-[var(--papier)] hover:border-[var(--tinte-leise)]">
          Abbrechen
        </button>
        <button type="button" onClick={speichern} disabled={speichert} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-40">
          {speichert ? "Speichert …" : "Speichern"}
        </button>
      </>}>
      <div>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-[var(--tinte)] mb-1.5">Aufgaben der Praxisleitung</legend>
          {RECHTE.map(r => {
            const darf = vergebbar.includes(r.id);
            return (<label key={r.id} className={`flex items-start gap-3 rounded-lg border border-[var(--linie)] px-3 py-2.5 ${darf ? "cursor-pointer hover:border-[var(--tinte-leise)]" : "opacity-50"}`}>
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--akzent)]" disabled={!darf} checked={rechte.includes(r.id)} onChange={e => setRechte(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))}/>
                <span>
                  <span className="block text-[14px] font-medium text-[var(--tinte)]">{r.titel}</span>
                  <span className="block text-[13px] text-[var(--tinte-matt)]">{r.text}</span>
                </span>
              </label>);
        })}
          {vergebbar.length === RECHTE.length && (<button type="button" onClick={() => setRechte(alle ? [] : RECHTE.map(r => r.id))} className="text-[13px] font-medium text-[var(--akzent)] hover:underline">
              {alle ? "Alle Rechte entfernen" : "Alle Rechte geben"}
            </button>)}
        </fieldset>

        <fieldset className="mt-6 space-y-2">
          <legend className="text-[13px] font-semibold text-[var(--tinte)] mb-0.5">Selbst in der App</legend>
          <p className="text-[13px] text-[var(--tinte-matt)] mb-2">
            Abgeschaltet heißt: Die Person ruft an, und Sie erfassen es selbst — die Krankmeldung zum Beispiel unter „Urlaub &amp; Ausfall“.
          </p>
          {SELBSTBEDIENUNG.map(s => (<div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--linie)] px-3 py-2">
              <span className="text-[14px] text-[var(--tinte)]">{s.titel}</span>
              <select aria-label={s.titel} value={wert(s.id)} onChange={e => setze(s.id, e.target.value)} className="px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:border-[var(--akzent)]">
                <option value="praxis">Wie für die Praxis ({praxis[s.id] === false ? "aus" : "an"})</option>
                <option value="an">Erlaubt</option>
                <option value="aus">Abgeschaltet</option>
              </select>
            </div>))}
        </fieldset>

        {fehler && <div role="alert" className="mt-4 p-3 rounded-lg bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] text-[var(--gefahr)]">{fehler}</div>}
      </div>
    </Modal>);
}

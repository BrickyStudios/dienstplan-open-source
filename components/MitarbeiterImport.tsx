"use client";
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { useLang } from "@/lib/LanguageContext";
import { BESCHAEFTIGUNGSARTEN, mitarbeiterListeLesen, STUNDEN_VORGABE, type Beschaeftigung, type ImportZeile, } from "@/lib/mitarbeiter-import";
type Phase = "eingabe" | "vorschau" | "fertig";
type Ergebnis = {
    name: string;
    code: string;
};
export default function MitarbeiterImport({ open, onClose, stationen, onAngelegt, }: {
    open: boolean;
    onClose: () => void;
    stationen: string[];
    onAngelegt?: () => void;
}) {
    const { t } = useLang();
    const [phase, setPhase] = useState<Phase>("eingabe");
    const [text, setText] = useState("");
    const [station, setStation] = useState("");
    const [beschaeftigung, setBeschaeftigung] = useState<Beschaeftigung>("Vollzeit");
    const [zeilen, setZeilen] = useState<ImportZeile[]>([]);
    const [uebersprungen, setUebersprungen] = useState<{
        zeile: number;
        grund: string;
    }[]>([]);
    const [fehler, setFehler] = useState("");
    const [laeuft, setLaeuft] = useState(false);
    const [ergebnis, setErgebnis] = useState<Ergebnis[]>([]);
    const [gueltigBis, setGueltigBis] = useState("");
    const [versendet, setVersendet] = useState<{
        anzahl: number;
        uebersprungen: number;
    } | null>(null);
    const [versendetLaeuft, setVersendetLaeuft] = useState(false);
    const gelesen = useMemo(() => mitarbeiterListeLesen(text, { station: station || undefined, beschaeftigung }), [text, station, beschaeftigung]);
    function zuruecksetzen() {
        setPhase("eingabe");
        setText("");
        setZeilen([]);
        setUebersprungen([]);
        setErgebnis([]);
        setFehler("");
        setGueltigBis("");
        setVersendet(null);
    }
    function weiterZurVorschau() {
        if (gelesen.zeilen.length === 0) {
            setFehler(t("imp.fehlerLeer"));
            return;
        }
        setZeilen(gelesen.zeilen);
        setUebersprungen(gelesen.uebersprungen.map(u => ({ zeile: u.zeile, grund: u.grund })));
        setFehler("");
        setPhase("vorschau");
    }
    function aendere(i: number, feld: keyof ImportZeile, wert: string) {
        setZeilen(alt => alt.map((z, idx) => {
            if (idx !== i)
                return z;
            if (feld === "beschaeftigung") {
                const art = wert as Beschaeftigung;
                const stundenStandenAufVorgabe = z.stundenWoche === STUNDEN_VORGABE[z.beschaeftigung];
                return { ...z, beschaeftigung: art, stundenWoche: stundenStandenAufVorgabe ? STUNDEN_VORGABE[art] : z.stundenWoche };
            }
            if (feld === "stundenWoche")
                return { ...z, stundenWoche: Number(wert.replace(",", ".")) || 0 };
            return { ...z, [feld]: wert };
        }));
    }
    function entferne(i: number) {
        setZeilen(alt => alt.filter((_, idx) => idx !== i));
    }
    async function anlegen() {
        setLaeuft(true);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/invite-staff/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    zeilen: zeilen.map(z => ({
                        name: z.name,
                        first_name: z.vorname || undefined,
                        last_name: z.nachname || undefined,
                        email: z.email || undefined,
                        phone: z.telefon || undefined,
                        station: z.station || undefined,
                        job_type: z.beschaeftigung,
                        max_hours_per_week: z.stundenWoche,
                        hourly_rate: z.stundenlohn ?? undefined,
                    })),
                }),
            });
            const d = await res.json();
            if (!res.ok || !d.ok) {
                setFehler(d.error || t("imp.fehlerAnlegen"));
                return;
            }
            setErgebnis(d.angelegt ?? []);
            setGueltigBis(d.gueltigBis ?? "");
            setPhase("fertig");
            onAngelegt?.();
        }
        catch {
            setFehler(t("imp.fehlerAnlegen"));
        }
        finally {
            setLaeuft(false);
        }
    }
    async function versenden() {
        setVersendetLaeuft(true);
        setFehler("");
        try {
            const res = await fetch("/api/leitung/invite-staff/versenden", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ codes: ergebnis.map(e => e.code) }),
            });
            const d = await res.json();
            if (!res.ok || !d.ok) {
                setFehler(d.error || t("imp.fehlerVersand"));
                return;
            }
            setVersendet({ anzahl: (d.verschickt ?? []).length, uebersprungen: (d.uebersprungen ?? []).length });
        }
        catch {
            setFehler(t("imp.fehlerVersand"));
        }
        finally {
            setVersendetLaeuft(false);
        }
    }
    const mitEmail = zeilen.filter(z => z.email).length;
    const alsTabelle = () => [`${t("imp.spalteName")}\t${t("imp.spalteCode")}`, ...ergebnis.map(e => `${e.name}\t${e.code}`)].join("\n");
    async function kopieren() {
        try {
            await navigator.clipboard.writeText(alsTabelle());
        }
        catch { }
    }
    function herunterladen() {
        const csv = "﻿" + [`${t("imp.spalteName")};${t("imp.spalteCode")}`,
            ...ergebnis.map(e => `"${e.name.replace(/"/g, '""')}";${e.code}`)].join("\r\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = "nurvo-einladungscodes.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    }
    const feldKlasse = "w-full px-2 py-1.5 rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[13px] text-[var(--tinte)]";
    return (<Modal open={open} onClose={() => { zuruecksetzen(); onClose(); }} title={t("imp.titel")} description={phase === "eingabe" ? t("imp.untertitel") : undefined} widthClass="max-w-4xl" footer={<div className="flex items-center gap-2">
          {phase === "vorschau" && (<button type="button" onClick={() => setPhase("eingabe")} className="px-4 py-2 rounded-xl border border-[var(--linie)] text-[13px] text-[var(--tinte)]">
              {t("imp.zurueck")}
            </button>)}
          {phase === "eingabe" && (<button type="button" onClick={weiterZurVorschau} className="px-4 py-2 rounded-xl bg-[var(--akzent)] text-white text-[13px] font-medium">
              {t("imp.weiter")}
            </button>)}
          {phase === "vorschau" && (<button type="button" onClick={anlegen} disabled={laeuft || zeilen.length === 0} className="px-4 py-2 rounded-xl bg-[var(--akzent)] text-white text-[13px] font-medium disabled:opacity-50">
              {laeuft ? t("imp.legtAn") : `${zeilen.length} ${t("imp.einladen")}`}
            </button>)}
          {phase === "fertig" && (<button type="button" onClick={() => { zuruecksetzen(); onClose(); }} className="px-4 py-2 rounded-xl bg-[var(--akzent)] text-white text-[13px] font-medium">
              {t("imp.schliessen")}
            </button>)}
        </div>}>
      {fehler && (<div className="mb-3 px-3 py-2 rounded-xl bg-[var(--warnung-flaeche)] border border-[var(--warnung)] text-[13px] text-[var(--tinte)]">
          {fehler}
        </div>)}

      {phase === "eingabe" && (<div className="space-y-4">
          <div>
            <label htmlFor="imp-text" className="block text-[13px] font-medium text-[var(--tinte)] mb-1">
              {t("imp.listeLabel")}
            </label>
            <textarea id="imp-text" value={text} onChange={e => setText(e.target.value)} rows={9} placeholder={t("imp.platzhalter")} className="w-full px-3 py-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[13px] text-[var(--tinte)] font-mono"/>
            <p className="mt-1 text-[13px] text-[var(--tinte-matt)]">{t("imp.listeHinweis")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="imp-station" className="block text-[13px] font-medium text-[var(--tinte)] mb-1">
                {t("imp.stationLabel")}
              </label>
              <select id="imp-station" value={station} onChange={e => setStation(e.target.value)} className={feldKlasse}>
                <option value="">{t("imp.ohneStation")}</option>
                {stationen.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="imp-art" className="block text-[13px] font-medium text-[var(--tinte)] mb-1">
                {t("imp.artLabel")}
              </label>
              <select id="imp-art" value={beschaeftigung} onChange={e => setBeschaeftigung(e.target.value as Beschaeftigung)} className={feldKlasse}>
                {BESCHAEFTIGUNGSARTEN.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {text.trim() !== "" && (<p className="text-[13px] text-[var(--tinte-matt)]">
              {gelesen.zeilen.length} {t("imp.erkannt")}
              {gelesen.kopfzeileErkannt ? ` · ${t("imp.mitKopfzeile")}` : ""}
            </p>)}
        </div>)}

      {phase === "vorschau" && (<div className="space-y-3">
          <p className="text-[13px] text-[var(--tinte-matt)]">{t("imp.vorschauHinweis")}</p>

          {uebersprungen.length > 0 && (<div className="px-3 py-2 rounded-xl bg-[var(--warnung-flaeche)] border border-[var(--warnung)] text-[13px] text-[var(--tinte)]">
              {uebersprungen.length} {t("imp.uebersprungen")}: {uebersprungen.map(u => `${t("imp.zeile")} ${u.zeile}`).join(", ")}
            </div>)}

          <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-[var(--linie)]">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[var(--papier-tief)]">
                <tr className="text-left text-[var(--tinte-matt)]">
                  <th className="px-2 py-2 font-medium">{t("imp.spalteName")}</th>
                  <th className="px-2 py-2 font-medium">{t("imp.spalteStation")}</th>
                  <th className="px-2 py-2 font-medium">{t("imp.spalteArt")}</th>
                  <th className="px-2 py-2 font-medium">{t("imp.spalteStunden")}</th>
                  <th className="px-2 py-2 font-medium sr-only">{t("imp.entfernen")}</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => (<tr key={`${z.zeile}-${i}`} className="border-t border-[var(--linie)] align-top">
                    <td className="px-2 py-1.5">
                      <label htmlFor={`imp-n-${i}`} className="sr-only">{t("imp.spalteName")}</label>
                      <input id={`imp-n-${i}`} value={z.name} onChange={e => aendere(i, "name", e.target.value)} className={feldKlasse}/>
                      {z.hinweise.length > 0 && (<p className="mt-1 text-[13px] text-[var(--warnung)]">{z.hinweise.join(" · ")}</p>)}
                    </td>
                    <td className="px-2 py-1.5 w-40">
                      <label htmlFor={`imp-s-${i}`} className="sr-only">{t("imp.spalteStation")}</label>
                      <input id={`imp-s-${i}`} value={z.station} onChange={e => aendere(i, "station", e.target.value)} className={feldKlasse}/>
                    </td>
                    <td className="px-2 py-1.5 w-36">
                      <label htmlFor={`imp-a-${i}`} className="sr-only">{t("imp.spalteArt")}</label>
                      <select id={`imp-a-${i}`} value={z.beschaeftigung} onChange={e => aendere(i, "beschaeftigung", e.target.value)} className={feldKlasse}>
                        {BESCHAEFTIGUNGSARTEN.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <label htmlFor={`imp-h-${i}`} className="sr-only">{t("imp.spalteStunden")}</label>
                      <input id={`imp-h-${i}`} inputMode="decimal" value={String(z.stundenWoche)} onChange={e => aendere(i, "stundenWoche", e.target.value)} className={feldKlasse}/>
                    </td>
                    <td className="px-2 py-1.5 w-10">
                      <button type="button" onClick={() => entferne(i)} aria-label={`${t("imp.entfernen")}: ${z.name}`} className="px-2 py-1 text-[13px] text-[var(--tinte-matt)]">✕</button>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}

      {phase === "fertig" && (<div className="space-y-3">
          <p className="text-[13px] text-[var(--tinte)]">
            <strong>{ergebnis.length} {t("imp.fertigTitel")}</strong>
          </p>
          <p className="text-[13px] text-[var(--tinte-matt)]">
            {t("imp.fertigHinweis")}
            {gueltigBis && ` ${t("imp.gueltigBis")} ${new Date(gueltigBis).toLocaleDateString("de-DE")}.`}
          </p>

          <div className="flex gap-2">
            <button type="button" onClick={kopieren} className="px-3 py-2 rounded-xl border border-[var(--linie)] text-[13px] text-[var(--tinte)]">
              {t("imp.kopieren")}
            </button>
            <button type="button" onClick={herunterladen} className="px-3 py-2 rounded-xl border border-[var(--linie)] text-[13px] text-[var(--tinte)]">
              {t("imp.csv")}
            </button>
            {mitEmail > 0 && (<button type="button" onClick={versenden} disabled={versendetLaeuft || versendet !== null} className="px-3 py-2 rounded-xl bg-[var(--akzent)] text-white text-[13px] font-medium disabled:opacity-50">
                {versendetLaeuft ? t("imp.versendetLaeuft") : `${mitEmail} ${t("imp.versenden")}`}
              </button>)}
          </div>

          {versendet && (<p className="text-[13px] text-[var(--tinte)]">
              {versendet.anzahl} {t("imp.versendetFertig")}
              {versendet.uebersprungen > 0 && ` · ${versendet.uebersprungen} ${t("imp.versendetRest")}`}
            </p>)}

          <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[var(--linie)]">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[var(--papier-tief)]">
                <tr className="text-left text-[var(--tinte-matt)]">
                  <th className="px-3 py-2 font-medium">{t("imp.spalteName")}</th>
                  <th className="px-3 py-2 font-medium">{t("imp.spalteCode")}</th>
                </tr>
              </thead>
              <tbody>
                {ergebnis.map(e => (<tr key={e.code} className="border-t border-[var(--linie)]">
                    <td className="px-3 py-1.5 text-[var(--tinte)]">{e.name}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--tinte)]">{e.code}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>)}
    </Modal>);
}

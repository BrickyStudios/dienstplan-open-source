"use client";
import { useState, useRef, useCallback } from "react";
import { toLocalISODate, utcTagISO } from "@/lib/date";
import { Upload, X, FileSpreadsheet, Check, AlertTriangle, Loader2, ChevronRight, Info, } from "lucide-react";
type RawRow = Record<string, unknown>;
type ImportShift = {
    date: string;
    station: string;
    shift_type: "frueh" | "spaet" | "nacht";
    start_time: string | null;
    end_time: string | null;
    planned_staff: number;
    actual_staff: number;
    notes: string;
};
type ColMap = {
    date: string;
    start_time: string;
    end_time: string;
    station: string;
    planned_staff: string;
    actual_staff: string;
    notes: string;
    shift_type: string;
};
const NONE = "__none__";
const SHIFT_MAP: Record<string, "frueh" | "spaet" | "nacht"> = {
    früh: "frueh", frühschicht: "frueh", frueh: "frueh", f: "frueh", fs: "frueh",
    spät: "spaet", spätschicht: "spaet", spaet: "spaet", s: "spaet", ss: "spaet",
    nacht: "nacht", nachtschicht: "nacht", n: "nacht", ns: "nacht", night: "nacht",
};
function parseTime(raw: unknown): string | null {
    if (raw == null || raw === "")
        return null;
    if (typeof raw === "number" && raw >= 0 && raw < 1) {
        const mins = Math.round(raw * 1440);
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const str = String(raw).trim();
    const m = str.match(/^(\d{1,2}):(\d{2})/);
    if (m)
        return `${m[1].padStart(2, "0")}:${m[2]}`;
    return null;
}
function deriveShiftTypeFromTime(startTime: string | null): "frueh" | "spaet" | "nacht" {
    if (!startTime)
        return "frueh";
    const h = parseInt(startTime.split(":")[0] ?? "0", 10);
    if (h >= 5 && h < 14)
        return "frueh";
    if (h >= 14 && h < 21)
        return "spaet";
    return "nacht";
}
function parseDate(raw: unknown): string | null {
    if (raw == null || raw === "")
        return null;
    if (typeof raw === "number") {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        epoch.setUTCDate(epoch.getUTCDate() + Math.floor(raw));
        return utcTagISO(epoch);
    }
    const str = String(raw).trim();
    const m1 = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (m1) {
        const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
        return `${y}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str))
        return str;
    const d = new Date(str);
    if (!isNaN(d.getTime()))
        return toLocalISODate(d);
    return null;
}
function parseShiftType(raw: unknown): "frueh" | "spaet" | "nacht" | null {
    if (raw == null)
        return null;
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
    return SHIFT_MAP[s] ?? null;
}
function autoDetect(headers: string[]): {
    map: Partial<ColMap>;
    scores: Partial<Record<keyof ColMap, number>>;
} {
    const KEYWORDS: Record<keyof ColMap, string[]> = {
        date: ["datum", "date", "tag", "day", "dat", "tage", "kalendertag"],
        start_time: ["von", "start", "beginn", "ab", "startzeit", "anfang", "uhrzeitvon", "zeitvon", "vonuhr"],
        end_time: ["bis", "end", "ende", "schluss", "endzeit", "bisuchr", "zeitbis", "uhrzeitbis", "fertig"],
        station: ["station", "bereich", "ward", "abteilung", "einheit", "zimmer", "gruppe", "unit", "ort"],
        planned_staff: ["geplant", "soll", "planned", "plan", "sollbesetzung", "planstellen", "besetzungsplan"],
        actual_staff: ["besetzt", "ist", "actual", "tatsaechl", "tatsächl", "aktuell", "real", "istbesetzung", "anwesend"],
        notes: ["notiz", "anmerk", "hinweis", "note", "notes", "bemerk", "komment", "kommentar", "info"],
        shift_type: ["schicht", "dienst", "dienstart", "schichttyp", "typ", "art", "shift", "schichtart", "diensttyp"],
    };
    const scored: Record<keyof ColMap, Array<{
        header: string;
        score: number;
    }>> = {
        date: [], start_time: [], end_time: [], station: [],
        planned_staff: [], actual_staff: [], notes: [], shift_type: [],
    };
    for (const h of headers) {
        const norm = h.toLowerCase().replace(/[\s_\-.]+/g, "");
        for (const [field, kws] of Object.entries(KEYWORDS) as Array<[
            keyof ColMap,
            string[]
        ]>) {
            let score = 0;
            for (const kw of kws) {
                if (norm === kw) {
                    score += 3;
                    break;
                }
                if (norm.startsWith(kw)) {
                    score += 2;
                }
                else if (norm.includes(kw)) {
                    score += 1;
                }
            }
            if (score > 0)
                scored[field].push({ header: h, score });
        }
    }
    const map: Partial<ColMap> = {};
    const bestScores: Partial<Record<keyof ColMap, number>> = {};
    const used = new Set<string>();
    for (const field of Object.keys(scored) as Array<keyof ColMap>) {
        const best = scored[field].filter(c => !used.has(c.header)).sort((a, b) => b.score - a.score)[0];
        if (best) {
            map[field] = best.header;
            bestScores[field] = best.score;
            used.add(best.header);
        }
    }
    return { map, scores: bestScores };
}
const SHIFT_LABEL: Record<string, string> = { frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" };
const SHIFT_STYLE: Record<string, string> = {
    frueh: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]",
    spaet: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]",
    nacht: "bg-[var(--akzent-flaeche)] text-[var(--akzent)]",
};
const STEPS = ["Datei", "Spalten", "Vorschau", "Fertig"] as const;
type Step = "upload" | "map" | "preview" | "done";
const STEP_IDX: Record<Step, number> = { upload: 0, map: 1, preview: 2, done: 3 };
export default function ExcelImport({ facilityName, onImported, }: {
    facilityName: string;
    onImported: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [step, setStep] = useState<Step>("upload");
    const [fileName, setFileName] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<RawRow[]>([]);
    const [colMap, setColMap] = useState<ColMap>({
        date: "", start_time: "", end_time: "", station: "", planned_staff: "", actual_staff: "", notes: "", shift_type: "",
    });
    const [parsed, setParsed] = useState<ImportShift[]>([]);
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [fileError, setFileError] = useState("");
    const [autoSkipped, setAutoSkipped] = useState(false);
    const [detectedCols, setDetectedCols] = useState<Partial<ColMap>>({});
    const [importing, setImporting] = useState(false);
    const [importedCount, setImportedCount] = useState(0);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    function reset() {
        setDragging(false);
        setStep("upload");
        setFileName("");
        setHeaders([]);
        setRows([]);
        setColMap({ date: "", start_time: "", end_time: "", station: "", planned_staff: "", actual_staff: "", notes: "", shift_type: "" });
        setParsed([]);
        setParseErrors([]);
        setFileError("");
        setImporting(false);
        setImportedCount(0);
        setImportErrors([]);
        setAutoSkipped(false);
        setDetectedCols({});
    }
    function close() {
        setOpen(false);
        setTimeout(reset, 200);
    }
    function readFile(file: File) {
        setFileError("");
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const buffer = e.target!.result as ArrayBuffer;
                const ExcelJS = (await import("exceljs")).default;
                const wb = new ExcelJS.Workbook();
                await wb.xlsx.load(buffer);
                const ws = wb.worksheets[0];
                if (!ws || ws.rowCount < 2) {
                    setFileError("Keine Daten in der Datei gefunden.");
                    return;
                }
                const hdrs: string[] = [];
                ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
                    hdrs[col - 1] = cell.value != null ? String(cell.value).trim() : `__col${col}`;
                });
                const allRows: RawRow[] = [];
                ws.eachRow((row, rowNumber) => {
                    if (rowNumber === 1)
                        return;
                    const rowData: RawRow = {};
                    row.eachCell({ includeEmpty: true }, (cell, col) => {
                        const hdr = hdrs[col - 1];
                        if (!hdr)
                            return;
                        const val = cell.value;
                        if (val === null || val === undefined) {
                            rowData[hdr] = null;
                        }
                        else if (val instanceof Date) {
                            if (val.getUTCFullYear() <= 1900) {
                                rowData[hdr] = (val.getUTCHours() * 60 + val.getUTCMinutes()) / 1440;
                            }
                            else {
                                rowData[hdr] = utcTagISO(val);
                            }
                        }
                        else if (typeof val === "object" && "result" in val) {
                            rowData[hdr] = (val as {
                                result: unknown;
                            }).result ?? null;
                        }
                        else if (typeof val === "object" && "richText" in val) {
                            rowData[hdr] = (val as {
                                richText: Array<{
                                    text: string;
                                }>;
                            }).richText.map(r => r.text).join("");
                        }
                        else if (typeof val === "object" && "text" in val) {
                            rowData[hdr] = (val as {
                                text: string;
                            }).text;
                        }
                        else {
                            rowData[hdr] = val;
                        }
                    });
                    if (Object.keys(rowData).length > 0)
                        allRows.push(rowData);
                });
                if (allRows.length === 0) {
                    setFileError("Keine Daten in der Datei gefunden.");
                    return;
                }
                const { map: detected } = autoDetect(hdrs.filter(Boolean));
                const newMap: ColMap = {
                    date: detected.date ?? "",
                    start_time: detected.start_time ?? "",
                    end_time: detected.end_time ?? "",
                    station: detected.station ?? "",
                    planned_staff: detected.planned_staff ?? "",
                    actual_staff: detected.actual_staff ?? "",
                    notes: detected.notes ?? "",
                    shift_type: detected.shift_type ?? "",
                };
                setHeaders(hdrs.filter(Boolean));
                setRows(allRows);
                setFileName(file.name);
                setColMap(newMap);
                setDetectedCols(detected);
                if (detected.date) {
                    setAutoSkipped(true);
                    buildPreviewWithMap(newMap, allRows);
                }
                else {
                    setStep("map");
                }
            }
            catch {
                setFileError("Fehler beim Lesen der Datei. Bitte .xlsx oder .xls verwenden.");
            }
        };
        reader.readAsArrayBuffer(file);
    }
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file)
            readFile(file);
    }, []);
    function buildPreviewWithMap(mapToUse: ColMap, rowsToUse: RawRow[]) {
        const errors: string[] = [];
        const result: ImportShift[] = [];
        rowsToUse.forEach((row, idx) => {
            const rowNum = idx + 2;
            const dateRaw = mapToUse.date ? row[mapToUse.date] : null;
            const date = parseDate(dateRaw);
            if (!date) {
                errors.push(`Zeile ${rowNum}: Ungültiges Datum "${dateRaw ?? "(leer)"}"`);
                return;
            }
            const start_time = mapToUse.start_time ? parseTime(row[mapToUse.start_time]) : null;
            const end_time = mapToUse.end_time ? parseTime(row[mapToUse.end_time]) : null;
            const parsedType = mapToUse.shift_type ? parseShiftType(row[mapToUse.shift_type]) : null;
            const shift_type = parsedType ?? (start_time ? deriveShiftTypeFromTime(start_time) : "frueh");
            result.push({
                date,
                station: mapToUse.station ? String(row[mapToUse.station] ?? "Station 1").trim() : "Station 1",
                shift_type,
                start_time,
                end_time,
                planned_staff: mapToUse.planned_staff ? parseInt(String(row[mapToUse.planned_staff] ?? "0")) || 0 : 0,
                actual_staff: mapToUse.actual_staff ? parseInt(String(row[mapToUse.actual_staff] ?? "0")) || 0 : 0,
                notes: mapToUse.notes ? String(row[mapToUse.notes] ?? "").trim() : "",
            });
        });
        setParsed(result);
        setParseErrors(errors);
        setStep("preview");
    }
    function buildPreview() {
        buildPreviewWithMap(colMap, rows);
    }
    async function handleImport() {
        setImporting(true);
        setImportErrors([]);
        const CHUNK = 100;
        let count = 0;
        const errors: string[] = [];
        for (let i = 0; i < parsed.length; i += CHUNK) {
            const chunk = parsed.slice(i, i + CHUNK);
            try {
                const res = await fetch("/api/leitung/shifts/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ shifts: chunk }),
                });
                const json = await res.json();
                if (res.ok) {
                    count += json.inserted ?? chunk.length;
                }
                else {
                    errors.push(json.error ?? "Unbekannter Fehler");
                }
            }
            catch {
                errors.push("Netzwerkfehler beim Import");
            }
        }
        setImportedCount(count);
        setImportErrors(errors);
        setImporting(false);
        setStep("done");
        if (errors.length === 0)
            onImported();
    }
    if (!open) {
        return (<button onClick={() => setOpen(true)} aria-label="Schichtplan aus Excel-Datei importieren" data-tooltip="Schichtplan aus Excel-Datei importieren" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)] transition-colors">
        <FileSpreadsheet size={14}/>
        Excel importieren
      </button>);
    }
    const stepIdx = STEP_IDX[step];
    return (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget)
        close(); }}>
      <div className="bg-[var(--papier)] rounded-2xl  w-full max-w-2xl max-h-[90vh] flex flex-col">

        
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--linie)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet size={18} className="text-[var(--ok)]"/>
            <h2 className="font-semibold text-[var(--tinte)]">Excel-Import</h2>
            {fileName && <span className="text-[13px] text-[var(--tinte-leise)] font-normal">{fileName}</span>}
          </div>
          <button onClick={close} aria-label="Import schließen" data-tooltip="Import schließen" className="text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)] transition-colors p-1">
            <X size={18}/>
          </button>
        </div>

        
        <div className="flex items-center gap-1.5 px-6 py-3 border-b border-[var(--linie)] flex-shrink-0">
          {STEPS.map((label, i) => (<div key={label} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={11} className="text-[var(--tinte-leise)] flex-shrink-0"/>}
              <span className={`text-[13px] font-medium transition-colors ${i === stepIdx ? "text-[var(--tinte)]" : i < stepIdx ? "text-[var(--ok)]" : "text-[var(--tinte-leise)]"}`}>
                {i < stepIdx ? "✓ " : ""}{label}
              </span>
            </div>))}
        </div>

        
        <div className="flex-1 overflow-y-auto px-6 py-5">

          
          {step === "upload" && (<div className="space-y-4">
              <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${dragging ? "border-[var(--linie)] bg-[var(--akzent-flaeche)]" : "border-[var(--linie)] hover:border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
                <Upload size={28} className={`mx-auto mb-3 transition-colors ${dragging ? "text-[var(--akzent)]" : "text-[var(--tinte-leise)]"}`}/>
                <p className="text-[var(--tinte-matt)] font-medium">Excel-Datei hierher ziehen</p>
                <p className="text-[var(--tinte-leise)] text-sm mt-1">oder klicken zum Auswählen · .xlsx · .xls · .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden" onChange={e => { if (e.target.files?.[0])
            readFile(e.target.files[0]); }}/>

              {fileError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-4 py-3 rounded-lg">
                  <AlertTriangle size={14} className="flex-shrink-0"/>{fileError}
                </div>)}

              <div className="bg-[var(--papier-tief)] rounded-xl p-4 text-[13px] text-[var(--tinte-leise)] space-y-2">
                <div className="flex items-center gap-1.5 text-[var(--tinte-matt)] font-semibold mb-1">
                  <Info size={13}/>
                  Erwartetes Format
                </div>
                <p>Eine Zeile pro Schicht, erste Zeile = Spaltenüberschriften</p>
                <div className="overflow-x-auto rounded-lg border border-[var(--linie)] bg-[var(--papier)]">
                  <table className="text-[13px] w-full">
                    <thead>
                      <tr className="border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                        {["Datum", "Station", "Von", "Bis", "Geplant", "Besetzt", "Notiz"].map(h => (<th key={h} className="px-3 py-2 text-left font-semibold text-[var(--tinte-matt)]">{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[var(--linie)]">
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">01.05.2026</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">Station 1</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">06:00</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">14:00</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">4</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">3</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">Krankmeldung</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">01.05.2026</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">Station 1</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">22:00</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">06:00</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">2</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]">2</td>
                        <td className="px-3 py-1.5 text-[var(--tinte-leise)]"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[var(--tinte-leise)]">Zeiten: beliebige Uhrzeiten im Format HH:MM · Schichttyp wird automatisch abgeleitet</p>
              </div>
            </div>)}

          
          {step === "map" && (<div className="space-y-4">
              <p className="text-sm text-[var(--tinte-leise)]">
                {rows.length} Zeilen erkannt. Ordne die Excel-Spalten den Schicht-Feldern zu.
                Felder mit <span className="text-[var(--gefahr)]">*</span> sind Pflichtfelder.
              </p>

              <div className="space-y-2.5">
                {([
                { key: "date" as keyof ColMap, label: "Datum", required: true },
                { key: "start_time" as keyof ColMap, label: "Von (Uhrzeit)", required: true },
                { key: "end_time" as keyof ColMap, label: "Bis (Uhrzeit)" },
                { key: "station" as keyof ColMap, label: "Station" },
                { key: "planned_staff" as keyof ColMap, label: "Geplante Mitarbeiter" },
                { key: "actual_staff" as keyof ColMap, label: "Besetzte Mitarbeiter" },
                { key: "shift_type" as keyof ColMap, label: "Schichttyp (F/S/N)" },
                { key: "notes" as keyof ColMap, label: "Notiz" },
            ]).map(({ key, label, required }) => (<div key={key} className="flex items-center gap-3">
                    <label htmlFor={`excelimport-${key}`} className="w-44 text-sm text-[var(--tinte-matt)] flex-shrink-0">
                      {label}{required && <span className="text-[var(--gefahr)] ml-0.5">*</span>}
                    </label>
                    <select id={`excelimport-${key}`} value={colMap[key] || NONE} onChange={e => setColMap(m => ({ ...m, [key]: e.target.value === NONE ? "" : e.target.value }))} className={`flex-1 px-3 py-2 border rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--linie)] ${required && !colMap[key] ? "border-[var(--gefahr)] bg-[var(--gefahr-flaeche)]" : "border-[var(--linie)]"}`}>
                      <option value={NONE}>— nicht importieren —</option>
                      {headers.map(h => (<option key={h} value={h}>{h}</option>))}
                    </select>
                    <span className="w-5 flex-shrink-0">
                      {colMap[key]
                    ? <Check size={14} className="text-[var(--ok)]"/>
                    : required
                        ? <AlertTriangle size={14} className="text-[var(--gefahr)]"/>
                        : null}
                    </span>
                  </div>))}
              </div>

              
              <div className="rounded-xl border border-[var(--linie)] overflow-hidden">
                <div className="bg-[var(--papier-tief)] px-4 py-2 border-b border-[var(--linie)]">
                  <p className="text-[13px] font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">Daten-Vorschau (erste 3 Zeilen)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--linie)]">
                        {headers.slice(0, 8).map(h => (<th key={h} className="px-3 py-2 text-left font-medium text-[var(--tinte-leise)] whitespace-nowrap">{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, i) => (<tr key={i} className={i < 2 ? "border-b border-[var(--linie)]" : ""}>
                          {headers.slice(0, 8).map(h => (<td key={h} className="px-3 py-2 text-[var(--tinte-matt)] whitespace-nowrap">{String(row[h] ?? "")}</td>))}
                        </tr>))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={buildPreview} disabled={!colMap.date || !colMap.start_time} aria-label="Importvorschau mit aktueller Spaltenzuordnung anzeigen" data-tooltip="Importvorschau mit aktueller Spaltenzuordnung anzeigen" className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-40 transition-colors">
                  Vorschau anzeigen
                </button>
                <button onClick={reset} aria-label="Andere Excel-Datei auswählen" data-tooltip="Andere Excel-Datei auswählen" className="px-5 py-2.5 text-[var(--tinte-matt)] text-sm rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)]">
                  Andere Datei
                </button>
              </div>
            </div>)}

          
          {step === "preview" && (<div className="space-y-4">
              {autoSkipped && (<div className="bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[var(--ok)] text-sm font-medium">
                    <Check size={14} className="flex-shrink-0"/>
                    Spalten automatisch erkannt
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(detectedCols) as Array<[
                    keyof ColMap,
                    string
                ]>)
                    .filter(([, v]) => v)
                    .map(([field, col]) => {
                    const LABELS: Record<keyof ColMap, string> = {
                        date: "Datum", start_time: "Von", end_time: "Bis",
                        station: "Station", planned_staff: "Geplant",
                        actual_staff: "Besetzt", notes: "Notiz", shift_type: "Schichttyp",
                    };
                    return (<span key={field} className="inline-flex items-center gap-1 text-[13px] bg-[var(--papier)] border border-[var(--linie)] text-[var(--ok)] rounded-full px-2 py-0.5">
                            <span className="text-[var(--ok)] font-medium">{LABELS[field]}</span>
                            <span className="text-[var(--ok)]">→</span>
                            <span>{col}</span>
                          </span>);
                })}
                  </div>
                </div>)}
              <div className="flex items-center gap-4">
                <div className="bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-xl px-4 py-3 flex-1 text-center">
                  <p className="text-2xl font-semibold text-[var(--ok)]">{parsed.length}</p>
                  <p className="text-[13px] text-[var(--ok)] mt-0.5">Schichten bereit</p>
                </div>
                {parseErrors.length > 0 && (<div className="bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-xl px-4 py-3 flex-1 text-center">
                    <p className="text-2xl font-semibold text-[var(--warnung)]">{parseErrors.length}</p>
                    <p className="text-[13px] text-[var(--warnung)] mt-0.5">Zeilen übersprungen</p>
                  </div>)}
              </div>

              {parseErrors.length > 0 && (<div className="bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-xl p-4">
                  <p className="text-[13px] font-semibold text-[var(--warnung)] mb-2">Übersprungene Zeilen (Datum oder Schichttyp nicht erkannt):</p>
                  <div className="space-y-0.5">
                    {parseErrors.slice(0, 6).map((e, i) => (<p key={i} className="text-[13px] text-[var(--warnung)]">{e}</p>))}
                    {parseErrors.length > 6 && (<p className="text-[13px] text-[var(--warnung)]">… und {parseErrors.length - 6} weitere</p>)}
                  </div>
                </div>)}

              {parsed.length > 0 && (<div className="rounded-xl border border-[var(--linie)] overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[var(--papier-tief)] border-b border-[var(--linie)]">
                        <tr>
                          {["Datum", "Station", "Schicht", "Geplant", "Besetzt", "Notiz"].map(h => (<th key={h} className="px-3 py-2 text-left text-[13px] font-semibold text-[var(--tinte-leise)] uppercase tracking-wide">{h}</th>))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--linie)]">
                        {parsed.slice(0, 50).map((s, i) => (<tr key={i} className="hover:bg-[var(--papier-tief)]">
                            <td className="px-3 py-2 text-[var(--tinte-matt)] whitespace-nowrap">
                              {new Date(s.date + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </td>
                            <td className="px-3 py-2 text-[var(--tinte-matt)]">{s.station}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[13px] px-2 py-0.5 rounded-full font-medium ${SHIFT_STYLE[s.shift_type]}`}>
                                {SHIFT_LABEL[s.shift_type]}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[var(--tinte-matt)]">{s.planned_staff}</td>
                            <td className="px-3 py-2 text-[var(--tinte-matt)]">{s.actual_staff}</td>
                            <td className="px-3 py-2 text-[var(--tinte-leise)] text-[13px] truncate max-w-[120px]">{s.notes || "—"}</td>
                          </tr>))}
                      </tbody>
                    </table>
                    {parsed.length > 50 && (<p className="text-[13px] text-[var(--tinte-leise)] text-center py-2 border-t border-[var(--linie)]">
                        … und {parsed.length - 50} weitere Einträge
                      </p>)}
                  </div>
                </div>)}

              <div className="flex gap-3 pt-1">
                <button onClick={handleImport} disabled={importing || parsed.length === 0} aria-label="Alle erkannten Schichten in den Dienstplan importieren" data-tooltip="Alle erkannten Schichten in den Dienstplan importieren" className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors">
                  {importing
                ? <Loader2 size={14} className="animate-spin"/>
                : <Check size={14}/>}
                  {importing ? "Importiere…" : `${parsed.length} Schichten importieren`}
                </button>
                <button onClick={() => { setAutoSkipped(false); setStep("map"); }} disabled={importing} aria-label="Spaltenzuordnung manuell anpassen" data-tooltip="Spaltenzuordnung manuell anpassen" className="px-5 py-2.5 text-[var(--tinte-matt)] text-sm rounded-lg border border-[var(--linie)] hover:bg-[var(--papier-tief)] disabled:opacity-50">
                  {autoSkipped ? "Spalten anpassen" : "Zurück"}
                </button>
              </div>
            </div>)}

          
          {step === "done" && (<div className="text-center py-6">
              {importErrors.length === 0 ? (<>
                  <div className="w-14 h-14 bg-[var(--ok-flaeche)] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={24} className="text-[var(--ok)]"/>
                  </div>
                  <p className="text-2xl font-semibold text-[var(--tinte)] mb-1">{importedCount} Schichten importiert</p>
                  <p className="text-[var(--tinte-leise)] text-sm">Der Dienstplan wurde erfolgreich aktualisiert.</p>
                </>) : (<>
                  <div className="w-14 h-14 bg-[var(--warnung-flaeche)] rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={24} className="text-[var(--warnung)]"/>
                  </div>
                  <p className="text-xl font-semibold text-[var(--tinte)] mb-2">{importedCount} Schichten importiert</p>
                  <div className="space-y-1 mb-4">
                    {importErrors.map((e, i) => (<p key={i} className="text-sm text-[var(--gefahr)]">{e}</p>))}
                  </div>
                </>)}
              <button onClick={close} aria-label="Import-Dialog schließen" data-tooltip="Import-Dialog schließen" className="mt-4 px-6 py-2.5 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
                Schließen
              </button>
            </div>)}

        </div>
      </div>
    </div>);
}

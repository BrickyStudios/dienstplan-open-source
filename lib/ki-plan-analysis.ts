import { aiComplete, aiModel, aiProvider, isAiConfigured } from "@/lib/ai";
import { erstelleAnonymisierung, KUERZEL_HINWEIS } from "@/lib/ai-anonym";
import { aiContentMeta, type AiContentMeta } from "@/lib/ai-transparency";
import { planAusZeile } from "@/lib/plan";
export type Optimization = {
    station: string;
    shift_type: string;
    current_planned_staff: number;
    recommended_planned_staff: number;
    recommended_start_time: string | null;
    recommended_end_time: string | null;
    reason: string;
};
export type AnalysisResult = {
    summary: string;
    optimizations: Optimization[];
    notes: string;
    aggregated: any[];
    ai: AiContentMeta;
};
export const KI_PLAN_ENABLED = true;
const shiftTypeLabel = (t: string) => t === "frueh" ? "Frühschicht" : t === "spaet" ? "Spätschicht" : "Nachtschicht";
export async function analyzePlan(admin: any, facilityName: string, from: string, to: string, pastNotes: string[] = []): Promise<AnalysisResult | {
    error: string;
}> {
    if (!isAiConfigured())
        return { error: "KI ist nicht konfiguriert" };
    const { data: shifts } = await admin.from("shifts")
        .select("station, date, shift_type, start_time, end_time, planned_staff, actual_staff")
        .eq("facility_name", facilityName)
        .gte("date", from)
        .lte("date", to)
        .order("date");
    if (!shifts || shifts.length === 0)
        return { error: "Keine Schichtdaten im gewählten Zeitraum" };
    const { data: planRow } = await admin.from("facility_settings").select("plan, ort").eq("facility_name", facilityName).maybeSingle();
    const plan = planAusZeile(planRow);
    const domain = plan === "praxis" ? "Dienstplanung in Arztpraxen"
        : plan === "pflege" ? "Personalbemessung in vollstationären Pflegeeinrichtungen nach § 113c SGB XI (PeBeM) sowie Personalmindestbestand und Fachkraftquote nach Landesrecht"
            : "Personalbemessung in deutschen Krankenhäusern nach der Pflegepersonalbemessungsverordnung (PPBV)";
    const minStaffingHint = plan === "praxis" ? ""
        : plan === "pflege" ? " (Mindestbesetzung je Wohnbereich beachten: Frühdienst mind. 3, Spätdienst mind. 2, Nachtdienst mind. 1 — verbindlich sind die Vorgaben des jeweiligen Landesrechts)"
            : " (PPBV-Mindestwerte beachten: Frühschicht mind. 3, Spätschicht mind. 2, Nachtschicht mind. 1)";
    const agg: Record<string, {
        planned: number[];
        actual: number[];
        start_times: string[];
        end_times: string[];
    }> = {};
    for (const s of shifts) {
        const key = `${s.station}||${s.shift_type}`;
        if (!agg[key])
            agg[key] = { planned: [], actual: [], start_times: [], end_times: [] };
        agg[key].planned.push(s.planned_staff ?? 0);
        agg[key].actual.push(s.actual_staff ?? 0);
        if (s.start_time)
            agg[key].start_times.push(s.start_time);
        if (s.end_time)
            agg[key].end_times.push(s.end_time);
    }
    const aggRows = Object.entries(agg).map(([key, v]) => {
        const [station, shift_type] = key.split("||");
        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;
        const mostCommon = (arr: string[]) => {
            if (!arr.length)
                return null;
            const m = new Map<string, number>();
            for (const x of arr)
                m.set(x, (m.get(x) ?? 0) + 1);
            return [...m].sort((a, b) => b[1] - a[1])[0][0];
        };
        return {
            station, shift_type,
            avg_planned: avg(v.planned),
            avg_actual: avg(v.actual),
            compliance_pct: v.planned.some(p => p > 0)
                ? Math.round(v.actual.reduce((a, b) => a + b, 0) / v.planned.reduce((a, b) => a + b, 0) * 100)
                : 100,
            most_common_start: mostCommon(v.start_times),
            most_common_end: mostCommon(v.end_times),
        };
    });
    const an = erstelleAnonymisierung({
        stationen: aggRows.map(r => r.station),
        einrichtung: [facilityName, planRow?.ort ?? null],
    });
    const tableText = aggRows.map(r => `${an.station(r.station)} | ${shiftTypeLabel(r.shift_type)} | Geplant Ø${r.avg_planned} | Besetzt Ø${r.avg_actual} | Compliance ${r.compliance_pct}% | Zeiten ${r.most_common_start ?? "?"}-${r.most_common_end ?? "?"}`).join("\n");
    const memoryText = pastNotes.filter(Boolean).slice(-3).map((n, i) => `Lauf ${i + 1}: ${an.bekannt(n)}`).join("\n");
    const prompt = `Du bist ein Experte für ${domain}.

Analysiere diese aggregierten Schichtdaten (Zeitraum ${from} bis ${to}):

${tableText}
${memoryText ? `\nNotizen deiner vorherigen Analysen (berücksichtige wiederkehrende Muster):\n${memoryText}\n` : ""}
Passe planned_staff an die tatsächliche Auslastung an${minStaffingHint}. Erhöhe bei chronischer Unterbesetzung (Compliance <80%), reduziere bei dauerhafter Überbesetzung (Compliance >115%). Empfiehl Zeitanpassungen (Kommen/Gehen) nur wenn die häufigsten Ist-Zeiten klar von den geplanten abweichen.

WICHTIG: Antworte NUR mit gültigem JSON in diesem Format (kein Text davor/danach):
{
  "summary": "1-2 Sätze Gesamtbewertung",
  "notes": "1-3 Sätze Notiz für deinen nächsten monatlichen Lauf — was du beobachtet hast und worauf du nächstes Mal achten solltest",
  "optimizations": [
    { "station": "Stationskürzel genau wie in der Tabelle (z.B. S01)", "shift_type": "frueh|spaet|nacht", "current_planned_staff": 3, "recommended_planned_staff": 4, "recommended_start_time": "06:00", "recommended_end_time": "14:00", "reason": "kurze Begründung" }
  ]
}

Füge nur Einträge ein, wo eine tatsächliche Änderung sinnvoll ist. Bleibt eine Zeit unverändert, nutze null für start/end.

${KUERZEL_HINWEIS}`;
    const raw = (await aiComplete({
        messages: [{ role: "user", content: prompt }], maxTokens: 4000, schranke: an.schranke,
    })).trim() || "{}";
    let parsed: {
        summary?: string;
        notes?: string;
        optimizations?: Optimization[];
    };
    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] ?? raw);
    }
    catch {
        return { error: "KI-Antwort konnte nicht verarbeitet werden" };
    }
    const meta = aiContentMeta(aiProvider(), aiModel());
    const minStaff = (t: string) => plan === "praxis" ? 1 : ({ frueh: 3, spaet: 2, nacht: 1 }[t] ?? 1);
    const knownStations = new Set(aggRows.map(r => r.station));
    const isTime = (t: unknown) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    const optimizations = (Array.isArray(parsed.optimizations) ? parsed.optimizations : [])
        .map(o => ({ ...o, station: an.stationName(String(o?.station ?? "")) ?? o?.station, reason: an.zurueckText(String(o?.reason ?? "")) }))
        .filter(o => knownStations.has(o?.station) &&
        ["frueh", "spaet", "nacht"].includes(o?.shift_type) &&
        Number.isInteger(o?.recommended_planned_staff) &&
        o.recommended_planned_staff >= minStaff(o.shift_type))
        .map(o => ({
        ...o,
        recommended_start_time: isTime(o.recommended_start_time) ? o.recommended_start_time : null,
        recommended_end_time: isTime(o.recommended_end_time) ? o.recommended_end_time : null,
        ai_generated: true as const,
    }));
    return {
        summary: an.zurueckText(parsed.summary ?? ""),
        notes: an.zurueckText(parsed.notes ?? ""),
        optimizations,
        aggregated: aggRows,
        ai: meta,
    };
}

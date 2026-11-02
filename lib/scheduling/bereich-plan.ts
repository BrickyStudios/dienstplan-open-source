import { admin as createAdminClient } from "@/lib/admin-client";
import { ladeGenehmigteAbwesenheiten } from "@/lib/scheduling/plan-context";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { utcTagISO } from "@/lib/date";
import { dienstSchluessel, fehlendeDienste, personSchluessel, tageVon, vereineVorlagen, verteileBesetzung, vorlagenAusHistorie, type BereichsVorlage, type Mitglied, type VorhandenerDienst, type ZuBesetzenderDienst, } from "@/lib/scheduling/bereich-automatik";
type AdminClient = ReturnType<typeof createAdminClient>;
export const HISTORIE_TAGE = 56;
export type BereichsplanErgebnis = {
    dienste: number;
    besetzungen: number;
    bereicheGeplant: number;
    hinweise: string[];
};
const LEER = (hinweis: string): BereichsplanErgebnis => ({ dienste: 0, besetzungen: 0, bereicheGeplant: 0, hinweise: [hinweis] });
function minusTage(iso: string, tage: number): string {
    return utcTagISO(Date.parse(`${iso}T12:00:00Z`) - tage * 86400000);
}
function migrationFehlt(error: {
    code?: string;
} | null | undefined): boolean {
    return tabelleFehlt(error) || spalteFehlt(error);
}
export async function erzeugeBereichsplan(admin: AdminClient, opts: {
    facilityName: string;
    von: string;
    bis: string;
}): Promise<BereichsplanErgebnis> {
    const { facilityName, von, bis } = opts;
    if (tageVon(von, bis).length === 0)
        return LEER("Zeitraum leer oder verdreht — nichts zu tun");
    const hinweise: string[] = [];
    const bereicheRes = await admin.from("bereiche").select("*").eq("facility_name", facilityName);
    if (bereicheRes.error) {
        return LEER(migrationFehlt(bereicheRes.error)
            ? "Tabelle 'bereiche' fehlt — Migration 20260602 nicht ausgeführt"
            : `Bereiche nicht lesbar: ${bereicheRes.error.message}`);
    }
    const bereiche = (bereicheRes.data ?? []) as Array<{
        id: string;
        name: string;
        auto_plan_enabled?: boolean | null;
    }>;
    const aktive = bereiche.filter(b => b.auto_plan_enabled !== false);
    if (aktive.length === 0)
        return LEER("Keine Bereiche mit eingeschalteter Automatik");
    const aktiveIds = new Set(aktive.map(b => b.id));
    let gepflegt: BereichsVorlage[] = [];
    const vorlagenRes = await admin
        .from("bereich_shift_templates")
        .select("bereich_id, weekday, start_time, end_time, label, staff_needed, active")
        .eq("facility_name", facilityName);
    if (vorlagenRes.error) {
        if (!migrationFehlt(vorlagenRes.error))
            hinweise.push(`Vorlagen nicht lesbar: ${vorlagenRes.error.message}`);
        else
            hinweise.push("Tabelle 'bereich_shift_templates' fehlt — es wird nur aus der Historie fortgeschrieben");
    }
    else {
        gepflegt = (vorlagenRes.data ?? [])
            .filter(v => v.active !== false && aktiveIds.has(v.bereich_id as string))
            .map(v => ({
            bereich_id: v.bereich_id as string,
            weekday: Number(v.weekday),
            start_time: (v.start_time as string | null) ?? null,
            end_time: (v.end_time as string | null) ?? null,
            label: (v.label as string | null) ?? null,
            staff_needed: Math.max(0, Number(v.staff_needed ?? 1)),
        }));
    }
    const histVon = minusTage(von, HISTORIE_TAGE);
    const histBis = minusTage(von, 1);
    let abgeleitet: BereichsVorlage[] = [];
    const histRes = await admin
        .from("bereich_shifts")
        .select("id, bereich_id, date, start_time, end_time, label")
        .eq("facility_name", facilityName)
        .gte("date", histVon)
        .lte("date", histBis);
    if (histRes.error) {
        if (migrationFehlt(histRes.error)) {
            return LEER("Tabelle 'bereich_shifts' fehlt — Migration 20260608 nicht ausgeführt");
        }
        hinweise.push(`Historie nicht lesbar: ${histRes.error.message}`);
    }
    else {
        const hist = ((histRes.data ?? []) as VorhandenerDienst[]).filter(d => aktiveIds.has(d.bereich_id));
        const besetzungProDienst: Record<string, number> = {};
        if (hist.length > 0) {
            const { data: histAssign } = await admin
                .from("bereich_shift_assignments")
                .select("shift_id")
                .in("shift_id", hist.map(h => h.id));
            for (const a of (histAssign ?? []) as Array<{
                shift_id: string;
            }>) {
                besetzungProDienst[a.shift_id] = (besetzungProDienst[a.shift_id] ?? 0) + 1;
            }
        }
        abgeleitet = vorlagenAusHistorie({ dienste: hist, besetzungProDienst });
    }
    const vorlagen = vereineVorlagen(gepflegt, abgeleitet);
    if (vorlagen.length === 0) {
        hinweise.push("Keine Wochenvorlage und kein wiederkehrendes Muster in den letzten acht Wochen — " +
            "es gibt nichts, was sich fortschreiben ließe.");
        return { dienste: 0, besetzungen: 0, bereicheGeplant: 0, hinweise };
    }
    const geplanteBereiche = new Set(vorlagen.map(v => v.bereich_id));
    const { data: vorhandenRoh, error: vorhandenErr } = await admin
        .from("bereich_shifts")
        .select("id, bereich_id, date, start_time, end_time, label")
        .eq("facility_name", facilityName)
        .gte("date", von)
        .lte("date", bis);
    if (vorhandenErr)
        return LEER(`Bestehende Dienste nicht lesbar: ${vorhandenErr.message}`);
    const vorhanden = (vorhandenRoh ?? []) as VorhandenerDienst[];
    const fehlende = fehlendeDienste({ von, bis, vorlagen, vorhanden });
    let neueDienste: VorhandenerDienst[] = [];
    if (fehlende.length > 0) {
        const { data, error } = await admin
            .from("bereich_shifts")
            .insert(fehlende.map(d => ({
            facility_name: facilityName,
            bereich_id: d.bereich_id,
            date: d.date,
            start_time: d.start_time,
            end_time: d.end_time,
            label: d.label,
        })))
            .select("id, bereich_id, date, start_time, label");
        if (error)
            return LEER(`Dienste nicht angelegt: ${error.message}`);
        neueDienste = (data ?? []) as VorhandenerDienst[];
    }
    const idNachSchluessel = new Map(neueDienste.map(d => [dienstSchluessel(d), d.id] as const));
    const bedarfNach = new Map<string, number>();
    for (const v of vorlagen) {
        bedarfNach.set(`${v.bereich_id}|${v.weekday}|${(v.start_time ?? "").trim().toLowerCase()}|${(v.label ?? "").trim().toLowerCase()}`, v.staff_needed);
    }
    const alleDienste: ZuBesetzenderDienst[] = [
        ...vorhanden.map(d => ({ id: d.id, bereich_id: d.bereich_id, date: d.date, bedarf: bedarfFuer(d, bedarfNach) })),
        ...fehlende.map(d => ({ id: idNachSchluessel.get(dienstSchluessel(d)) ?? "", bereich_id: d.bereich_id, date: d.date, bedarf: d.staff_needed })),
    ].filter(d => d.id && geplanteBereiche.has(d.bereich_id) && d.bedarf > 0);
    if (alleDienste.length === 0) {
        hinweise.push(neueDienste.length > 0 ? `${neueDienste.length} Dienste angelegt, keiner braucht Besetzung` : "Alles steht bereits");
        return { dienste: neueDienste.length, besetzungen: 0, bereicheGeplant: geplanteBereiche.size, hinweise };
    }
    const mitglieder = await ladeMitglieder(admin, facilityName, geplanteBereiche, hinweise);
    const bestehend = await ladeBestehendeBesetzung(admin, alleDienste.map(d => d.id));
    const gesperrt = await ladeSperren(admin, { facilityName, von, bis, mitglieder });
    const startLast = await ladeVorbelastung(admin, facilityName, von);
    const neu = verteileBesetzung({ dienste: alleDienste, mitglieder, gesperrt, bestehend, startLast });
    let besetzungen = 0;
    if (neu.length > 0) {
        const { error } = await admin
            .from("bereich_shift_assignments")
            .upsert(neu.map(b => ({ facility_name: facilityName, shift_id: b.shift_id, staff_name: b.staff_name, user_id: b.user_id })), { onConflict: "shift_id,staff_name" });
        if (error) {
            if (error.code === "23503") {
                const { error: zweiter } = await admin
                    .from("bereich_shift_assignments")
                    .upsert(neu.map(b => ({ facility_name: facilityName, shift_id: b.shift_id, staff_name: b.staff_name, user_id: null })), { onConflict: "shift_id,staff_name" });
                if (zweiter)
                    hinweise.push(`Einteilungen nicht gespeichert: ${zweiter.message}`);
                else
                    besetzungen = neu.length;
            }
            else {
                hinweise.push(`Einteilungen nicht gespeichert: ${error.message}`);
            }
        }
        else {
            besetzungen = neu.length;
        }
    }
    const offen = alleDienste.reduce((n, d) => n + Math.max(0, d.bedarf - (bestehend[d.id]?.length ?? 0)), 0) - besetzungen;
    hinweise.push(`${neueDienste.length} Dienste angelegt, ${besetzungen} Einteilungen vergeben` +
        (offen > 0 ? ` · ${offen} Plätze bleiben offen (niemand verfügbar)` : ""));
    return { dienste: neueDienste.length, besetzungen, bereicheGeplant: geplanteBereiche.size, hinweise };
}
function bedarfFuer(d: VorhandenerDienst, bedarfNach: Map<string, number>): number {
    const wd = (new Date(Date.parse(`${d.date}T12:00:00Z`)).getUTCDay() + 6) % 7;
    const key = `${d.bereich_id}|${wd}|${(d.start_time ?? "").trim().toLowerCase()}|${(d.label ?? "").trim().toLowerCase()}`;
    return bedarfNach.get(key) ?? 1;
}
async function ladeMitglieder(admin: AdminClient, facilityName: string, bereichIds: Set<string>, hinweise: string[]): Promise<Record<string, Mitglied[]>> {
    const out: Record<string, Mitglied[]> = {};
    const { data, error } = await admin
        .from("bereich_members")
        .select("bereich_id, user_id, staff_name")
        .eq("facility_name", facilityName);
    if (error) {
        hinweise.push(migrationFehlt(error)
            ? "Tabelle 'bereich_members' fehlt — Dienste entstehen, aber unbesetzt"
            : `Mitglieder nicht lesbar: ${error.message}`);
        return out;
    }
    for (const m of (data ?? []) as Array<{
        bereich_id: string;
        user_id: string | null;
        staff_name: string | null;
    }>) {
        if (!bereichIds.has(m.bereich_id) || !m.staff_name)
            continue;
        (out[m.bereich_id] ??= []).push({ user_id: m.user_id ?? null, staff_name: m.staff_name });
    }
    const ohne = [...bereichIds].filter(id => !out[id]?.length);
    if (ohne.length > 0) {
        hinweise.push(`${ohne.length} Bereich(e) ohne zugewiesene Mitarbeiter — dort entstehen Dienste ohne Besetzung`);
    }
    return out;
}
async function ladeBestehendeBesetzung(admin: AdminClient, shiftIds: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    if (shiftIds.length === 0)
        return out;
    const { data } = await admin
        .from("bereich_shift_assignments")
        .select("shift_id, staff_name")
        .in("shift_id", shiftIds);
    for (const a of (data ?? []) as Array<{
        shift_id: string;
        staff_name: string | null;
    }>) {
        if (!a.staff_name)
            continue;
        (out[a.shift_id] ??= []).push(a.staff_name);
    }
    return out;
}
async function ladeSperren(admin: AdminClient, opts: {
    facilityName: string;
    von: string;
    bis: string;
    mitglieder: Record<string, Mitglied[]>;
}): Promise<Record<string, Set<string>>> {
    const { facilityName, von, bis, mitglieder } = opts;
    const sperren: Record<string, Set<string>> = {};
    const sperre = (name: string, datum: string) => {
        (sperren[personSchluessel(name)] ??= new Set()).add(datum);
    };
    const nameByUser = new Map<string, string>();
    for (const liste of Object.values(mitglieder)) {
        for (const m of liste)
            if (m.user_id)
                nameByUser.set(m.user_id, m.staff_name);
    }
    const staffIds = [...nameByUser.keys()];
    if (staffIds.length > 0) {
        const abwesend = await ladeGenehmigteAbwesenheiten(admin, { facilityName, staffIds, von, bis });
        for (const a of abwesend) {
            const name = nameByUser.get(a.staff_id);
            if (!name)
                continue;
            for (const tag of tageVon(a.from < von ? von : a.from, a.to > bis ? bis : a.to))
                sperre(name, tag);
        }
    }
    try {
        const { data: stationsSchichten } = await admin
            .from("shifts")
            .select("id, date")
            .eq("facility_name", facilityName)
            .gte("date", von)
            .lte("date", bis);
        const schichten = (stationsSchichten ?? []) as Array<{
            id: string;
            date: string;
        }>;
        if (schichten.length > 0) {
            const datumById = new Map(schichten.map(s => [s.id, s.date] as const));
            const ids = [...datumById.keys()];
            for (let i = 0; i < ids.length; i += 200) {
                const { data } = await admin
                    .from("shift_assignments")
                    .select("shift_id, staff_name")
                    .in("shift_id", ids.slice(i, i + 200));
                for (const a of (data ?? []) as Array<{
                    shift_id: string;
                    staff_name: string | null;
                }>) {
                    const datum = datumById.get(a.shift_id);
                    if (datum && a.staff_name)
                        sperre(a.staff_name, datum);
                }
            }
        }
    }
    catch { }
    return sperren;
}
async function ladeVorbelastung(admin: AdminClient, facilityName: string, von: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    try {
        const { data: frueher } = await admin
            .from("bereich_shifts")
            .select("id")
            .eq("facility_name", facilityName)
            .gte("date", minusTage(von, HISTORIE_TAGE))
            .lt("date", von);
        const ids = ((frueher ?? []) as Array<{
            id: string;
        }>).map(s => s.id);
        for (let i = 0; i < ids.length; i += 200) {
            const { data } = await admin
                .from("bereich_shift_assignments")
                .select("staff_name")
                .in("shift_id", ids.slice(i, i + 200));
            for (const a of (data ?? []) as Array<{
                staff_name: string | null;
            }>) {
                if (!a.staff_name)
                    continue;
                const p = personSchluessel(a.staff_name);
                out[p] = (out[p] ?? 0) + 1;
            }
        }
    }
    catch { }
    return out;
}

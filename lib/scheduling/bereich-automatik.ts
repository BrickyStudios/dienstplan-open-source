import { utcTagISO } from "@/lib/date";
export const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export type BereichsVorlage = {
    bereich_id: string;
    weekday: number;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    staff_needed: number;
};
export type VorhandenerDienst = {
    id: string;
    bereich_id: string;
    date: string;
    start_time: string | null;
    end_time?: string | null;
    label: string | null;
};
export type NeuerDienst = Omit<BereichsVorlage, "weekday"> & {
    date: string;
};
export type Mitglied = {
    user_id: string | null;
    staff_name: string;
};
export type Besetzung = {
    shift_id: string;
    user_id: string | null;
    staff_name: string;
};
function alsUtc(iso: string): number {
    return Date.parse(`${iso}T12:00:00Z`);
}
function isoVon(ms: number): string {
    return utcTagISO(ms);
}
export function wochentag(iso: string): number {
    const d = new Date(alsUtc(iso)).getUTCDay();
    return (d + 6) % 7;
}
export function tageVon(von: string, bis: string): string[] {
    const a = alsUtc(von);
    const b = alsUtc(bis);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a)
        return [];
    const out: string[] = [];
    for (let t = a, i = 0; t <= b && i < 800; t += 86400000, i++)
        out.push(isoVon(t));
    return out;
}
function norm(v: string | null | undefined): string {
    return (v ?? "").trim().toLowerCase();
}
export function dienstSchluessel(d: {
    bereich_id: string;
    date: string;
    start_time: string | null;
    label: string | null;
}): string {
    return [d.bereich_id, d.date, norm(d.start_time), norm(d.label)].join("|");
}
export function vorlagenSchluessel(v: {
    bereich_id: string;
    weekday: number;
    start_time: string | null;
    label: string | null;
}): string {
    return [v.bereich_id, v.weekday, norm(v.start_time), norm(v.label)].join("|");
}
export function fehlendeDienste(opts: {
    von: string;
    bis: string;
    vorlagen: BereichsVorlage[];
    vorhanden: VorhandenerDienst[];
}): NeuerDienst[] {
    const belegt = new Set(opts.vorhanden.map(dienstSchluessel));
    const nachTag = new Map<number, BereichsVorlage[]>();
    for (const v of opts.vorlagen) {
        if (v.weekday < 0 || v.weekday > 6)
            continue;
        const liste = nachTag.get(v.weekday);
        if (liste)
            liste.push(v);
        else
            nachTag.set(v.weekday, [v]);
    }
    const out: NeuerDienst[] = [];
    for (const date of tageVon(opts.von, opts.bis)) {
        for (const v of nachTag.get(wochentag(date)) ?? []) {
            const dienst: NeuerDienst = {
                bereich_id: v.bereich_id,
                date,
                start_time: v.start_time,
                end_time: v.end_time,
                label: v.label,
                staff_needed: v.staff_needed,
            };
            const key = dienstSchluessel(dienst);
            if (belegt.has(key))
                continue;
            belegt.add(key);
            out.push(dienst);
        }
    }
    return out;
}
export function vorlagenAusHistorie(opts: {
    dienste: VorhandenerDienst[];
    besetzungProDienst?: Record<string, number>;
    mindestWiederholungen?: number;
}): BereichsVorlage[] {
    const mindest = opts.mindestWiederholungen ?? 2;
    const besetzung = opts.besetzungProDienst ?? {};
    type Gruppe = {
        vorlage: BereichsVorlage;
        tage: Set<string>;
        summeBesetzung: number;
    };
    const gruppen = new Map<string, Gruppe>();
    for (const d of opts.dienste) {
        const weekday = wochentag(d.date);
        if (!Number.isFinite(weekday))
            continue;
        const key = vorlagenSchluessel({ bereich_id: d.bereich_id, weekday, start_time: d.start_time, label: d.label });
        let g = gruppen.get(key);
        if (!g) {
            g = {
                vorlage: {
                    bereich_id: d.bereich_id,
                    weekday,
                    start_time: d.start_time,
                    end_time: d.end_time ?? null,
                    label: d.label,
                    staff_needed: 1,
                },
                tage: new Set(),
                summeBesetzung: 0,
            };
            gruppen.set(key, g);
        }
        if (!g.tage.has(d.date))
            g.tage.add(d.date);
        g.summeBesetzung += besetzung[d.id] ?? 0;
    }
    const out: BereichsVorlage[] = [];
    for (const g of gruppen.values()) {
        if (g.tage.size < mindest)
            continue;
        out.push({ ...g.vorlage, staff_needed: Math.max(1, Math.round(g.summeBesetzung / g.tage.size)) });
    }
    out.sort((a, b) => a.bereich_id.localeCompare(b.bereich_id) || a.weekday - b.weekday || norm(a.start_time).localeCompare(norm(b.start_time)));
    return out;
}
export function vereineVorlagen(gepflegt: BereichsVorlage[], abgeleitet: BereichsVorlage[]): BereichsVorlage[] {
    const gepflegteBereiche = new Set(gepflegt.map(v => v.bereich_id));
    return [...gepflegt, ...abgeleitet.filter(v => !gepflegteBereiche.has(v.bereich_id))];
}
export type ZuBesetzenderDienst = {
    id: string;
    bereich_id: string;
    date: string;
    bedarf: number;
};
export function verteileBesetzung(opts: {
    dienste: ZuBesetzenderDienst[];
    mitglieder: Record<string, Mitglied[]>;
    gesperrt: Record<string, Set<string>>;
    bestehend?: Record<string, string[]>;
    startLast?: Record<string, number>;
}): Besetzung[] {
    const bestehend = opts.bestehend ?? {};
    const last: Record<string, number> = { ...(opts.startLast ?? {}) };
    const belegtAmTag: Record<string, Set<string>> = {};
    for (const [person, tage] of Object.entries(opts.gesperrt))
        belegtAmTag[person] = new Set(tage);
    for (const d of opts.dienste) {
        for (const name of bestehend[d.id] ?? []) {
            const p = personSchluessel(name);
            last[p] = (last[p] ?? 0) + 1;
            (belegtAmTag[p] ??= new Set()).add(d.date);
        }
    }
    const sortiert = [...opts.dienste].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const out: Besetzung[] = [];
    for (const dienst of sortiert) {
        const schonDa = (bestehend[dienst.id] ?? []).map(personSchluessel);
        let offen = dienst.bedarf - schonDa.length;
        if (offen <= 0)
            continue;
        const kandidaten = (opts.mitglieder[dienst.bereich_id] ?? []).filter(m => {
            const p = personSchluessel(m.staff_name);
            if (schonDa.includes(p))
                return false;
            return !belegtAmTag[p]?.has(dienst.date);
        });
        kandidaten.sort((a, b) => {
            const la = last[personSchluessel(a.staff_name)] ?? 0;
            const lb = last[personSchluessel(b.staff_name)] ?? 0;
            return la - lb || a.staff_name.localeCompare(b.staff_name, "de");
        });
        for (const m of kandidaten) {
            if (offen <= 0)
                break;
            const p = personSchluessel(m.staff_name);
            out.push({ shift_id: dienst.id, user_id: m.user_id ?? null, staff_name: m.staff_name });
            last[p] = (last[p] ?? 0) + 1;
            (belegtAmTag[p] ??= new Set()).add(dienst.date);
            offen--;
        }
    }
    return out;
}
export function personSchluessel(name: string): string {
    return name.trim().toLowerCase();
}

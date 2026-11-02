import { admin as createAdmin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO, addDaysISO, utcTagISO } from "@/lib/date";
import { buildStaffDirectory } from "@/lib/staff-identity";
import { ZEITRAUM_ARTEN, fehlzeitLabel, kalendertage } from "@/lib/personalakte/fehlzeiten";
type Admin = ReturnType<typeof createAdmin>;
function tageZurueck(iso: string, tage: number): string { return addDaysISO(iso, -tage); }
export const VERDACHT_TAGE = 7;
export type SchichtZeile = {
    id: string;
    date: string;
    shift_type: string;
    start_time?: string | null;
    end_time?: string | null;
    station?: string | null;
};
export type ZuweisungZeile = {
    shift_id: string;
    staff_id?: string | null;
    staff_name: string;
    status?: string | null;
};
export type Verdacht = {
    shiftId: string;
    staffId: string;
    staffName: string;
    datum: string;
    schicht: string;
    station: string | null;
    zeit: string | null;
};
export type Entscheidung = "bestaetigt" | "war_da";
function tagDanach(iso: string): string { return addDaysISO(iso, 1); }
function ueberMitternacht(s: SchichtZeile): boolean {
    if (s.start_time && s.end_time)
        return s.end_time.slice(0, 5) <= s.start_time.slice(0, 5);
    return s.shift_type === "nacht";
}
export function findeVerdachtsfaelle(p: {
    shifts: SchichtZeile[];
    zuweisungen: ZuweisungZeile[];
    idVonName: Map<string, string>;
    kannStempeln: Set<string>;
    gestempelt: Set<string>;
    krank: Set<string>;
    urlaub: {
        userId: string;
        von: string;
        bis: string;
    }[];
    entschieden: Set<string>;
    vor: string;
}): Verdacht[] {
    const schichtVon = new Map(p.shifts.map(s => [s.id, s]));
    const faelle: Verdacht[] = [];
    const gesehen = new Set<string>();
    for (const z of p.zuweisungen) {
        if ((z.status ?? "confirmed") === "cancelled")
            continue;
        const s = schichtVon.get(z.shift_id);
        if (!s || s.date >= p.vor)
            continue;
        const kandidaten = [z.staff_id, p.idVonName.get(z.staff_name)].filter((x): x is string => !!x);
        const userId = kandidaten.find(id => p.kannStempeln.has(id));
        if (!userId)
            continue;
        const schluessel = `${s.id}|${z.staff_name}`;
        if (gesehen.has(schluessel) || p.entschieden.has(schluessel))
            continue;
        gesehen.add(schluessel);
        const tage = ueberMitternacht(s) ? [s.date, tagDanach(s.date)] : [s.date];
        if (kandidaten.some(id => tage.some(t => p.gestempelt.has(`${id}|${t}`))))
            continue;
        if (p.krank.has(`${z.staff_name}|${s.date}`))
            continue;
        if (p.urlaub.some(u => kandidaten.includes(u.userId) && u.von <= s.date && s.date <= u.bis))
            continue;
        faelle.push({
            shiftId: s.id, staffId: userId, staffName: z.staff_name, datum: s.date, schicht: s.shift_type,
            station: s.station ?? null,
            zeit: s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : null,
        });
    }
    return faelle.sort((a, b) => b.datum.localeCompare(a.datum) || a.staffName.localeCompare(b.staffName));
}
export type VerdachtsLage = {
    faelle: Verdacht[];
    zeiterfassungAktiv: boolean;
    tabelleFehlt: boolean;
};
export async function ladeVerdachtsfaelle(admin: Admin, facility: string, heute: string, tage = VERDACHT_TAGE): Promise<VerdachtsLage> {
    const von = tageZurueck(heute, tage);
    const stempelAb = new Date(`${tageZurueck(von, 1)}T00:00:00Z`).toISOString();
    const [stempel, shiftsRes, profile, stamm, krankRes, entschiedenRes] = await Promise.all([
        admin.from("time_entries").select("user_id, check_in").eq("facility", facility).gte("check_in", stempelAb).limit(20000),
        admin.from("shifts").select("id, date, shift_type, start_time, end_time, station")
            .eq("facility_name", facility).gte("date", von).lt("date", heute),
        admin.from("user_profiles").select("id, full_name").eq("facility", facility),
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facility),
        admin.from("sick_reports").select("sick_staff_name, sick_date, status")
            .eq("facility_name", facility).gte("sick_date", von).lt("sick_date", heute),
        admin.from("nichterscheinen").select("shift_id, staff_name").eq("facility_name", facility).gte("datum", von),
    ]);
    const stempelZeilen = (stempel.data ?? []) as {
        user_id: string;
        check_in: string;
    }[];
    const fehltTabelle = !!entschiedenRes.error && tabelleFehlt(entschiedenRes.error);
    if (stempelZeilen.length === 0)
        return { faelle: [], zeiterfassungAktiv: false, tabelleFehlt: fehltTabelle };
    const shifts = (shiftsRes.data ?? []) as SchichtZeile[];
    if (shifts.length === 0)
        return { faelle: [], zeiterfassungAktiv: true, tabelleFehlt: fehltTabelle };
    const zRes = await admin.from("shift_assignments").select("shift_id, staff_id, staff_name, status")
        .eq("facility_name", facility).in("shift_id", shifts.map(s => s.id));
    const profilZeilen = (profile.data ?? []) as {
        id: string;
        full_name: string | null;
    }[];
    const verzeichnis = buildStaffDirectory((stamm.data ?? []) as {
        id: string;
        full_name: string | null;
    }[], profilZeilen);
    const kannStempeln = new Set<string>([...profilZeilen.map(p => p.id), ...stempelZeilen.map(e => e.user_id)]);
    const gestempelt = new Set<string>();
    for (const e of stempelZeilen)
        gestempelt.add(`${e.user_id}|${berlinTodayISO(new Date(e.check_in))}`);
    const krank = new Set<string>();
    for (const k of (krankRes.data ?? []) as {
        sick_staff_name: string;
        sick_date: string;
        status: string | null;
    }[]) {
        if (k.status !== "cancelled")
            krank.add(`${k.sick_staff_name}|${k.sick_date}`);
    }
    const ids = [...kannStempeln];
    let urlaub: {
        userId: string;
        von: string;
        bis: string;
    }[] = [];
    if (ids.length) {
        const { data } = await admin.from("vacation_requests").select("staff_id, from_date, to_date")
            .in("staff_id", ids).eq("status", "approved").lte("from_date", heute).gte("to_date", von);
        urlaub = ((data ?? []) as {
            staff_id: string;
            from_date: string;
            to_date: string;
        }[])
            .map(u => ({ userId: u.staff_id, von: u.from_date, bis: u.to_date }));
    }
    const entschieden = new Set<string>();
    for (const e of (fehltTabelle ? [] : entschiedenRes.data ?? []) as {
        shift_id: string;
        staff_name: string;
    }[]) {
        entschieden.add(`${e.shift_id}|${e.staff_name}`);
    }
    const faelle = findeVerdachtsfaelle({
        shifts, zuweisungen: (zRes.data ?? []) as ZuweisungZeile[], idVonName: verzeichnis.idByName, kannStempeln, gestempelt, krank, urlaub, entschieden, vor: heute,
    });
    return { faelle, zeiterfassungAktiv: true, tabelleFehlt: fehltTabelle };
}
export async function entscheide(admin: Admin, facility: string, e: {
    shiftId: string;
    staffName: string;
    status: Entscheidung;
    notiz?: string | null;
    von: string;
}): Promise<{
    ok: true;
} | {
    ok: false;
    fehler: string;
    status: number;
}> {
    const { data: s } = await admin.from("shifts").select("id, date, shift_type, station")
        .eq("id", e.shiftId).eq("facility_name", facility).maybeSingle();
    if (!s)
        return { ok: false, fehler: "Dienst nicht gefunden", status: 404 };
    const { data: z } = await admin.from("shift_assignments").select("staff_id, staff_name, status")
        .eq("facility_name", facility).eq("shift_id", e.shiftId).eq("staff_name", e.staffName);
    const zuweisung = ((z ?? []) as {
        staff_id: string | null;
        status: string | null;
    }[]).find(r => r.status !== "cancelled");
    if (!zuweisung)
        return { ok: false, fehler: "Die Person war für diesen Dienst nicht eingeteilt", status: 400 };
    const { data: profil } = await admin.from("user_profiles").select("id")
        .eq("facility", facility).eq("full_name", e.staffName).limit(1).maybeSingle();
    const { error } = await admin.from("nichterscheinen").upsert({
        facility_name: facility, shift_id: e.shiftId, staff_id: profil?.id ?? zuweisung.staff_id ?? null,
        staff_name: e.staffName, datum: s.date, schicht: s.shift_type, station: s.station ?? null,
        status: e.status, notiz: e.notiz?.slice(0, 500) || null, entschieden_von: e.von, entschieden_am: new Date().toISOString(),
    }, { onConflict: "facility_name,shift_id,staff_name" });
    if (error)
        return { ok: false, fehler: tabelleFehlt(error) ? "Migration 20261009_nichterscheinen fehlt" : error.message, status: tabelleFehlt(error) ? 503 : 500 };
    return { ok: true };
}
export type Fehlzeit = {
    name: string;
    art: "krank" | "nicht_erschienen";
};
export async function fehlzeitenImPlan(admin: Admin, facility: string, von: string, bis: string): Promise<Record<string, Fehlzeit[]>> {
    const [shiftsRes, krankRes, neRes] = await Promise.all([
        admin.from("shifts").select("id, date, shift_type, station").eq("facility_name", facility).gte("date", von).lte("date", bis),
        admin.from("sick_reports").select("sick_staff_name, sick_date, shift_type, station, status")
            .eq("facility_name", facility).gte("sick_date", von).lte("sick_date", bis),
        admin.from("nichterscheinen").select("shift_id, staff_name").eq("facility_name", facility)
            .eq("status", "bestaetigt").gte("datum", von).lte("datum", bis),
    ]);
    const shifts = (shiftsRes.data ?? []) as SchichtZeile[];
    const ergebnis: Record<string, Fehlzeit[]> = {};
    const dazu = (shiftId: string, f: Fehlzeit) => {
        const liste = (ergebnis[shiftId] ??= []);
        if (!liste.some(x => x.name === f.name))
            liste.push(f);
    };
    for (const n of (neRes.error ? [] : neRes.data ?? []) as {
        shift_id: string;
        staff_name: string;
    }[]) {
        dazu(n.shift_id, { name: n.staff_name, art: "nicht_erschienen" });
    }
    const krank = ((krankRes.data ?? []) as {
        sick_staff_name: string;
        sick_date: string;
        shift_type: string | null;
        station: string | null;
        status: string | null;
    }[])
        .filter(k => k.status !== "cancelled");
    if (krank.length && shifts.length) {
        const { data: z } = await admin.from("shift_assignments").select("shift_id, staff_name")
            .eq("facility_name", facility).in("shift_id", shifts.map(s => s.id));
        const eingeteilt = new Set(((z ?? []) as {
            shift_id: string;
            staff_name: string;
        }[]).map(r => `${r.shift_id}|${r.staff_name}`));
        for (const k of krank) {
            const passend = shifts.filter(s => s.date === k.sick_date
                && (!k.shift_type || s.shift_type === k.shift_type)
                && (!k.station || !s.station || s.station === k.station));
            const eigener = passend.find(s => eingeteilt.has(`${s.id}|${k.sick_staff_name}`));
            const ziel = eigener ?? (passend.length === 1 ? passend[0] : undefined);
            if (ziel)
                dazu(ziel.id, { name: k.sick_staff_name, art: "krank" });
        }
    }
    return ergebnis;
}
export function abDatum(heute: string, monate: number): string {
    const d = new Date(Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1 - monate, 1));
    return utcTagISO(d);
}
export type DienstEintrag = {
    datum: string;
    schicht: string;
    zeit: string | null;
    station: string | null;
    stand: "geplant" | "storniert" | "krank" | "nicht_erschienen";
};
export type Dienstverlauf = {
    dienste: DienstEintrag[];
    krank: {
        datum: string;
        schicht: string | null;
        station: string | null;
        zustand: string;
    }[];
    nichtErschienen: {
        datum: string;
        schicht: string | null;
        station: string | null;
        notiz: string | null;
        entschiedenVon: string | null;
    }[];
    abwesenheiten: {
        art: "krankschreibung" | "fehlzeit";
        von: string;
        bis: string;
        tage: number;
        bezeichnung: string;
        titel: string;
        dokument: boolean;
    }[];
    urlaub: {
        von: string;
        bis: string;
        tage: number;
    }[];
};
export async function dienstverlauf(admin: Admin, facility: string, name: string, ids: string[], ab: string): Promise<Dienstverlauf> {
    const idListe = ids.filter(Boolean);
    const zuweisungen = new Map<string, string | null>();
    const [perName, perId, krankRes, neRes, akteRes, urlaubRes] = await Promise.all([
        admin.from("shift_assignments").select("shift_id, status").eq("facility_name", facility).eq("staff_name", name).limit(5000),
        idListe.length
            ? admin.from("shift_assignments").select("shift_id, status").eq("facility_name", facility).in("staff_id", idListe).limit(5000)
            : Promise.resolve({ data: [] as {
                    shift_id: string;
                    status: string | null;
                }[] }),
        admin.from("sick_reports").select("sick_date, shift_type, station, status")
            .eq("facility_name", facility).eq("sick_staff_name", name).gte("sick_date", ab).order("sick_date", { ascending: false }),
        admin.from("nichterscheinen").select("shift_id, datum, schicht, station, notiz, entschieden_von")
            .eq("facility_name", facility).eq("staff_name", name).eq("status", "bestaetigt").gte("datum", ab).order("datum", { ascending: false }),
        idListe.length
            ? admin.from("personalakte_eintraege").select("art, datum, datum_bis, grund, titel, dokument_pfad")
                .eq("facility_name", facility).in("staff_id", idListe).in("art", [...ZEITRAUM_ARTEN])
                .or(`datum_bis.gte.${ab},datum.gte.${ab}`).order("datum", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        idListe.length
            ? admin.from("vacation_requests").select("from_date, to_date").eq("status", "approved")
                .in("staff_id", idListe).gte("to_date", ab).order("from_date", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
    ]);
    for (const z of [...(perName.data ?? []), ...(perId.data ?? [])] as {
        shift_id: string;
        status: string | null;
    }[]) {
        if (!zuweisungen.has(z.shift_id) || z.status !== "cancelled")
            zuweisungen.set(z.shift_id, z.status);
    }
    const shifts: SchichtZeile[] = [];
    const alle = [...zuweisungen.keys()];
    for (let i = 0; i < alle.length; i += 300) {
        const { data } = await admin.from("shifts").select("id, date, shift_type, start_time, end_time, station")
            .eq("facility_name", facility).in("id", alle.slice(i, i + 300)).gte("date", ab);
        shifts.push(...((data ?? []) as SchichtZeile[]));
    }
    const ne = (neRes.error ? [] : neRes.data ?? []) as {
        shift_id: string;
        datum: string;
        schicht: string | null;
        station: string | null;
        notiz: string | null;
        entschieden_von: string | null;
    }[];
    const neShift = new Set(ne.map(n => n.shift_id));
    const krankZeilen = ((krankRes.data ?? []) as {
        sick_date: string;
        shift_type: string | null;
        station: string | null;
        status: string | null;
    }[]);
    const krankTag = new Set(krankZeilen.filter(k => k.status !== "cancelled").map(k => `${k.sick_date}|${k.shift_type ?? ""}`));
    const dienste: DienstEintrag[] = shifts.map((s): DienstEintrag => ({
        datum: s.date, schicht: s.shift_type, station: s.station ?? null,
        zeit: s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : null,
        stand: neShift.has(s.id) ? "nicht_erschienen"
            : krankTag.has(`${s.date}|${s.shift_type}`) || krankTag.has(`${s.date}|`) ? "krank"
                : zuweisungen.get(s.id) === "cancelled" ? "storniert" : "geplant",
    })).sort((a, b) => b.datum.localeCompare(a.datum) || a.schicht.localeCompare(b.schicht));
    const ZUSTAND: Record<string, string> = { open: "offen", uncovered: "keine Vertretung", covered: "Vertretung gefunden", cancelled: "zurückgezogen" };
    return {
        dienste,
        krank: krankZeilen.map(k => ({ datum: k.sick_date, schicht: k.shift_type, station: k.station, zustand: ZUSTAND[k.status ?? "open"] ?? k.status ?? "offen" })),
        nichtErschienen: ne.map(n => ({ datum: n.datum, schicht: n.schicht, station: n.station, notiz: n.notiz, entschiedenVon: n.entschieden_von })),
        abwesenheiten: ((akteRes.error ? [] : akteRes.data ?? []) as {
            art: string;
            datum: string;
            datum_bis: string | null;
            grund: string | null;
            titel: string;
            dokument_pfad: string | null;
        }[])
            .map(a => {
            const bis = a.datum_bis && a.datum_bis >= a.datum ? a.datum_bis : a.datum;
            return {
                art: a.art as "krankschreibung" | "fehlzeit", von: a.datum, bis, tage: kalendertage(a.datum, bis),
                bezeichnung: fehlzeitLabel(a.art, a.grund), titel: a.titel, dokument: !!a.dokument_pfad,
            };
        }),
        urlaub: ((urlaubRes.error ? [] : urlaubRes.data ?? []) as {
            from_date: string | null;
            to_date: string | null;
        }[])
            .filter(u => u.from_date && u.to_date)
            .map(u => ({ von: u.from_date!, bis: u.to_date!, tage: kalendertage(u.from_date!, u.to_date) })),
    };
}

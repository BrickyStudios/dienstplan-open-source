export type Recht = "dienstplan" | "ausfall" | "team" | "zeiten" | "lohn" | "einstellungen" | "rechte";
export const RECHTE: {
    id: Recht;
    titel: string;
    text: string;
    seiten: string[];
}[] = [
    { id: "dienstplan", titel: "Dienstplan planen",
        text: "Schichten anlegen und generieren, Personen einteilen, Raster ändern, Dienstwünsche und Tausche entscheiden.",
        seiten: ["/schichtplan", "/manuell-planen", "/bereiche-dienstplan"] },
    { id: "ausfall", titel: "Urlaub und Ausfall",
        text: "Urlaubsanträge entscheiden, Krankmeldungen für andere erfassen, Springer und Notfallplan.",
        seiten: ["/urlaubsantraege", "/springer"] },
    { id: "team", titel: "Praxisteam verwalten",
        text: "Personen anlegen und einladen, Stammdaten, Personalakte, Qualifikationen, Schulungen, Belastung.",
        seiten: ["/mitarbeiter"] },
    { id: "zeiten", titel: "Arbeitszeiten aller sehen",
        text: "Zeiterfassung des ganzen Teams, Auswertungen und Gleitzeitanträge.",
        seiten: ["/zeiterfassung"] },
    { id: "lohn", titel: "Lohnabrechnung",
        text: "Lohnabrechnung erstellen und Vorlagen pflegen. Enthält Stundenlöhne aller.",
        seiten: ["/lohnabrechnung"] },
    { id: "einstellungen", titel: "Einstellungen der Praxis",
        text: "Praxis-Einstellungen, Aufgaben-Codes, Anbindungen, Datenexport.",
        seiten: ["/einstellungen/einrichtung", "/stationen", "/bereiche-verwaltung"] },
    { id: "rechte", titel: "Rechte vergeben",
        text: "Anderen Mitarbeitenden Rechte geben oder nehmen — höchstens die eigenen.",
        seiten: [] },
];
export const ALLE_RECHTE: Recht[] = RECHTE.map(r => r.id);
export function leseRechte(raw: unknown): Recht[] {
    return Array.isArray(raw) ? [...new Set(raw.filter((r): r is Recht => ALLE_RECHTE.includes(r as Recht)))] : [];
}
type Regel = {
    pfad: string;
    lesen?: Recht[];
    schreiben: Recht[];
};
const PLANUNG_LESEN: Recht[] = ["dienstplan", "ausfall", "team", "zeiten", "lohn", "einstellungen"];
export const REGELN: Regel[] = [
    { pfad: "/api/leitung/staff", lesen: PLANUNG_LESEN, schreiben: ["team"] },
    { pfad: "/api/leitung/registered-staff", lesen: PLANUNG_LESEN, schreiben: ["team"] },
    { pfad: "/api/leitung/stations", lesen: PLANUNG_LESEN, schreiben: ["einstellungen"] },
    { pfad: "/api/leitung/shift-templates", lesen: PLANUNG_LESEN, schreiben: ["dienstplan", "einstellungen"] },
    { pfad: "/api/leitung/facility-settings", lesen: PLANUNG_LESEN, schreiben: ["einstellungen"] },
    { pfad: "/api/leitung/staff-availability", lesen: PLANUNG_LESEN, schreiben: ["team", "dienstplan"] },
    { pfad: "/api/leitung/fehlzeiten", lesen: ["dienstplan", "ausfall", "zeiten"], schreiben: ["ausfall"] },
    { pfad: "/api/leitung/oncall-entries", lesen: ["dienstplan", "ausfall"], schreiben: ["dienstplan", "ausfall"] },
    ...[
        "generate-plan", "shifts", "praxis-raster", "resync-shift-demand", "optimize-plan", "rebalance-overtime",
        "monthly-ai-adjustments", "copilot", "stationsplanung", "staffing-needs", "belegung", "bereich-shifts",
        "bereich-shift-templates", "wishes", "shift-swap", "shift-swap-requests", "shift-release", "bereitschaft-nachplanen",
    ].map(p => ({ pfad: `/api/leitung/${p}`, schreiben: ["dienstplan"] as Recht[] })),
    { pfad: "/api/onboarding/generate-shifts", schreiben: ["dienstplan"] },
    { pfad: "/api/onboarding/praxis-ki", schreiben: ["dienstplan"] },
    ...[
        "vacation-requests", "krank", "springer", "reinforcement", "external-agencies", "emergency-plan",
        "notfall-vorlagen", "nichterscheinen", "meldungen",
    ].map(p => ({ pfad: `/api/leitung/${p}`, schreiben: ["ausfall"] as Recht[] })),
    { pfad: "/api/leitung/vacation-balances", lesen: ["ausfall", "team", "lohn"], schreiben: ["ausfall", "team"] },
    { pfad: "/api/notfall/ausloesen", schreiben: ["ausfall"] },
    ...[
        "invite-staff", "codes", "archive-staff", "assign-station", "personalakte", "certificates", "trainings", "burnout",
    ].map(p => ({ pfad: `/api/leitung/${p}`, schreiben: ["team"] as Recht[] })),
    { pfad: "/api/leitung/flextime-requests", schreiben: ["zeiten"] },
    { pfad: "/api/leitung/lohnabrechnung", schreiben: ["lohn"] },
    { pfad: "/api/leitung/payroll-template", schreiben: ["lohn"] },
    { pfad: "/api/leitung/todo", schreiben: ["dienstplan", "ausfall"] },
    ...[
        "anbindungen", "datenexport", "task-categories", "task-codes", "station-tasks", "aufgaben-export",
    ].map(p => ({ pfad: `/api/leitung/${p}`, schreiben: ["einstellungen"] as Recht[] })),
    { pfad: "/api/bereiche", schreiben: ["einstellungen"] },
    { pfad: "/api/leitung/mitarbeiter-rechte", schreiben: ["rechte"] },
];
const IMMER = ["/api/leitung/context"];
function passt(pfad: string, praefix: string): boolean {
    return pfad === praefix || pfad.startsWith(praefix + "/");
}
export function darfSchnittstelle(rechte: readonly Recht[], pfad: string, methode: string): boolean {
    if (!rechte.length)
        return false;
    if (IMMER.some(p => passt(pfad, p)))
        return true;
    const regel = REGELN.filter(r => passt(pfad, r.pfad)).sort((a, b) => b.pfad.length - a.pfad.length)[0];
    if (!regel)
        return false;
    const noetig = methode.toUpperCase() === "GET" ? [...(regel.lesen ?? []), ...regel.schreiben] : regel.schreiben;
    return noetig.some(r => rechte.includes(r));
}
export function darfSeite(rechte: readonly Recht[], pfad: string): boolean {
    if (pfad === "/aufgaben")
        return rechte.includes("dienstplan") || rechte.includes("ausfall");
    return RECHTE.some(r => rechte.includes(r.id) && r.seiten.some(s => passt(pfad, s)));
}
export type Selbst = "krank" | "urlaub" | "wuensche" | "tausch" | "abgabe";
export const SELBSTBEDIENUNG: {
    id: Selbst;
    titel: string;
    aus: string;
}[] = [
    { id: "krank", titel: "Sich selbst krankmelden", aus: "Krankmeldungen bitte telefonisch an die Praxisleitung." },
    { id: "urlaub", titel: "Urlaub beantragen", aus: "Urlaub bitte direkt bei der Praxisleitung beantragen." },
    { id: "wuensche", titel: "Dienstwünsche eintragen", aus: "Dienstwünsche bitte direkt mit der Praxisleitung absprechen." },
    { id: "tausch", titel: "Schichten tauschen", aus: "Schichttausch bitte über die Praxisleitung." },
    { id: "abgabe", titel: "Schichten abgeben („Ich kann nicht“)", aus: "Wenn du eine Schicht nicht kannst, ruf bitte die Praxisleitung an." },
];
export type SelbstWerte = Partial<Record<Selbst, boolean>>;
export function leseSelbst(raw: unknown): SelbstWerte {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return {};
    const out: SelbstWerte = {};
    for (const s of SELBSTBEDIENUNG) {
        const v = (raw as Record<string, unknown>)[s.id];
        if (typeof v === "boolean")
            out[s.id] = v;
    }
    return out;
}
export function selbstWirksam(praxis: SelbstWerte, person: SelbstWerte): Record<Selbst, boolean> {
    return Object.fromEntries(SELBSTBEDIENUNG.map(s => [s.id, person[s.id] ?? praxis[s.id] ?? true])) as Record<Selbst, boolean>;
}
type Db = any;
export async function ladeMitarbeiterRechte(db: Db, facility: string, userId: string): Promise<{
    rechte: Recht[];
    selbst: SelbstWerte;
}> {
    if (!facility || !userId)
        return { rechte: [], selbst: {} };
    try {
        const { data, error } = await db.from("mitarbeiter_rechte")
            .select("rechte, selbstbedienung").eq("facility_name", facility).eq("user_id", userId).maybeSingle();
        if (error || !data)
            return { rechte: [], selbst: {} };
        return { rechte: leseRechte(data.rechte), selbst: leseSelbst(data.selbstbedienung) };
    }
    catch {
        return { rechte: [], selbst: {} };
    }
}
export async function ladePraxisSelbst(db: Db, facility: string): Promise<SelbstWerte> {
    if (!facility)
        return {};
    const out: SelbstWerte = {};
    try {
        const { data } = await db.from("facility_settings")
            .select("employee_sick_reporting_enabled").eq("facility_name", facility).maybeSingle();
        if (typeof data?.employee_sick_reporting_enabled === "boolean")
            out.krank = data.employee_sick_reporting_enabled;
    }
    catch { }
    try {
        const { data, error } = await db.from("facility_settings")
            .select("selbstbedienung").eq("facility_name", facility).maybeSingle();
        if (!error)
            Object.assign(out, leseSelbst(data?.selbstbedienung), out.krank === undefined ? {} : { krank: out.krank });
    }
    catch { }
    return out;
}
export async function selbstbedienungFuer(db: Db, facility: string, userId: string): Promise<Record<Selbst, boolean>> {
    const [praxis, person] = await Promise.all([ladePraxisSelbst(db, facility), ladeMitarbeiterRechte(db, facility, userId)]);
    return selbstWirksam(praxis, person.selbst);
}
export async function selbstGesperrt(db: Db, userId: string, funktion: Selbst): Promise<string | null> {
    try {
        const { data: p } = await db.from("user_profiles").select("role, facility").eq("id", userId).maybeSingle();
        if (!p || p.role !== "mitarbeiter" || !p.facility)
            return null;
        const werte = await selbstbedienungFuer(db, p.facility, userId);
        return werte[funktion] ? null : SELBSTBEDIENUNG.find(s => s.id === funktion)!.aus;
    }
    catch {
        return null;
    }
}

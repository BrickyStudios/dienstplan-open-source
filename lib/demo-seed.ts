import type { SupabaseClient } from "@supabase/supabase-js";
import { planFuerNeueEinrichtung, type Plan } from "@/lib/plan";
import { addDaysISO, berlinTodayISO, toLocalISODate } from "@/lib/date";
import { spalteFehlt } from "@/lib/db-fehler";
import { aktenTestdatenSchreiben } from "@/lib/personalakte/testdaten-schreiben";
export type StaffDef = {
    full_name: string;
    station: string;
    role: string;
    job_type: string;
    max_hours_per_week: number;
    springer?: boolean;
};
export const DEMO_STAFF_DEFS: StaffDef[] = [
    { full_name: "Demo Mitarbeiter", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Maria Schmidt", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Thomas Müller", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Klaus Fischer", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Sabine Bauer", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Michael Braun", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Katharina Weiß", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Teilzeit", max_hours_per_week: 25 },
    { full_name: "Stefan Richter", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Julia Krause", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 20 },
    { full_name: "Markus Hofmann", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Sandra Meyer", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Lena Vogel", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Jonas Albrecht", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Nina Brandt", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Felix Kaiser", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Timo Reuter", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 15 },
    { full_name: "Anna Weber", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 20 },
    { full_name: "Peter Wagner", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 25 },
    { full_name: "Lisa Hoffmann", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Teilzeit", max_hours_per_week: 10 },
    { full_name: "Heike Zimmermann", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Frank Neumann", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Christine Schäfer", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Teilzeit", max_hours_per_week: 25 },
    { full_name: "Rainer Koch", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Petra Klein", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Ute Schröder", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 20 },
    { full_name: "Bernd Lange", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Tim Scholz", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Greta Pohl", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Erik Sauer", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Mia Roth", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Paul Engel", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Hannah Busch", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Jana Keller", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Robert Haas", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Franziska Wolf", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Johannes Berg", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Nicole Schulze", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Oliver König", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Vanessa Lehmann", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Daniel Hartmann", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Teilzeit", max_hours_per_week: 20 },
    { full_name: "Monika Vogt", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Andreas Fuchs", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Ursula Böhm", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Teilzeit", max_hours_per_week: 25 },
    { full_name: "Tobias Simon", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "David Seidel", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Clara Winter", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Sophie Ziegler", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Jan Becker", station: "Nachtdienst", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Laura Sommer", station: "Nachtdienst", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Carsten Arnold", station: "Nachtdienst", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Eva Kühn", station: "Nachtdienst", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Martin Schubert", station: "Nachtdienst", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 20 },
    { full_name: "Rebecca Möller", station: "Nachtdienst", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Stephan Lorenz", station: "Nachtdienst", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Tanja Frank", station: "Nachtdienst", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Henrik Fischer", station: "Nachtdienst", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 25 },
    { full_name: "Iris Böttcher", station: "Nachtdienst", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40 },
    { full_name: "Elias Wendt", station: "Wohnbereich A", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
    { full_name: "Marlene Stark", station: "Wohnbereich A", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 25, springer: true },
    { full_name: "Yusuf Demir", station: "Wohnbereich B", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
    { full_name: "Carolin Ritter", station: "Wohnbereich B", role: "Pflegekraft", job_type: "Teilzeit", max_hours_per_week: 25, springer: true },
    { full_name: "Aylin Kaya", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
    { full_name: "Simon Gerlach", station: "Intensivstation", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
    { full_name: "Nadine Pfeiffer", station: "Nachtdienst", role: "Pflegefachkraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
    { full_name: "Dominik Ostermann", station: "Nachtdienst", role: "Pflegekraft", job_type: "Vollzeit", max_hours_per_week: 40, springer: true },
];
export const DEMO_STATIONS = [
    { name: "Wohnbereich A", color: "#3b82f6", sort_order: 0 },
    { name: "Wohnbereich B", color: "#10b981", sort_order: 1 },
    { name: "Intensivstation", color: "#f59e0b", sort_order: 2 },
    { name: "Nachtdienst", color: "#6366f1", sort_order: 3 },
];
const UNIT_NAMES: Record<Plan, Record<string, string>> = {
    klinik: {
        "Wohnbereich A": "Station 1 — Innere",
        "Wohnbereich B": "Station 2 — Chirurgie",
        "Intensivstation": "Intensivstation",
        "Nachtdienst": "Nachtdienst",
    },
    pflege: {
        "Wohnbereich A": "Wohnbereich A",
        "Wohnbereich B": "Wohnbereich B",
        "Intensivstation": "Wohnbereich C — Demenz",
        "Nachtdienst": "Nachtdienst",
    },
    praxis: {
        "Wohnbereich A": "Praxis",
        "Wohnbereich B": "Praxis",
        "Intensivstation": "Praxis",
        "Nachtdienst": "Praxis",
    },
};
export function demoUnitName(plan: Plan, canonical: string): string {
    return UNIT_NAMES[plan][canonical] ?? canonical;
}
const FIRST_NAMES = [
    "Alina", "Amelie", "Andreas", "Anja", "Annika", "Bastian", "Benedikt", "Bianca",
    "Carolin", "Christoph", "Clara", "Daniela", "David", "Denise", "Dominik", "Elena",
    "Elias", "Emilia", "Fabian", "Felix", "Franziska", "Georg", "Greta", "Hannah",
    "Hendrik", "Ilona", "Ines", "Jakob", "Janina", "Jasmin", "Jens", "Johanna",
    "Jonas", "Josefine", "Julian", "Kai", "Karina", "Katrin", "Kerstin", "Konstantin",
    "Lars", "Laura", "Lena", "Leonie", "Lukas", "Malte", "Marco", "Marlene",
    "Mathis", "Melanie", "Merle", "Miriam", "Moritz", "Nadja", "Nils", "Nora",
    "Patrick", "Paula", "Philipp", "Pia", "Rafael", "Ramona", "Rebecca", "Ruben",
    "Sarah", "Sebastian", "Selina", "Sonja", "Sven", "Theresa", "Tobias", "Vanessa",
    "Verena", "Yannick",
];
const LAST_NAMES = [
    "Adler", "Ahrens", "Baumann", "Beckmann", "Bergmann", "Bittner", "Brandt", "Brenner",
    "Burger", "Dietrich", "Dreher", "Eberhardt", "Eckert", "Ehlers", "Falk", "Fiedler",
    "Franke", "Freitag", "Gebhardt", "Gruber", "Haase", "Hampel", "Hauser", "Heinrich",
    "Hellmann", "Hesse", "Hübner", "Jansen", "Jürgens", "Kellner", "Kirchner", "Kluge",
    "Knoll", "Kramer", "Krieger", "Kuhlmann", "Lehnert", "Leitner", "Lindner", "Löffler",
    "Mahler", "Marquardt", "Mertens", "Nagel", "Naumann", "Niemann", "Oswald", "Pape",
    "Petersen", "Pfeifer", "Rauch", "Reimann", "Rieger", "Röder", "Rudolph", "Sander",
    "Schilling", "Schindler", "Schneider", "Schreiber", "Schuster", "Siebert", "Sommer",
    "Sperling", "Stein", "Stoll", "Thiele", "Ullrich", "Vollmer", "Walther", "Wegner",
    "Wiedemann", "Wilke", "Zeller",
];
const ROSTER_PLAN: {
    canonical: string;
    min: number;
    max: number;
    onlyFachkraft?: boolean;
}[] = [
    { canonical: "Wohnbereich A", min: 14, max: 18 },
    { canonical: "Wohnbereich B", min: 16, max: 20 },
    { canonical: "Intensivstation", min: 11, max: 15, onlyFachkraft: true },
    { canonical: "Nachtdienst", min: 9, max: 12 },
];
const SPRINGER_PER_STATION = 2;
const TEILZEIT_HOURS = [10, 15, 20, 25, 30];
function hashSeed(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
function mulberry32(a: number): () => number {
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function generateStaffDefs(plan: Plan, seed: string): StaffDef[] {
    if (plan === "praxis")
        return generatePraxisStaffDefs(seed);
    const rnd = mulberry32(hashSeed(seed));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
    const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const used = new Set<string>();
    const nextName = (): string => {
        for (let i = 0; i < 300; i++) {
            const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
            if (!used.has(n)) {
                used.add(n);
                return n;
            }
        }
        let k = 2;
        let n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        while (used.has(n))
            n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${k++}`;
        used.add(n);
        return n;
    };
    const out: StaffDef[] = [];
    for (const st of ROSTER_PLAN) {
        const total = between(st.min, st.max);
        for (let i = 0; i < total; i++) {
            const springer = i >= total - SPRINGER_PER_STATION;
            const fachkraft = st.onlyFachkraft === true || rnd() < 0.55;
            const teilzeit = !springer && rnd() < 0.28;
            out.push({
                full_name: nextName(),
                station: demoUnitName(plan, st.canonical),
                role: fachkraft ? "Pflegefachkraft" : "Pflegekraft",
                job_type: teilzeit ? "Teilzeit" : "Vollzeit",
                max_hours_per_week: teilzeit ? pick(TEILZEIT_HOURS) : 40,
                ...(springer ? { springer: true } : {}),
            });
        }
    }
    return out;
}
function generatePraxisStaffDefs(seed: string): StaffDef[] {
    const rnd = mulberry32(hashSeed(seed));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
    const used = new Set<string>();
    const nextName = (): string => {
        for (let i = 0; i < 300; i++) {
            const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
            if (!used.has(n)) {
                used.add(n);
                return n;
            }
        }
        return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${used.size}`;
    };
    const unit = demoUnitName("praxis", "Wohnbereich A");
    const mfa = "Medizinische Fachangestellte (MFA)";
    const total = 8 + Math.floor(rnd() * 3);
    const out: StaffDef[] = [];
    for (let i = 0; i < total; i++) {
        const azubi = i === total - 2;
        const springer = i === total - 1;
        const teilzeit = !azubi && !springer && i > 0 && rnd() < 0.4;
        out.push({
            full_name: nextName(),
            station: unit,
            role: azubi ? "Auszubildende MFA/ZFA" : mfa,
            job_type: teilzeit ? "Teilzeit" : "Vollzeit",
            max_hours_per_week: teilzeit ? pick([20, 25, 30]) : 40,
            ...(springer ? { springer: true } : {}),
        });
    }
    return out;
}
export function demoStaffDefs(plan: Plan, seed?: string): StaffDef[] {
    if (seed)
        return generateStaffDefs(plan, seed);
    return DEMO_STAFF_DEFS.map(s => ({ ...s, station: demoUnitName(plan, s.station) }));
}
export function demoStations(plan: Plan): {
    name: string;
    color: string;
    sort_order: number;
}[] {
    const seen = new Set<string>();
    const out: {
        name: string;
        color: string;
        sort_order: number;
    }[] = [];
    for (const s of DEMO_STATIONS) {
        const name = demoUnitName(plan, s.name);
        if (seen.has(name))
            continue;
        seen.add(name);
        out.push({ ...s, name, sort_order: out.length });
    }
    return out;
}
export const DEMO_SHIFT_TEMPLATES = [
    { name: "Frühschicht", start_time: "06:00", end_time: "14:00", color: "#3b82f6", sort_order: 0 },
    { name: "Spätschicht", start_time: "14:00", end_time: "22:00", color: "#f59e0b", sort_order: 1 },
    { name: "Nachtschicht", start_time: "22:00", end_time: "06:00", color: "#6366f1", sort_order: 2 },
];
export const PRAXIS_SHIFT_TEMPLATES = [
    { name: "Vormittag", start_time: "07:30", end_time: "13:00", color: "#3b82f6", sort_order: 0 },
    { name: "Nachmittag", start_time: "13:00", end_time: "18:30", color: "#f59e0b", sort_order: 1 },
];
export function demoShiftTemplates(plan: Plan) {
    return plan === "praxis" ? PRAXIS_SHIFT_TEMPLATES : DEMO_SHIFT_TEMPLATES;
}
type ShiftDef = {
    shift_type: string;
    start_time: string;
    end_time: string;
    planned_staff: number;
};
export const DEMO_SHIFT_CONFIG: [
    string,
    ShiftDef[]
][] = [
    ["Wohnbereich A", [{ shift_type: "frueh", start_time: "06:00", end_time: "14:00", planned_staff: 3 }, { shift_type: "spaet", start_time: "14:00", end_time: "22:00", planned_staff: 3 }, { shift_type: "nacht", start_time: "22:00", end_time: "06:00", planned_staff: 1 }]],
    ["Wohnbereich B", [{ shift_type: "frueh", start_time: "06:00", end_time: "14:00", planned_staff: 3 }, { shift_type: "spaet", start_time: "14:00", end_time: "22:00", planned_staff: 3 }, { shift_type: "nacht", start_time: "22:00", end_time: "06:00", planned_staff: 1 }]],
    ["Intensivstation", [{ shift_type: "frueh", start_time: "06:00", end_time: "14:00", planned_staff: 2 }, { shift_type: "spaet", start_time: "14:00", end_time: "22:00", planned_staff: 2 }, { shift_type: "nacht", start_time: "22:00", end_time: "06:00", planned_staff: 1 }]],
    ["Nachtdienst", [{ shift_type: "nacht", start_time: "22:00", end_time: "06:00", planned_staff: 2 }]],
];
export function daysAgo(n: number) {
    return addDaysISO(berlinTodayISO(), -n);
}
export function daysFromNow(n: number) {
    return addDaysISO(berlinTodayISO(), n);
}
export function isoAt(dateStr: string, time: string) {
    return new Date(`${dateStr}T${time}:00`).toISOString();
}
export function isoDate(d: Date): string { return toLocalISODate(d); }
export function generateDemoShifts(facilityName: string, randomizeHistory = false, plan: Plan = planFuerNeueEinrichtung()) {
    if (plan === "praxis")
        return generatePraxisShifts(facilityName, randomizeHistory);
    const shifts = [];
    const config = DEMO_SHIFT_CONFIG;
    for (let i = -14; i <= 21; i++) {
        const date = i < 0 ? daysAgo(-i) : daysFromNow(i);
        for (const [canonicalStation, defs] of config) {
            const station = demoUnitName(plan, canonicalStation);
            for (const def of defs) {
                let actual_staff = 0;
                let notes = "";
                if (i < 0) {
                    if (randomizeHistory) {
                        const roll = Math.random();
                        actual_staff = roll < 0.15 ? Math.max(1, def.planned_staff - 2) : roll < 0.35 ? def.planned_staff - 1 : def.planned_staff;
                        if (actual_staff < def.planned_staff)
                            notes = "Personalengpass";
                    }
                    else {
                        actual_staff = def.planned_staff;
                    }
                }
                shifts.push({ facility_name: facilityName, station, date, ...def, actual_staff, notes });
            }
        }
    }
    return shifts;
}
function generatePraxisShifts(facilityName: string, randomizeHistory: boolean) {
    const unit = demoUnitName("praxis", "Wohnbereich A");
    const [vm, nm] = PRAXIS_SHIFT_TEMPLATES;
    const shifts = [];
    for (let i = -14; i <= 21; i++) {
        const date = i < 0 ? daysAgo(-i) : daysFromNow(i);
        const wochentag = new Date(`${date}T12:00:00`).getDay();
        if (wochentag === 0 || wochentag === 6)
            continue;
        const defs: ShiftDef[] = [{ shift_type: "frueh", start_time: vm.start_time, end_time: vm.end_time, planned_staff: 3 }];
        if (wochentag !== 3 && wochentag !== 5) {
            defs.push({ shift_type: "spaet", start_time: nm.start_time, end_time: nm.end_time, planned_staff: 2 });
        }
        for (const def of defs) {
            let actual_staff = 0;
            let notes = "";
            if (i < 0) {
                actual_staff = def.planned_staff;
                if (randomizeHistory && Math.random() < 0.15) {
                    actual_staff = def.planned_staff - 1;
                    notes = "Personalengpass";
                }
            }
            shifts.push({ facility_name: facilityName, station: unit, date, ...def, actual_staff, notes });
        }
    }
    return shifts;
}
export const DEMO_FACILITY_SETTINGS: Record<string, unknown> = {
    schedule_springer_enabled: true,
    employee_availability_enabled: true,
    default_hourly_rate: 18.0,
    oncall_pay_enabled: true,
    oncall_standby_pct: 25,
    oncall_hours_per_day: 8,
    oncall_work_pct: 15,
};
export async function seedDemoFacilitySettings(admin: SupabaseClient<any>, facilityName: string, plan: Plan = planFuerNeueEinrichtung()) {
    const payload: Record<string, unknown> = {
        facility_name: facilityName,
        updated_at: new Date().toISOString(),
        plan,
        ...DEMO_FACILITY_SETTINGS,
    };
    let { error } = await admin.from("facility_settings").upsert(payload, { onConflict: "facility_name" });
    if (error?.code === "23514" && plan !== "praxis") {
        payload.plan = "station";
        ({ error } = await admin.from("facility_settings").upsert(payload, { onConflict: "facility_name" }));
    }
    if (error && spalteFehlt(error)) {
        for (const col of [...Object.keys(DEMO_FACILITY_SETTINGS), "plan"])
            delete payload[col];
        await admin.from("facility_settings").upsert(payload, { onConflict: "facility_name" });
    }
}
export async function seedDemoPersonalakten(admin: SupabaseClient<any>, facilityName: string, staffRows: {
    id: string;
    full_name: string;
    role?: string | null;
    job_type?: string | null;
    max_hours_per_week?: number | null;
}[]): Promise<void> {
    try {
        const ergebnis = await aktenTestdatenSchreiben(admin, facilityName, staffRows, {
            dokumente: 6,
        });
        for (const h of ergebnis.hinweise)
            console.warn("[demo-seed/personalakte]", h);
    }
    catch (e) {
        console.warn("[demo-seed/personalakte] übersprungen:", (e as Error).message);
    }
}
export function generateDemoOnCall(facilityName: string, staffRows: {
    full_name: string;
    id: string;
    springer?: boolean;
}[], plan?: Plan) {
    const pool = staffRows.filter(s => s.springer);
    if (pool.length === 0)
        return [];
    const rows: {
        facility_name: string;
        user_id: string;
        staff_name: string;
        on_call_date: string;
        shift_type: null;
        source: string;
    }[] = [];
    let n = 0;
    for (let i = -14; i <= 21; i++) {
        const date = i < 0 ? daysAgo(-i) : daysFromNow(i);
        const wochentag = new Date(`${date}T12:00:00`).getDay();
        if (plan === "praxis" && (wochentag === 0 || wochentag === 6))
            continue;
        const pick = pool[n++ % pool.length];
        rows.push({
            facility_name: facilityName,
            user_id: pick.id,
            staff_name: pick.full_name,
            on_call_date: date,
            shift_type: null,
            source: "plan",
        });
    }
    return rows;
}
const WISH_MESSAGES_PREF = [
    "Frühschicht passt mir diese Woche sehr gut.",
    "Bin für Nachtschichten sehr gerne verfügbar.",
    "Spätschicht wäre diese Woche ideal für mich.",
    "Hätte gerne diese Schicht übernommen.",
    "Würde sehr gern in dieser Zeit einspringen.",
    "Diese Zeiten passen mir am besten.",
];
const WISH_MESSAGES_UNAVAIL = [
    "Arzttermin, bitte nicht einplanen.",
    "Familienveranstaltung, nicht verfügbar.",
    "Urlaub beantragt.",
    "Kinderbetreuung nicht möglich in dieser Zeit.",
    "Vorsorgeuntersuchung.",
    "Privater Termin, bitte freihalten.",
];
const WISH_MESSAGES_AVOID = [
    "Nachtschichten diese Woche bitte vermeiden.",
    "Frühschicht aktuell schwierig wegen Kinderbetreuung.",
    "Würde Spätschicht diese Woche lieber vermeiden.",
    "Bitte wenn möglich keine Wochenenddienste.",
];
function randItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
export function generateDemoWishes(facilityName: string, staffRows: {
    full_name: string;
    id: string;
}[]) {
    const wishes = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const member of staffRows) {
        if (Math.random() > 0.45)
            continue;
        const wishCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < wishCount; i++) {
            const typeRoll = Math.random();
            const wish_type = typeRoll < 0.5 ? "preference" : typeRoll < 0.75 ? "unavailable" : "avoid";
            const daysFromNowVal = 2 + Math.floor(Math.random() * 26);
            const startDate = new Date(today);
            startDate.setDate(today.getDate() + daysFromNowVal);
            const rangeDays = wish_type === "unavailable" ? 1 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 5);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + rangeDays - 1);
            const messages = wish_type === "preference" ? WISH_MESSAGES_PREF :
                wish_type === "unavailable" ? WISH_MESSAGES_UNAVAIL :
                    WISH_MESSAGES_AVOID;
            wishes.push({
                user_id: member.id,
                facility_name: facilityName,
                full_name: member.full_name,
                date_from: isoDate(startDate),
                date_to: isoDate(endDate),
                shift_type: randItem(["all", "frueh", "spaet", "nacht"]),
                wish_type,
                message: randItem(messages),
                status: randItem(["offen", "offen", "offen", "berücksichtigt", "abgelehnt"]),
                created_at: new Date(today.getTime() - Math.random() * 7 * 86400000).toISOString(),
            });
        }
    }
    return wishes;
}

import { toLocalISODate, monatsBereichISO } from "@/lib/date";
import { deriveShiftType as ableitenAusLib } from "@/lib/scheduling/shift-demand";
import { zeitAmWochentag, type PraxisRaster } from "@/lib/scheduling/praxis-raster";
export type Shift = {
    id: string;
    station: string;
    date: string;
    shift_type: "frueh" | "spaet" | "nacht";
    start_time: string | null;
    end_time: string | null;
    planned_staff: number;
    actual_staff: number;
    notes: string;
};
export type RebalanceSuggestion = {
    id: string;
    staff_name: string;
    shift_id: string;
    shift_date: string;
    action: "remove" | "swap";
    replacement_staff_name: string | null;
    reason: string | null;
    overtime_hours: number | null;
};
export type StaffMember = {
    id: string;
    full_name: string;
    role: string;
    job_type: string;
    max_hours_per_week: number;
    active: boolean;
};
export type StaffWish = {
    id: string;
    full_name: string;
    date_from: string | null;
    date_to: string | null;
    shift_type: string;
    wish_type: string;
    message: string;
    status: string;
    created_at: string;
};
export const JOB_TYPES = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Aushilfe"];
export const DEFAULT_HOURS: Record<string, number> = {
    Vollzeit: 40, Teilzeit: 20, Minijob: 10, Werkstudent: 20, Aushilfe: 15,
};
export function deriveShiftType(startTime: string | null | undefined, endTime?: string | null): "frueh" | "spaet" | "nacht" {
    return ableitenAusLib(startTime, endTime) as "frueh" | "spaet" | "nacht";
}
export const SHIFT_PRESETS = [
    { label: "Früh", start: "06:00", end: "14:00", type: "frueh" as const },
    { label: "Spät", start: "14:00", end: "22:00", type: "spaet" as const },
    { label: "Nacht", start: "22:00", end: "06:00", type: "nacht" as const },
];
export type ShiftTypeConfig = {
    enabled: boolean;
    start: string;
    end: string;
    staff: number;
};
export type DayConfig = {
    frueh: ShiftTypeConfig;
    spaet: ShiftTypeConfig;
    nacht: ShiftTypeConfig;
};
export const DEFAULT_SHIFT_CFG: DayConfig = {
    frueh: { enabled: true, start: "06:00", end: "14:00", staff: 4 },
    spaet: { enabled: true, start: "14:00", end: "22:00", staff: 4 },
    nacht: { enabled: true, start: "22:00", end: "06:00", staff: 2 },
};
export const PRAXIS_SHIFT_CFG: DayConfig = {
    frueh: { enabled: true, start: "07:30", end: "13:00", staff: 3 },
    spaet: { enabled: true, start: "13:00", end: "18:30", staff: 2 },
    nacht: { enabled: false, start: "22:00", end: "06:00", staff: 0 },
};
export function standardTagCfg(praxis = false): DayConfig {
    const c = praxis ? PRAXIS_SHIFT_CFG : DEFAULT_SHIFT_CFG;
    return { frueh: { ...c.frueh }, spaet: { ...c.spaet }, nacht: { ...c.nacht } };
}
export function makeDayDefaults(praxis = false): Record<string, DayConfig> {
    return Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map(d => {
        const cfg = standardTagCfg(praxis);
        if (praxis && (d === "5" || d === "6")) {
            cfg.frueh.enabled = false;
            cfg.spaet.enabled = false;
            cfg.nacht.enabled = false;
        }
        return [d, cfg];
    }));
}
export const STATUS_LABEL: Record<string, string> = {
    offen: "Offen",
    in_arbeit: "In Arbeit",
    erledigt: "Erledigt",
    verworfen: "Verworfen",
};
export const SHIFT_COLORS: Record<string, string> = {
    frueh: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]",
    spaet: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]",
    nacht: "bg-[var(--akzent-flaeche)] text-[var(--tinte)]",
};
export function complianceColor(planned: number, actual: number) {
    if (planned === 0)
        return "var(--tinte-leise)";
    const r = actual / planned;
    if (r >= 0.9)
        return "var(--ok)";
    if (r >= 0.75)
        return "var(--warnung)";
    return "var(--gefahr)";
}
export function weekRange(offset = 0) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        from: toLocalISODate(monday),
        to: toLocalISODate(sunday),
    };
}
export function dateLabel(iso: string, locale = "de-DE") {
    return new Date(iso + "T00:00:00").toLocaleDateString(locale, {
        weekday: "short", day: "2-digit", month: "2-digit",
    });
}
export function getMonthRange(year: number, month: number) { return monatsBereichISO(year, month); }
export function getCalendarGrid(year: number, month: number): (number | null)[][] {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (number | null)[][] = [];
    let week: (number | null)[] = Array(7).fill(null);
    let col = firstDow;
    for (let d = 1; d <= daysInMonth; d++) {
        week[col] = d;
        if (++col === 7) {
            grid.push(week);
            week = Array(7).fill(null);
            col = 0;
        }
    }
    if (col > 0)
        grid.push(week);
    return grid;
}
export const DAY_NAMES_SHORT = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
function tagesSoll(r: PraxisRaster, dow: number, s: PraxisRaster["schichten"][number]): number {
    const b = r.besetzungJeTag?.[String(dow)]?.[s.art] ?? s;
    return b.bedarf + (b.aerzte ?? 0);
}
export function generatorAusRaster(r: PraxisRaster): Record<string, DayConfig> {
    const ersatz = standardTagCfg(true);
    return Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map(d => {
        const dow = (Number(d) + 1) % 7;
        const cfg = {} as DayConfig;
        for (const art of ["frueh", "spaet", "nacht"] as const) {
            const s = r.schichten.find(x => x.art === art);
            const zu = (r.geschlossen?.[String(dow)] ?? []).includes(art);
            const z = s ? zeitAmWochentag(r, dow, art) : null;
            cfg[art] = s && z
                ? { enabled: !zu, start: z.start, end: z.end, staff: tagesSoll(r, dow, s) }
                : { ...ersatz[art], enabled: false, staff: 0 };
        }
        return [d, cfg];
    }));
}

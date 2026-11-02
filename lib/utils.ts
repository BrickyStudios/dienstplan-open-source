import { isISODate, toLocalISODate, todayISO } from "@/lib/date";
export function daysUntil(date: Date | string | null | undefined, heute: string = todayISO()): number | null {
    if (!date)
        return null;
    const tag = typeof date === "string" ? date.slice(0, 10) : toLocalISODate(date);
    if (!isISODate(tag))
        return null;
    const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return Math.round((utc(tag) - utc(heute)) / 86400000);
}
export function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function fmtDateTime(iso: string | null | undefined): string {
    return iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

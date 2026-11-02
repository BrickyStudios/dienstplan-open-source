export function formatWochentag(date: string): string {
    try {
        return new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return date;
    }
}

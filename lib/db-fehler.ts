type DbFehler = {
    code?: string | null;
    message?: string | null;
} | null | undefined;
export function tabelleFehlt(error: DbFehler): boolean {
    const code = error?.code ?? "";
    return code === "42P01" || code === "PGRST205";
}
export function spalteFehlt(error: DbFehler): boolean {
    const code = error?.code ?? "";
    return code === "42703" || code === "PGRST204";
}
export function fehlendeSpalte(error: DbFehler): string | null {
    if (!spalteFehlt(error))
        return null;
    const m = error?.message ?? "";
    return (/find the '([^']+)' column/.exec(m)?.[1] ??
        /column "([^"]+)"/.exec(m)?.[1] ??
        /column [\w]+\.(\w+) does not exist/.exec(m)?.[1] ??
        null);
}
export function funktionFehlt(error: DbFehler): boolean {
    if (!error)
        return false;
    if (error.code === "PGRST202" || error.code === "42883")
        return true;
    return (error.message ?? "").toLowerCase().includes("could not find the function");
}
export function errMsg(err: unknown): string {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "object" && err !== null) {
        const e = err as Record<string, unknown>;
        return String(e.message ?? e.details ?? JSON.stringify(err));
    }
    return String(err);
}

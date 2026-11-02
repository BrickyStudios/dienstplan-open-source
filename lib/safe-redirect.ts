export function sicheresZiel(param: string | null | undefined, base: string, fallback = "/dashboard"): string {
    if (!param)
        return fallback;
    try {
        const ziel = new URL(param, base);
        if (ziel.origin !== new URL(base).origin)
            return fallback;
        return `${ziel.pathname}${ziel.search}${ziel.hash}`;
    }
    catch {
        return fallback;
    }
}

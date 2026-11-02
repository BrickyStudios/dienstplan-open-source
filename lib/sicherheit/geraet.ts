export function geraetKurz(ua: string | null | undefined): string {
    if (!ua)
        return "Unbekanntes Gerät";
    const system = /Windows/i.test(ua) ? "Windows"
        : /Android/i.test(ua) ? "Android"
            : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
                : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
                    : /Linux/i.test(ua) ? "Linux"
                        : "Unbekanntes System";
    const browser = /Nurvo/i.test(ua) ? "Nurvo-App"
        : /Edg\//i.test(ua) ? "Edge"
            : /OPR\//i.test(ua) ? "Opera"
                : /Firefox/i.test(ua) ? "Firefox"
                    : /Chrome/i.test(ua) ? "Chrome"
                        : /Safari/i.test(ua) ? "Safari"
                            : "Browser";
    return `${system} · ${browser}`;
}
export function ortKurz(o: {
    stadt?: string | null;
    land?: string | null;
}): string | null {
    return [o.stadt, o.land].filter(Boolean).join(", ") || null;
}

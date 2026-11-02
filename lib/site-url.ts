export const CANONICAL_SITE_URL = "https://www.nurvo.de";
const NON_CANONICAL_HOST = /(^|\.)vercel\.app$|(^|\.)vercel\.sh$|(^|\.)netlify\.app$|^localhost$|^127\.|^0\.0\.0\.0$/i;
export function siteUrl(): string {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!raw)
        return CANONICAL_SITE_URL;
    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" && url.protocol !== "http:")
            return CANONICAL_SITE_URL;
        if (NON_CANONICAL_HOST.test(url.hostname))
            return CANONICAL_SITE_URL;
        return url.origin;
    }
    catch {
        return CANONICAL_SITE_URL;
    }
}
export function absoluteUrl(path: string): string {
    return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
export function clientSiteUrl({ erlaubeLokal = false } = {}): string {
    if (erlaubeLokal && typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
            return window.location.origin;
        }
    }
    return siteUrl();
}

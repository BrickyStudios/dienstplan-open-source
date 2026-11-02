export const MARKETING_ROUTES = [
    "/",
    "/dienstplan-automatisierung",
    "/dienstplan-app",
    "/ki-copilot",
    "/burnout-praevention",
    "/sicherheit",
    "/dienstplan-arztpraxis",
    "/zeiterfassung-arztpraxis",
    "/faq",
    "/glossar",
    "/ueber-uns",
    "/bewertungen",
    "/vor-dem-vertrag",
    "/kooperation",
] as const;
export const VERGLEICH_PREFIX = "/vergleich";
export const RATGEBER_PREFIX = "/ratgeber";
export const FAQ_PREFIX = "/faq";
export const VORLAGEN_PREFIX = "/vorlagen";
export const EN_PREFIX = "/en";
export const OTHER_PUBLIC_ROUTES = [
    "/handy",
    "/geschlossen",
    "/external",
    "/gespraech",
    "/bewertung-freigabe",
    "/auth",
] as const;
export const PUBLIC_METADATA_ROUTES = ["/opengraph-image", "/twitter-image", "/icon", "/apple-icon"] as const;
export const PUBLIC_API_ROUTES = ["/api/demo-anfrage", "/api/waitlist", "/api/gespraech", "/api/bewertung-freigabe"] as const;
const PREFIX_ROUTES: readonly string[] = [
    RATGEBER_PREFIX,
    FAQ_PREFIX,
    VORLAGEN_PREFIX,
    EN_PREFIX,
    VERGLEICH_PREFIX,
    ...OTHER_PUBLIC_ROUTES,
    ...PUBLIC_METADATA_ROUTES,
    ...PUBLIC_API_ROUTES,
];
export function isPublicPath(pathname: string): boolean {
    const path = pathname.length > 1 && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
    if ((MARKETING_ROUTES as readonly string[]).includes(path))
        return true;
    return PREFIX_ROUTES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}
const PUBLIC_ASSET_EXTENSIONS = [
    "png", "svg", "jpg", "jpeg", "webp", "ico",
    "txt", "xml",
    "webmanifest",
] as const;
const PUBLIC_ASSET_PATHS: readonly string[] = [
    "/favicon.ico",
    "/sw.js",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/apple-touch-icon.png",
    "/ai-disclosure.json",
    "/vorlagen/dienstplan-vorlage-pflege.xlsx",
    "/vorlagen/dienstplan-vorlage-vorschau.png",
    "/.well-known/security.txt",
];
const PUBLIC_ASSET_PREFIXES: readonly string[] = [
    "/_next/",
    "/fonts/",
    "/produkt/",
    "/team/",
    "/film/",
    "/ocr/",
];
export function isPublicAsset(path: string): boolean {
    if (PUBLIC_ASSET_PREFIXES.some(prefix => path.startsWith(prefix)))
        return true;
    if (PUBLIC_ASSET_PATHS.includes(path))
        return true;
    return new RegExp(`^/[^/]+\.(${PUBLIC_ASSET_EXTENSIONS.join("|")})$`).test(path);
}

import type { NextConfig } from "next";
const APP_ORIGIN = process.env.APP_ORIGIN || "https://nurvo.vercel.app";
let SUPABASE_ORIGIN = "https://*.supabase.co";
try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL)
        SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
}
catch { }
const GA_ENABLED = /^G-[A-Z0-9]{4,}$/i.test((process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim());
const GA_SCRIPT_SRC = GA_ENABLED ? " https://www.googletagmanager.com" : "";
const GA_CONNECT_SRC = GA_ENABLED
    ? " https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com"
    : "";
const CLARITY_ENABLED = /^[a-z0-9]{6,20}$/i.test((process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "").trim());
const CLARITY_SCRIPT_SRC = CLARITY_ENABLED ? " https://www.clarity.ms https://scripts.clarity.ms" : "";
const CLARITY_CONNECT_SRC = CLARITY_ENABLED ? " https://www.clarity.ms https://*.clarity.ms" : "";
const DEV = process.env.NODE_ENV !== "production";
const UNSAFE_EVAL = DEV ? " 'unsafe-eval'" : "";
const WASM = " 'wasm-unsafe-eval'";
const EINBETTEN = (process.env.EMBED_ORIGINS ?? "").trim();
const securityHeaders = [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ...(EINBETTEN ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-XSS-Protection", value: "1; mode=block" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${UNSAFE_EVAL}${WASM}${GA_SCRIPT_SRC}${CLARITY_SCRIPT_SRC}`,
            "worker-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            `connect-src 'self' ${SUPABASE_ORIGIN}${GA_CONNECT_SRC}${CLARITY_CONNECT_SRC}`,
            "font-src 'self'",
            `frame-ancestors ${EINBETTEN || "'none'"}`,
        ].join("; "),
    },
];
const nextConfig: NextConfig = {
    env: {
        NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
    },
    output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
    async headers() {
        return [
            { source: "/(.*)", headers: securityHeaders },
            {
                source: "/(.*)",
                has: [{ type: "host", value: "(?<deployHost>.*\\.vercel\\.app)" }],
                headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
            },
            {
                source: "/api/(.*)",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: APP_ORIGIN },
                    { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, PUT, DELETE, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
                ],
            },
        ];
    },
    async redirects() {
        return [
            { source: "/download", destination: "/funktionen", permanent: true },
            { source: "/download/:path*", destination: "/funktionen", permanent: true },
            { source: "/admin-app", destination: "/", permanent: true },
            { source: "/ausfall-autopilot", destination: "/ratgeber/schichtplan-pflege", permanent: true },
            { source: "/fuer-kliniken", destination: "/ratgeber/ppbv", permanent: true },
            { source: "/dienstplan-krankenhaus", destination: "/ratgeber/ppbv", permanent: true },
            { source: "/dienstplan-pflegeheim", destination: "/ratgeber/wohnbereiche-pflegeheim", permanent: true },
            { source: "/ausfallmanagement-pflege", destination: "/ratgeber/schichtplan-pflege", permanent: true },
            { source: "/personalbemessung", destination: "/ratgeber/personalbemessung-pflege", permanent: true },
            { source: "/business-case", destination: "/preise", permanent: true },
            { source: "/en/hospital-scheduling", destination: "/en", permanent: true },
            { source: "/en/nursing-home-scheduling", destination: "/en", permanent: true },
            { source: "/en/nurse-staffing-germany", destination: "/en", permanent: true },
            { source: "/about", destination: "/en/about", permanent: true },
            { source: "/features", destination: "/en/features", permanent: true },
            { source: "/pricing", destination: "/en/pricing", permanent: true },
            { source: "/contact", destination: "/impressum", permanent: true },
            { source: "/kontakt", destination: "/impressum", permanent: true },
            { source: "/privacy", destination: "/datenschutz", permanent: true },
            { source: "/en/contact", destination: "/impressum", permanent: true },
            { source: "/en/imprint", destination: "/impressum", permanent: true },
            { source: "/en/privacy", destination: "/datenschutz", permanent: true },
            { source: "/produkt", destination: "/funktionen", permanent: true },
            { source: "/fuer-wen", destination: "/dienstplan-arztpraxis", permanent: true },
            { source: "/fuer-praxen", destination: "/dienstplan-arztpraxis", permanent: true },
        ];
    },
    async rewrites() {
        const proxy = process.env.PROXY_API_TO;
        if (!proxy)
            return [];
        return {
            beforeFiles: [
                { source: "/api/:path*", destination: `${proxy}/api/:path*` },
            ],
        };
    },
};
export default nextConfig;

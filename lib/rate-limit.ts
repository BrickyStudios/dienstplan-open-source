import { admin } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { meldeEreignis, nachDerAntwort } from "@/lib/sicherheit/wacht";
import { EREIGNISSE } from "@/lib/sicherheit/signaturen";
export function clientIp(req: NextRequest): string {
    return clientIpAusHeaders(req.headers);
}
export type KopfLeser = {
    get(name: string): string | null;
};
export function clientIpAusHeaders(h: KopfLeser): string {
    const vercel = h.get("x-vercel-forwarded-for")?.trim();
    if (vercel)
        return vercel.split(",").pop()!.trim();
    const real = h.get("x-real-ip")?.trim();
    if (real)
        return real;
    const chain = h.get("x-forwarded-for");
    const last = chain?.split(",").pop()?.trim();
    return last || "unknown";
}
export async function rateLimitSchritt(key: string, limit: number, windowMs: number): Promise<{
    zustand: "erlaubt";
} | {
    zustand: "gesperrt";
} | {
    zustand: "unpruefbar";
    grund: string;
}> {
    const db = admin();
    const fensterSekunden = Math.max(1, Math.round(windowMs / 1000));
    const { data, error } = await db.rpc("rate_limit_pruefen", {
        p_key: key,
        p_fenster_sekunden: fensterSekunden,
        p_limit: limit,
    });
    if (!error) {
        const antwort = data as {
            erlaubt?: boolean;
        } | null;
        return antwort?.erlaubt ? { zustand: "erlaubt" } : { zustand: "gesperrt" };
    }
    const fehltDieFunktion = error.code === "PGRST202" || /rate_limit_pruefen/.test(error.message ?? "");
    if (!fehltDieFunktion)
        return { zustand: "unpruefbar", grund: error.message ?? "rpc fehlgeschlagen" };
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const { count, error: zaehlFehler } = await db
        .from("demo_rate_limit")
        .select("*", { count: "exact", head: true })
        .eq("ip", key)
        .gte("created_at", windowStart);
    if (zaehlFehler)
        return { zustand: "unpruefbar", grund: zaehlFehler.message };
    if ((count ?? 0) >= limit)
        return { zustand: "gesperrt" };
    const { error: schreibFehler } = await db.from("demo_rate_limit").insert({ ip: key });
    if (schreibFehler)
        return { zustand: "unpruefbar", grund: schreibFehler.message };
    const cleanupBefore = new Date(Date.now() - windowMs * 2).toISOString();
    await db.from("demo_rate_limit").delete().eq("ip", key).lt("created_at", cleanupBefore);
    return { zustand: "erlaubt" };
}
export async function checkRateLimit(req: NextRequest, endpoint: string, opts: {
    limit: number;
    windowMs: number;
    message?: string;
}): Promise<NextResponse | null> {
    const key = `${endpoint}:${clientIp(req)}`;
    const ergebnis = await rateLimitSchritt(key, opts.limit, opts.windowMs);
    if (ergebnis.zustand === "erlaubt")
        return null;
    if (ergebnis.zustand === "gesperrt") {
        nachDerAntwort(() => meldeEreignis(req.headers, {
            art: "rate_limit", ...EREIGNISSE.rate_limit,
            methode: req.method, pfad: req.nextUrl.pathname, details: { endpunkt: endpoint },
        }));
        return NextResponse.json({ error: opts.message ?? "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429 });
    }
    console.error(`[rate-limit] ${endpoint}: Zaehlwerk nicht nutzbar — ${ergebnis.grund}`);
    return NextResponse.json({ error: "Dieser Dienst ist gerade nicht verfügbar. Bitte später erneut versuchen." }, { status: 503 });
}

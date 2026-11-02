import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAppRoute } from "@/lib/app-routes";
import { isPublicAsset, isPublicPath } from "@/lib/public-routes";
import { sicheresZiel } from "@/lib/safe-redirect";
import { clientIpAusHeaders } from "@/lib/rate-limit";
import { pruefeAnfrage } from "@/lib/sicherheit/signaturen";
import { istGesperrt, meldeEreignis, nachDerAntwort } from "@/lib/sicherheit/wacht";
import { anmeldungFesthalten, sitzungSchonGesehen } from "@/lib/sicherheit/konto";
function isAuthPath(path: string): boolean {
    return path.startsWith("/login") || path.startsWith("/register") ||
        path.startsWith("/passwort-vergessen") || path.startsWith("/passwort-zuruecksetzen");
}
function gesperrtAntwort(): NextResponse {
    return new NextResponse(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zugriff gesperrt</title>` +
        `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#0b1c30">` +
        `<h1 style="font-size:1.4rem">Zugriff vorübergehend gesperrt</h1>` +
        `<p>Von Ihrer Internetadresse kamen Anfragen, die wie ein Angriffsversuch aussahen. Die Sperre hebt sich nach Ablauf von selbst wieder auf.</p>` +
        `<p>Wenn das ein Irrtum ist, melden Sie sich bitte bei der Stelle, die diesen Dienst betreibt.</p>`, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
export async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    if (await istGesperrt(clientIpAusHeaders(request.headers))) {
        return gesperrtAntwort();
    }
    const ua = request.headers.get("user-agent");
    const befund = pruefeAnfrage({
        pfad: path,
        abfrage: request.nextUrl.search,
        userAgent: ua,
        hatAutorisierung: request.headers.has("authorization") || (ua ?? "").startsWith("vercel-cron/"),
    });
    if (befund) {
        nachDerAntwort(() => meldeEreignis(request.headers, {
            ...befund,
            methode: request.method,
            pfad: `${path}${request.nextUrl.search}`.slice(0, 500),
        }));
        if (befund.art !== "cron_unbefugt") {
            return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
        }
    }
    const publicAsset = isPublicAsset(path);
    if (publicAsset || isPublicPath(path) || path.startsWith("/api/")) {
        return NextResponse.next({ request });
    }
    if (!isAppRoute(path) && !isAuthPath(path)) {
        return NextResponse.next({ request });
    }
    let supabaseResponse = NextResponse.next({ request });
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
            },
        },
    });
    const { data: claims } = await supabase.auth.getClaims();
    const user = claims?.claims ? { id: claims.claims.sub } : null;
    const sitzungId = typeof claims?.claims?.session_id === "string" ? claims.claims.session_id : null;
    if (user && sitzungId && !sitzungSchonGesehen(sitzungId)) {
        const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
        nachDerAntwort(() => anmeldungFesthalten(request.headers, { userId: user.id, email, sitzungId }));
    }
    const isAuthPage = isAuthPath(path);
    if (user) {
        const expiresRaw = request.cookies.get("nurvo_demo_expires")?.value;
        if (expiresRaw) {
            const expiresAt = Number(expiresRaw);
            if (!isNaN(expiresAt) && Date.now() > expiresAt) {
                await supabase.auth.signOut();
                const url = request.nextUrl.clone();
                url.pathname = "/login";
                url.search = "?demo_expired=1";
                const redirect = NextResponse.redirect(url);
                redirect.cookies.delete("nurvo_demo_expires");
                return redirect;
            }
        }
    }
    if (!user && !isAuthPage) {
        const url = new URL("/login", request.url);
        url.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(url);
    }
    if (user && isAuthPage && path.startsWith("/login") &&
        request.nextUrl.searchParams.get("zweiter_faktor") === "1" &&
        claims?.claims?.aal === "aal1") {
        return supabaseResponse;
    }
    if (user && isAuthPage) {
        const redirectParam = request.nextUrl.searchParams.get("redirect");
        const safeTarget = sicheresZiel(redirectParam, request.url);
        return NextResponse.redirect(new URL(safeTarget, request.url));
    }
    return supabaseResponse;
}
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|woff|ttf|otf)$).*)"],
};

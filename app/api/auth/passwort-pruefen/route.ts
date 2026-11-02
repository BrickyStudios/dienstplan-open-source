import { NextRequest, NextResponse } from "next/server";
import { passwordOk, PASSWORD_HINT } from "@/lib/password";
import { passwortGeleakt, leakHinweis } from "@/lib/password-breach";
import { checkRateLimit } from "@/lib/rate-limit";
export type PasswortBefund = {
    ok: boolean;
    hinweis?: string;
    geleakt?: boolean;
    geprueft: boolean;
};
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, "passwort-pruefen", {
        limit: 30,
        windowMs: 15 * 60000,
        message: "Zu viele Prüfungen. Bitte einen Moment warten.",
    });
    if (limited)
        return limited;
    let passwort = "";
    try {
        const body = (await req.json()) as {
            password?: string;
        };
        passwort = body.password ?? "";
    }
    catch {
        return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    if (!passwordOk(passwort)) {
        return NextResponse.json<PasswortBefund>({
            ok: false,
            hinweis: PASSWORD_HINT,
            geprueft: false,
        });
    }
    const leak = await passwortGeleakt(passwort);
    if (leak.geleakt) {
        return NextResponse.json<PasswortBefund>({
            ok: false,
            hinweis: leakHinweis(leak.anzahl),
            geleakt: true,
            geprueft: true,
        });
    }
    return NextResponse.json<PasswortBefund>({ ok: true, geprueft: leak.geprueft });
}

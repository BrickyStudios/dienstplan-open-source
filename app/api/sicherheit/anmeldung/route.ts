import { NextRequest, NextResponse } from "next/server";
import { EREIGNISSE } from "@/lib/sicherheit/signaturen";
import { meldeEreignis, nachDerAntwort } from "@/lib/sicherheit/wacht";
export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as {
        email?: unknown;
        stufe?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    const stufe = body.stufe === "zweiter_faktor" ? "zweiter_faktor" : "passwort";
    nachDerAntwort(() => meldeEreignis(req.headers, {
        art: "login_fehlgeschlagen",
        ...EREIGNISSE.login_fehlgeschlagen,
        methode: "POST",
        pfad: "/login",
        details: { konto: email || null, stufe },
    }));
    return new NextResponse(null, { status: 204 });
}

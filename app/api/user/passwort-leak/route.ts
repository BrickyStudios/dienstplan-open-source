import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { passwortGeleakt } from "@/lib/password-breach";
export async function POST(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as {
        password?: unknown;
    };
    const passwort = typeof body.password === "string" ? body.password : "";
    if (!passwort || passwort.length > 512)
        return NextResponse.json({ geleakt: false });
    const leak = await passwortGeleakt(passwort);
    return NextResponse.json({ geleakt: leak.geleakt });
}

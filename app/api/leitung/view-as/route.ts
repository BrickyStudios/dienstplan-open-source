import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
const COOKIE = "nurvo_view_as_staff";
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const res = NextResponse.json({ ok: true, viewAs: "mitarbeiter" });
    res.cookies.set(COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
    });
    return res;
}
export async function DELETE(req: NextRequest) {
    void req;
    const res = NextResponse.json({ ok: true, viewAs: "leitung" });
    res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
}

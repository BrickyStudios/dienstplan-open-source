import { NextResponse } from "next/server";
const antwort = () => NextResponse.json({ error: "Diese Funktion gehört zur gehosteten Version: https://www.nurvo.de/preise" }, { status: 501 });
export { antwort as GET, antwort as POST, antwort as PATCH, antwort as PUT, antwort as DELETE };

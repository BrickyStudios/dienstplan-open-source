import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { exportBauen } from "@/lib/datenexport";
import { protokollieren } from "@/lib/personalakte/akte";
import { zugreifer } from "@/lib/personalakte/zugreifer";
import { berlinTodayISO } from "@/lib/date";
const BUCKET = "datenexport";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const gesperrt = await checkRateLimit(req, "datenexport", { limit: 5, windowMs: 60 * 60000, message: "Höchstens fünf Exporte je Stunde." });
    if (gesperrt)
        return gesperrt;
    const admin = createAdmin();
    const stand = new Date();
    const ergebnis = await exportBauen(admin, ctx.facilityName, stand);
    const ordner = createHash("sha256").update(ctx.facilityName).digest("hex").slice(0, 24);
    const datei = `nurvo-export-${berlinTodayISO(stand)}.zip`;
    const pfad = `${ordner}/${stand.getTime()}-${datei}`;
    const { error: bErr } = await admin.storage.createBucket(BUCKET, { public: false });
    if (bErr && !/exist/i.test(bErr.message))
        return NextResponse.json({ error: bErr.message }, { status: 500 });
    const { data: alte } = await admin.storage.from(BUCKET).list(ordner);
    if (alte?.length)
        await admin.storage.from(BUCKET).remove(alte.map((a) => `${ordner}/${a.name}`));
    const { error: upErr } = await admin.storage.from(BUCKET).upload(pfad, ergebnis.zip, { contentType: "application/zip", upsert: true });
    if (upErr)
        return NextResponse.json({ error: `Export nicht gespeichert: ${upErr.message}` }, { status: 500 });
    const { data: link, error: lErr } = await admin.storage.from(BUCKET).createSignedUrl(pfad, 3600, { download: datei });
    if (lErr || !link?.signedUrl)
        return NextResponse.json({ error: "Link nicht erzeugt" }, { status: 500 });
    const { data: akten } = await admin.from("personalakte").select("staff_id").eq("facility_name", ctx.facilityName);
    const wer = await zugreifer(req, ctx);
    for (const a of akten ?? []) {
        await protokollieren(admin, { facility: ctx.facilityName, staffId: a.staff_id as string, ...wer, aktion: "exportiert", details: "Gesamtexport der Einrichtung" });
    }
    return NextResponse.json({
        url: link.signedUrl,
        datei,
        groesse: ergebnis.zip.length,
        tabellen: ergebnis.tabellen,
        zeilen: ergebnis.zeilen,
        dokumente: ergebnis.dokumente,
        hinweise: ergebnis.fehlend,
    });
}

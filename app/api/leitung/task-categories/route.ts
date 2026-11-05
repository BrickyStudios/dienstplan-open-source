import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
import { trimOrNull } from "@/lib/task-extras";
const ACTIONS = ["reinigen", "austauschen", "desinfizieren", "reparieren", "sonstiges"];
const SCOPES = ["station", "bereich", "both"];
const MIGRATION_MSG = "Tabelle 'task_categories' fehlt — SQL-Migration 20260612 erforderlich.";
function cleanChecklist(v: unknown): string[] {
    if (!Array.isArray(v))
        return [];
    return v
        .map(x => (typeof x === "string" ? x.trim() : ""))
        .filter(x => x.length > 0)
        .slice(0, 30)
        .map(x => x.slice(0, 200));
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { data, error } = await admin()
        .from("task_categories")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .order("name");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ categories: [], migrationNeeded: true });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ categories: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const name = trimOrNull(body.name);
    if (!name)
        return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
    const { data, error } = await admin()
        .from("task_categories")
        .insert({
        facility_name: ctx.facilityName,
        name,
        scope: SCOPES.includes(body.scope) ? body.scope : "both",
        default_action: ACTIONS.includes(body.default_action) ? body.default_action : "reinigen",
        requires_signature: body.requires_signature === true,
        checklist: cleanChecklist(body.checklist),
    })
        .select()
        .single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: MIGRATION_MSG }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ category: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { id } = body;
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
        const name = trimOrNull(body.name);
        if (!name)
            return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
        updates.name = name;
    }
    if (body.scope !== undefined)
        updates.scope = SCOPES.includes(body.scope) ? body.scope : "both";
    if (body.default_action !== undefined)
        updates.default_action = ACTIONS.includes(body.default_action) ? body.default_action : "reinigen";
    if (body.requires_signature !== undefined)
        updates.requires_signature = body.requires_signature === true;
    if (body.checklist !== undefined)
        updates.checklist = cleanChecklist(body.checklist);
    if (Object.keys(updates).length === 0)
        return NextResponse.json({ error: "Nichts zu speichern" }, { status: 400 });
    const { data, error } = await admin()
        .from("task_categories")
        .update(updates)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select()
        .single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: MIGRATION_MSG }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ category: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json().catch(() => ({}));
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("task_categories")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

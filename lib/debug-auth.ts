import { admin as createAdminClient } from "@/lib/admin-client";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { resolveLeitung, type LeitungContext } from "@/lib/leitung-auth";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
export type DebugAccess = {
    ok: true;
    ctx: LeitungContext;
    isAdmin: boolean;
} | {
    ok: false;
    status: 403 | 404 | 400;
    error: string;
};
export type DebugCodeAccess = {
    ok: true;
    ctx: LeitungContext;
    grantedBy: "admin" | "facility";
} | {
    ok: false;
    status: 403 | 404 | 400;
    error: string;
};
export function debugToolsKilled(): boolean {
    return (process.env.DEBUG_TOOLS ?? "").toLowerCase() === "off";
}
function allowlistedEmails(): string[] {
    return (process.env.DEBUG_TOOLS_EMAILS ?? "")
        .split(",")
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
}
function devByEnv(email: string | null | undefined): boolean {
    if (process.env.DEBUG_TOOLS?.toLowerCase() === "on" && process.env.NODE_ENV !== "production")
        return true;
    if (!email)
        return false;
    return allowlistedEmails().includes(email.toLowerCase());
}
export async function hasDebugAccess(user: {
    email?: string | null;
} | null): Promise<boolean> {
    if (debugToolsKilled() || !user)
        return false;
    if (devByEnv(user.email))
        return true;
    if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return false;
    return istNurvoAdmin(user.email);
}
export async function resolveDebugAccess(req: NextRequest): Promise<DebugAccess> {
    if (debugToolsKilled()) {
        return { ok: false, status: 403, error: "Debug-Tools sind deaktiviert (DEBUG_TOOLS=off)." };
    }
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
    const { user } = await nutzerMitStufe(sb);
    if (!user)
        return { ok: false, status: 404, error: "Nicht gefunden." };
    let isAdmin = false;
    if (!devByEnv(user.email)) {
        if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return { ok: false, status: 404, error: "Nicht gefunden." };
        }
        if (!await istNurvoAdmin(user.email)) {
            return { ok: false, status: 404, error: "Nicht gefunden." };
        }
        isAdmin = true;
    }
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return { ok: false, status: 404, error: "Nicht gefunden." };
    if (!ctx.facilityName) {
        return {
            ok: false, status: 400,
            error: isAdmin
                ? "Keine Einrichtung geöffnet — im Admin-Bereich zuerst eine Einrichtung auswählen."
                : "Keine Einrichtung am Konto hinterlegt.",
        };
    }
    return { ok: true, ctx, isAdmin };
}
export async function facilityHasDebugCodes(facilityName: string): Promise<boolean> {
    if (!facilityName || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        return false;
    try {
        const { data, error } = await createAdminClient()
            .from("facility_settings")
            .select("debug_codes_enabled")
            .eq("facility_name", facilityName)
            .maybeSingle();
        if (error)
            return false;
        return data?.debug_codes_enabled === true;
    }
    catch {
        return false;
    }
}
export async function resolveDebugCodeAccess(req: NextRequest): Promise<DebugCodeAccess> {
    if (debugToolsKilled()) {
        return { ok: false, status: 403, error: "Debug-Codes sind deaktiviert (DEBUG_TOOLS=off)." };
    }
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
    const { user } = await nutzerMitStufe(sb);
    if (!user)
        return { ok: false, status: 404, error: "Nicht gefunden." };
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return { ok: false, status: 404, error: "Nicht gefunden." };
    if (!ctx.facilityName) {
        return { ok: false, status: 400, error: "Keine Einrichtung am Konto hinterlegt." };
    }
    if (ctx.isDemo) {
        return { ok: false, status: 403, error: "In der Demo-Ansicht nicht verfügbar." };
    }
    if (devByEnv(user.email))
        return { ok: true, ctx, grantedBy: "admin" };
    if (user.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        if (await istNurvoAdmin(user.email))
            return { ok: true, ctx, grantedBy: "admin" };
    }
    if (await facilityHasDebugCodes(ctx.facilityName)) {
        return { ok: true, ctx, grantedBy: "facility" };
    }
    return {
        ok: false, status: 403,
        error: "Für diese Einrichtung sind keine Debug-Codes freigeschaltet.",
    };
}

import { admin } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
export function isNativeClient(req: NextRequest): boolean {
    const client = req.headers.get("x-nurvo-client");
    return client === "desktop" || client === "mobile";
}
export function nativeClientDenied(): NextResponse {
    return NextResponse.json({ error: "Demo-Zugang ist nur im Browser verfügbar, nicht in der Desktop- oder Mobil-App." }, { status: 403 });
}
export async function isDemoExpired(userId: string): Promise<boolean> {
    const { data } = await admin()
        .from("user_profiles")
        .select("demo_expires_at, role")
        .eq("id", userId)
        .single();
    if (!data || data.role !== "demo")
        return false;
    if (!data.demo_expires_at)
        return false;
    return new Date(data.demo_expires_at) < new Date();
}
const DEMO_AI_LIMIT = 5;
export async function demoAiLimitExceeded(userId: string): Promise<boolean> {
    const db = admin();
    const { data } = await db
        .from("user_profiles")
        .select("demo_ai_calls, role")
        .eq("id", userId)
        .single();
    if (!data || data.role !== "demo")
        return false;
    const current = data.demo_ai_calls ?? 0;
    if (current >= DEMO_AI_LIMIT)
        return true;
    await db
        .from("user_profiles")
        .update({ demo_ai_calls: current + 1 })
        .eq("id", userId);
    return false;
}

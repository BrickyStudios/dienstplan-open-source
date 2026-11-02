import { NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
export async function GET() {
    try {
        const admin = createAdminClient();
        const { error } = await admin.from("user_profiles").select("id").limit(1);
        if (error)
            throw error;
        return NextResponse.json({ ok: true, db: "up", ts: Date.now() });
    }
    catch {
        return NextResponse.json({ ok: false, db: "down", ts: Date.now() }, { status: 503 });
    }
}

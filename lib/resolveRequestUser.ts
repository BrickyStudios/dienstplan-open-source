import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { resolveRequestAuth } from "@/lib/request-auth";
export async function resolveRequestUser(req: NextRequest): Promise<User | null> {
    return (await resolveRequestAuth(req))?.user ?? null;
}

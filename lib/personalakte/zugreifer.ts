import type { NextRequest } from "next/server";
import type { LeitungContext } from "@/lib/leitung-auth";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { istNurvoAdmin } from "@/lib/admin-auth";
export async function zugreifer(req: NextRequest, ctx: LeitungContext): Promise<{
    wer: string;
    rolle: string;
}> {
    const user = await resolveRequestUser(req);
    const admin = !!user?.email && (await istNurvoAdmin(user.email));
    return { wer: ctx.name, rolle: admin ? "admin" : ctx.isDemo ? "demo" : "leitung" };
}

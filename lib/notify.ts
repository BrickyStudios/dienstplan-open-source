type Admin = any;
export async function createNotification(admin: Admin, opts: {
    userId: string;
    facility: string;
    title: string;
    message: string;
}): Promise<void> {
    try {
        await admin.from("notifications").insert({
            user_id: opts.userId,
            facility_name: opts.facility,
            title: opts.title,
            message: opts.message,
        });
    }
    catch { }
}
export async function notifyLeitung(admin: Admin, facility: string, title: string, message: string): Promise<void> {
    if (!facility)
        return;
    try {
        const { data } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facility)
            .in("role", ["leitung", "demo"]);
        const { data: weitere } = await admin
            .from("leitung_einrichtungen")
            .select("user_id")
            .eq("facility_name", facility);
        const ids = new Set<string>([
            ...((data ?? []) as {
                id: string;
            }[]).map(r => r.id),
            ...((weitere ?? []) as {
                user_id: string;
            }[]).map(r => r.user_id),
        ]);
        const rows = [...ids].map(id => ({ user_id: id, facility_name: facility, title, message }));
        if (rows.length)
            await admin.from("notifications").insert(rows);
    }
    catch { }
}
export async function notifyStaffByName(admin: Admin, facility: string, fullName: string, title: string, message: string): Promise<void> {
    if (!facility || !fullName)
        return;
    try {
        const { data } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facility)
            .eq("full_name", fullName)
            .limit(1);
        const id = data?.[0]?.id as string | undefined;
        if (id)
            await createNotification(admin, { userId: id, facility, title, message });
    }
    catch { }
}

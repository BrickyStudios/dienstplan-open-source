export type ChecklistItem = {
    text: string;
    done: boolean;
};
export type ResolvedCategory = {
    action?: string;
    requires_signature: boolean;
    extra: Record<string, unknown>;
};
export async function resolveTaskCategory(db: any, facilityName: string, categoryId: unknown): Promise<ResolvedCategory | null> {
    if (typeof categoryId !== "string" || categoryId.length === 0)
        return null;
    const { data, error } = await db
        .from("task_categories")
        .select("id, name, default_action, requires_signature, checklist")
        .eq("id", categoryId)
        .eq("facility_name", facilityName)
        .maybeSingle();
    if (error || !data)
        return null;
    const checklist: ChecklistItem[] = Array.isArray(data.checklist)
        ? data.checklist
            .map((x: unknown) => (typeof x === "string" ? x.trim() : ""))
            .filter((x: string) => x.length > 0)
            .map((text: string) => ({ text, done: false }))
        : [];
    return {
        action: typeof data.default_action === "string" ? data.default_action : undefined,
        requires_signature: data.requires_signature === true,
        extra: {
            category_id: data.id,
            category_name: data.name,
            ...(checklist.length > 0 ? { checklist } : {}),
        },
    };
}
export function cleanChecklistInstance(v: unknown): ChecklistItem[] | null {
    if (!Array.isArray(v))
        return null;
    return v
        .map((x: any) => ({
        text: typeof x?.text === "string" ? x.text.trim().slice(0, 200) : "",
        done: x?.done === true,
    }))
        .filter(it => it.text.length > 0)
        .slice(0, 30);
}

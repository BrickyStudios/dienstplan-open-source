import { redirect } from "next/navigation";
import { getServerUser, createClient } from "@/lib/supabase/server";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { admin as createAdmin } from "@/lib/admin-client";
import { ladeMitarbeiterRechte } from "@/lib/rechte";
export default async function LeitungLayout({ children }: {
    children: React.ReactNode;
}) {
    const user = await getServerUser();
    if (!user)
        redirect("/login");
    if (user.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        if (await istNurvoAdmin(user.email))
            return <>{children}</>;
    }
    const supabase = await createClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    const role = profile?.role ?? user.user_metadata?.role ?? "mitarbeiter";
    if (role === "mitarbeiter" && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data: p } = await createAdmin().from("user_profiles").select("facility").eq("id", user.id).maybeSingle();
        const { rechte } = await ladeMitarbeiterRechte(createAdmin(), p?.facility ?? "", user.id);
        if (rechte.length)
            return <>{children}</>;
    }
    if (role !== "leitung" && role !== "demo") {
        redirect("/mein-dashboard");
    }
    return <>{children}</>;
}

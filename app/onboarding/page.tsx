import { redirect } from "next/navigation";
import { getServerUser, createClient } from "@/lib/supabase/server";
import OnboardingWizard from "@/components/OnboardingWizard";
import MitarbeiterOnboarding from "@/components/MitarbeiterOnboarding";
import Link from "next/link";
import { admin as createAdmin } from "@/lib/admin-client";
import { meineEinrichtungen } from "@/lib/einrichtungen";
import { planAusZeile } from "@/lib/plan";
export default async function OnboardingPage({ searchParams }: {
    searchParams: Promise<{
        again?: string;
    }>;
}) {
    const user = await getServerUser();
    if (!user)
        redirect("/login");
    const again = (await searchParams)?.again === "1";
    const supabase = await createClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, role, facility")
        .eq("id", user.id)
        .maybeSingle();
    const role = profile?.role ?? "mitarbeiter";
    if (role === "demo" && !again)
        redirect("/dashboard");
    const { data: onboardingRow } = await supabase
        .from("user_profiles")
        .select("onboarding_completed_at, demo_expires_at")
        .eq("id", user.id)
        .maybeSingle();
    if (!again && onboardingRow?.onboarding_completed_at)
        redirect("/dashboard");
    if (role === "mitarbeiter") {
        const { data: settings } = profile?.facility
            ? await createAdmin().from("facility_settings").select("plan").eq("facility_name", profile.facility).maybeSingle()
            : { data: null };
        return <MitarbeiterOnboarding userName={profile?.full_name ?? ""} praxis={planAusZeile(settings) === "praxis"}/>;
    }
    const isDemoCode = !!(onboardingRow as Record<string, unknown> | null)?.demo_expires_at;
    let mehrere = false;
    if (role === "leitung" && !isDemoCode && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const liste = await meineEinrichtungen(createAdmin(), user.id, profile?.facility ?? "").catch(() => null);
        mehrere = (liste?.length ?? 0) > 1;
    }
    return (<>
      {mehrere && (<Link href="/einrichtungen" className="fixed top-4 right-4 z-10 flex items-center gap-1.5 text-sm text-[var(--tinte-matt)] hover:text-[var(--tinte)] bg-[var(--papier)] border border-[var(--linie)] rounded-lg px-3 py-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apartment</span>
          Alle Einrichtungen
        </Link>)}
      <OnboardingWizard userId={user.id} facilityName={profile?.facility ?? ""} userName={profile?.full_name ?? ""} isDemoCode={isDemoCode}/>
    </>);
}

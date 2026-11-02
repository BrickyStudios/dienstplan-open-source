import { redirect } from "next/navigation";
import { ladeMitarbeiterRechte } from "@/lib/rechte";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient, getServerStufe } from "@/lib/supabase/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import Sidebar from "@/components/Sidebar";
import { isDemoCodeUser } from "@/lib/demo-auth";
import { hasDebugAccess } from "@/lib/debug-auth";
import OfflineBanner from "@/components/OfflineBanner";
import MitarbeiterSwapPopup from "@/components/MitarbeiterSwapPopup";
import LanguageShell from "@/components/LanguageShell";
import TooltipProvider from "@/components/TooltipProvider";
import ConfirmProvider from "@/components/ConfirmProvider";
import DeviceCheck from "@/components/DeviceCheck";
import IOSInstallHint from "@/components/IOSInstallHint";
import { SidebarProvider } from "@/lib/SidebarContext";
import { PlanProvider } from "@/lib/PlanContext";
import { resolveCapabilities, normalizePlan, istAktiverPlan, planFuerNeueEinrichtung } from "@/lib/plan";
import { preload } from "react-dom";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { spalteFehlt } from "@/lib/db-fehler";
import { meineEinrichtungen } from "@/lib/einrichtungen";
import { GEWAEHLT_COOKIE } from "@/lib/einrichtungen-cookie";
export default async function AppLayout({ children }: {
    children: React.ReactNode;
}) {
    preload("/fonts/material-symbols-outlined.woff2", {
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
    });
    const { user, stufeFehlt } = await getServerStufe();
    if (stufeFehlt)
        redirect("/login?zweiter_faktor=1");
    if (!user)
        redirect("/login");
    const supabase = await createClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, role, facility")
        .eq("id", user.id)
        .maybeSingle();
    const role = profile?.role ?? user.user_metadata?.role ?? "mitarbeiter";
    const userName = profile?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "";
    const facility = profile?.facility ?? user.user_metadata?.facility ?? "";
    const baseRole: "leitung" | "mitarbeiter" = role === "leitung" || role === "demo" ? "leitung" : "mitarbeiter";
    let isAdmin = false;
    if (user.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        isAdmin = await istNurvoAdmin(user.email);
    }
    const cookieStore = await cookies();
    const demoPreview = cookieStore.get("nurvo_demo_preview")?.value === "1";
    const demoEmails = [process.env.DEMO_LEITUNG_EMAIL, process.env.DEMO_MITARBEITER_EMAIL].filter(Boolean);
    const isDemoAccount = !!user.email && demoEmails.includes(user.email);
    const isCodeDemo = !isAdmin && await isDemoCodeUser(user);
    const isDemo = (!isAdmin && (role === "demo" || isDemoAccount || isCodeDemo)) || (isAdmin && demoPreview);
    if (role === "leitung" && !isAdmin && !isDemo) {
        const onboardingCookie = cookieStore.get(`nurvo_onboarding_done_${user.id}`)?.value;
        if (!onboardingCookie) {
            const { data: onboardingCheck } = await supabase
                .from("user_profiles")
                .select("onboarding_completed_at")
                .eq("id", user.id)
                .maybeSingle();
            if (!onboardingCheck?.onboarding_completed_at) {
                redirect("/onboarding");
            }
        }
    }
    if (baseRole === "mitarbeiter" && !isDemo && !isAdmin) {
        const onboardingCookie = cookieStore.get(`nurvo_onboarding_done_${user.id}`)?.value;
        if (!onboardingCookie) {
            const { data: onboardingCheck } = await supabase
                .from("user_profiles")
                .select("onboarding_completed_at")
                .eq("id", user.id)
                .maybeSingle();
            if (!onboardingCheck?.onboarding_completed_at) {
                redirect("/onboarding");
            }
        }
    }
    let needsRecoverySetup = false;
    if (!isDemo && !isAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const rpClient = createAdminClient();
            const { data: rp, error: rpErr } = await rpClient
                .from("user_profiles")
                .select("recovery_phrase_hash")
                .eq("id", user.id)
                .maybeSingle();
            if (!rpErr && rp && !rp.recovery_phrase_hash)
                needsRecoverySetup = true;
        }
        catch { }
    }
    if (needsRecoverySetup)
        redirect("/recovery-setup");
    let braucht2fa = false;
    if (baseRole === "leitung" && !isDemo && !isAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const { faktorLage } = await import("@/lib/mfa");
            const lage = await faktorLage(user.id, "leitung", facility);
            braucht2fa = lage.fehltPflicht;
        }
        catch { }
    }
    if (braucht2fa)
        redirect("/zwei-faktor-setup");
    let einrichtungsAnzahl: number | undefined;
    if (role === "leitung" && !isDemo && !isAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const liste = await meineEinrichtungen(createAdminClient(), user.id, facility);
            if (liste)
                einrichtungsAnzahl = liste.length;
        }
        catch { }
    }
    if (einrichtungsAnzahl !== undefined && einrichtungsAnzahl > 1 && !cookieStore.get(GEWAEHLT_COOKIE)?.value) {
        redirect("/einrichtungen");
    }
    const canPreview = isAdmin || isDemo;
    const exitPreviewPath = isAdmin ? "/admin" : "/dashboard";
    const previewRole = canPreview ? cookieStore.get("nurvo_preview_role")?.value : undefined;
    const accessFacility = isAdmin ? cookieStore.get("nurvo_access_facility")?.value : undefined;
    const staffCookieId = cookieStore.get("nurvo_demo_staff_id")?.value;
    const devViewingAsStaff = !!staffCookieId && baseRole === "leitung" && !isAdmin && !isDemo &&
        (await hasDebugAccess(user));
    const demoStaffName = (isDemo || devViewingAsStaff)
        ? (cookieStore.get("nurvo_demo_staff_name")?.value || undefined)
        : undefined;
    const leitungSelfViewAsStaff = baseRole === "leitung" && !isAdmin && !isDemo && !previewRole &&
        cookieStore.get("nurvo_view_as_staff")?.value === "1";
    const effectiveRole = (leitungSelfViewAsStaff || devViewingAsStaff)
        ? "mitarbeiter"
        : (previewRole as "leitung" | "mitarbeiter" | undefined) ?? baseRole;
    const canSelfViewAsStaff = baseRole === "leitung" && !isAdmin && !isDemo && !previewRole && !devViewingAsStaff;
    const displayFacility = accessFacility || facility;
    let planRaw: unknown = null;
    let planZeileFehlt = false;
    let debugCodesEnabled = false;
    if (displayFacility && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const planClient = createAdminClient();
            const { data: planRow, error: planErr } = await planClient
                .from("facility_settings")
                .select("plan, debug_codes_enabled")
                .eq("facility_name", displayFacility)
                .maybeSingle();
            if (planErr && spalteFehlt(planErr)) {
                const { data: fallbackRow } = await planClient
                    .from("facility_settings")
                    .select("plan")
                    .eq("facility_name", displayFacility)
                    .maybeSingle();
                planRaw = fallbackRow?.plan ?? null;
                planZeileFehlt = !fallbackRow;
            }
            else {
                planRaw = planRow?.plan ?? null;
                planZeileFehlt = !planErr && !planRow;
                debugCodesEnabled = planRow?.debug_codes_enabled === true;
            }
        }
        catch {
            planRaw = null;
        }
    }
    if (planZeileFehlt)
        planRaw = planFuerNeueEinrichtung();
    const demoPlanCookie = isDemo ? cookieStore.get("nurvo_demo_plan")?.value : undefined;
    if (demoPlanCookie && ["klinik", "pflege", "praxis", "station"].includes(demoPlanCookie)
        && istAktiverPlan(normalizePlan(demoPlanCookie))) {
        planRaw = demoPlanCookie;
    }
    const caps = resolveCapabilities(planRaw);
    const rechte = baseRole === "mitarbeiter" && !isDemo && !isAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? (await ladeMitarbeiterRechte(createAdminClient(), facility, user.id)).rechte
        : [];
    return (<PlanProvider plan={caps.plan}>
    <LanguageShell>
    <ConfirmProvider>
    <SidebarProvider>
    <div className="flex h-dvh overflow-hidden">
      <Sidebar role={effectiveRole} userName={devViewingAsStaff && demoStaffName ? demoStaffName : userName} facility={displayFacility} caps={caps} isAdmin={canPreview} isPreview={!!previewRole} canSelfViewAsStaff={canSelfViewAsStaff} selfViewingAsStaff={leitungSelfViewAsStaff || devViewingAsStaff} viewingAsName={devViewingAsStaff ? demoStaffName : undefined} exitPreviewPath={exitPreviewPath} einrichtungen={einrichtungsAnzahl} rechte={rechte} adminLink={isAdmin && !previewRole
            ? (<Link href="/admin" className="flex items-center gap-3 pl-0 pr-2 py-2 text-[13px] font-medium text-[var(--ki)] hover:bg-[var(--akzent-flaeche)] transition-colors w-full rounded-lg">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#7c3aed" }}>shield</span>
                Admin Panel
              </Link>)
            : null}/>
      <div className="flex-1 flex flex-col overflow-hidden">
        
        
        <OfflineBanner />
        {effectiveRole === "mitarbeiter" && <MitarbeiterSwapPopup />}
        <main className="flex-1 overflow-y-auto bg-[var(--papier-tief)]">{children}</main>
      </div>
    </div>
    </SidebarProvider>
    </ConfirmProvider>
    <TooltipProvider />
    {!isDemo && <DeviceCheck userId={user.id}/>}
    <IOSInstallHint />
    </LanguageShell>
    </PlanProvider>);
}

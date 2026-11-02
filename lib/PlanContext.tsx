"use client";
import { createContext, useContext } from "react";
import { getPlanCapabilities, planFuerNeueEinrichtung, type Plan, type PlanCapabilities } from "@/lib/plan";
const PlanContext = createContext<Plan | null>(null);
export function PlanProvider({ plan, children }: {
    plan: Plan;
    children: React.ReactNode;
}) {
    return <PlanContext.Provider value={plan}>{children}</PlanContext.Provider>;
}
export function usePlanRoh(): Plan | null {
    return useContext(PlanContext);
}
export function usePlanCaps(): PlanCapabilities {
    return getPlanCapabilities(useContext(PlanContext) ?? planFuerNeueEinrichtung());
}
export function useIstPraxis(): boolean {
    return (useContext(PlanContext) ?? planFuerNeueEinrichtung()) === "praxis";
}

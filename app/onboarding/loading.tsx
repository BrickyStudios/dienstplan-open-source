import { PulseLoader } from "@/components/PulseLoader";
export default function OnboardingLoading() {
    return (<div className="min-h-svh bg-[var(--papier-tief)] flex flex-col items-center justify-center gap-4">
      <PulseLoader size={36}/>
      <span className="text-[13px] text-[var(--tinte-leise)]">Laden…</span>
    </div>);
}

import { PulseLoader } from "@/components/PulseLoader";
export default function AppLoading() {
    return (<div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <PulseLoader size={32}/>
      <span className="text-[13px] text-[var(--tinte-leise)]">Laden…</span>
    </div>);
}

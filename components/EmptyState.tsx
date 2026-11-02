"use client";
type Step = {
    label: string;
    done?: boolean;
};
type EmptyStateProps = {
    icon: string;
    title: string;
    subtitle?: string;
    steps?: Step[];
    cta?: {
        label: string;
        onClick: () => void;
        icon?: string;
    };
    compact?: boolean;
};
export function EmptyState({ icon, title, subtitle, steps, cta, compact }: EmptyStateProps) {
    const doneCount = steps?.filter(s => s.done).length ?? 0;
    const total = steps?.length ?? 0;
    const allDone = total > 0 && doneCount === total;
    return (<div className={`flex flex-col items-center text-center ${compact ? "py-8 px-4" : "py-14 px-6"}`}>
      
      <div className="w-16 h-16 rounded-2xl bg-[var(--akzent-flaeche)] flex items-center justify-center mb-4 ">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 28 }}>{icon}</span>
      </div>

      <h3 className={`font-semibold text-[var(--tinte)] mb-1 ${compact ? "text-[14px]" : "text-[16px]"}`}>{title}</h3>
      {subtitle && (<p className="text-[var(--tinte-matt)] text-[13px] max-w-xs leading-relaxed mb-5">{subtitle}</p>)}

      
      {steps && steps.length > 0 && (<div className="w-full max-w-xs mb-5 text-left">
          {total > 1 && (<div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider">
                {allDone ? "Alles erledigt" : "So geht's"}
              </p>
              <span className="text-[13px] font-medium text-[var(--akzent)]">{doneCount}/{total}</span>
            </div>)}

          
          {total > 1 && (<div className="h-1 w-full bg-[var(--linie)] rounded-full mb-3 overflow-hidden">
              <div className="h-full bg-[var(--akzent)] rounded-full transition-[width] duration-[240ms]" style={{ width: `${(doneCount / total) * 100}%` }}/>
            </div>)}

          <div className="space-y-2">
            {steps.map((step, i) => (<div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${step.done
                    ? "bg-[var(--akzent-flaeche)] border-[var(--linie)]"
                    : i === doneCount
                        ? "bg-[var(--akzent-flaeche)] border-[var(--akzent)]"
                        : "bg-[var(--papier)] border-[var(--linie)]"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[13px] font-semibold ${step.done
                    ? "bg-[var(--akzent)] text-white"
                    : i === doneCount
                        ? "bg-[var(--akzent)] text-white"
                        : "bg-[var(--linie)] text-[var(--tinte-matt)]"}`}>
                  {step.done
                    ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
                    : i + 1}
                </div>
                <p className={`text-[13px] leading-relaxed ${step.done ? "text-[var(--akzent)] line-through" : i === doneCount ? "text-[var(--akzent)] font-semibold" : "text-[var(--tinte-matt)]"}`}>
                  {step.label}
                </p>
              </div>))}
          </div>
        </div>)}

      
      {cta && (<button onClick={cta.onClick} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-[13px] bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition  shadow-indigo-100">
          {cta.icon && (<span className="material-symbols-outlined" style={{ fontSize: 16 }}>{cta.icon}</span>)}
          {cta.label}
        </button>)}
    </div>);
}

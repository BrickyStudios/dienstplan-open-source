"use client";
import { passwordRules, passwordScore } from "@/lib/password";
export default function PasswordStrength({ password }: {
    password: string;
}) {
    if (!password)
        return null;
    const rules = passwordRules(password);
    const score = passwordScore(password);
    const pct = (score / 5) * 100;
    const label = score <= 2 ? "Schwach" : score <= 3 ? "Mittel" : score <= 4 ? "Gut" : "Stark";
    const color = score <= 2 ? "#ef4444" : score <= 3 ? "#f59e0b" : score <= 4 ? "#10b981" : "var(--akzent)";
    const items: [
        keyof PasswordRulesKeys,
        string
    ][] = [
        ["length", "min. 8 Zeichen"],
        ["upper", "Großbuchstabe"],
        ["lower", "Kleinbuchstabe"],
        ["digit", "Zahl"],
        ["special", "Sonderzeichen"],
    ];
    return (<div className="mt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-[var(--papier-tief)] overflow-hidden">
          <div className="h-full rounded-full transition-[width,background-color] duration-[240ms]" style={{ width: `${pct}%`, background: color }}/>
        </div>
        <span className="text-[13px] font-semibold" style={{ color }}>{label}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {items.map(([k, lbl]) => (<li key={k} className={`text-[13px] flex items-center gap-1 ${rules[k] ? "text-[var(--ok)]" : "text-[var(--tinte-leise)]"}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              {rules[k] ? "check_circle" : "radio_button_unchecked"}
            </span>
            {lbl}
          </li>))}
      </ul>
    </div>);
}
type PasswordRulesKeys = ReturnType<typeof passwordRules>;

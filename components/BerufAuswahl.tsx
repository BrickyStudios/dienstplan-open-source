"use client";
import { berufeFuer } from "@/lib/berufe";
import type { Plan } from "@/lib/plan";
export default function BerufAuswahl({ id, value, onChange, plan, className, }: {
    id?: string;
    value: string;
    onChange: (beruf: string) => void;
    plan: Plan;
    className?: string;
}) {
    const gruppen = berufeFuer(plan);
    const imKatalog = gruppen.some(g => g.berufe.includes(value));
    return (<select id={id} value={value} onChange={e => onChange(e.target.value)} className={className}>
      {!imKatalog && value && <option value={value}>{value}</option>}
      {gruppen.map(g => (<optgroup key={g.gruppe} label={g.label}>
          {g.berufe.map(b => <option key={b} value={b}>{b}</option>)}
        </optgroup>))}
    </select>);
}

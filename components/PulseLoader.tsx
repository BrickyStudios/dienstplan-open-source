"use client";
export function PulseLoader({ size = 20, className = "" }: {
    size?: number;
    className?: string;
}) {
    const color = "var(--akzent)";
    if (size <= 14) {
        const w = Math.round(size * 2.4);
        const h = size;
        const mid = h / 2;
        const top = h * 0.08;
        const bot = h * 0.92;
        const lead = w * 0.28;
        const q = w * 0.42;
        const r = w * 0.50;
        const s = w * 0.58;
        const tail = w * 0.72;
        const d = `M0,${mid} L${lead},${mid} L${q},${mid + h * 0.2} L${r},${top} L${s},${bot} L${tail},${mid} L${w},${mid}`;
        return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
        <path d={d} stroke={color} strokeWidth={Math.max(1, size * 0.12)} strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
          <animate attributeName="stroke-dashoffset" values="1;0;0;1" keyTimes="0;0.55;0.82;1" dur="1.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4,0,0.2,1; 0,0,1,1; 0.8,0,1,1"/>
        </path>
      </svg>);
    }
    const w = Math.round(size * 4.2);
    const h = size;
    const mid = h / 2;
    const top = h * 0.06;
    const bot = h * 0.94;
    const pTop = h * 0.22;
    const tTop = h * 0.18;
    const x = (frac: number) => Math.round(frac * w);
    const d = [
        `M0,${mid}`,
        `L${x(0.18)},${mid}`,
        `C${x(0.21)},${mid} ${x(0.22)},${pTop} ${x(0.25)},${pTop}`,
        `C${x(0.28)},${pTop} ${x(0.29)},${mid} ${x(0.32)},${mid}`,
        `L${x(0.37)},${mid}`,
        `L${x(0.40)},${mid + h * 0.18}`,
        `L${x(0.43)},${top}`,
        `L${x(0.46)},${bot}`,
        `L${x(0.49)},${mid}`,
        `L${x(0.55)},${mid}`,
        `C${x(0.57)},${mid} ${x(0.59)},${tTop} ${x(0.63)},${tTop}`,
        `C${x(0.67)},${tTop} ${x(0.69)},${mid} ${x(0.72)},${mid}`,
        `L${w},${mid}`,
    ].join(" ");
    return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className={className} style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      
      <line x1="0" y1={mid} x2={w} y2={mid} stroke={color} strokeWidth="0.5" strokeOpacity="0.12"/>

      <path d={d} stroke={color} strokeWidth={Math.max(1.5, size * 0.075)} strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
        <animate attributeName="stroke-dashoffset" values="1;0;0;1" keyTimes="0;0.62;0.88;1" dur="1.9s" repeatCount="indefinite" calcMode="spline" keySplines="0.25,0.1,0.25,1; 0,0,1,1; 0.8,0,1,1"/>
      </path>

      
      <circle cx={x(0.43)} cy={top} r={Math.max(2, size * 0.1)} fill={color} opacity="0">
        <animate attributeName="opacity" values="0;0;1;0.8;0" keyTimes="0;0.39;0.43;0.50;0.62" dur="1.9s" repeatCount="indefinite"/>
        <animate attributeName="r" values={`${size * 0.08};${size * 0.08};${size * 0.14};${size * 0.08};${size * 0.08}`} keyTimes="0;0.39;0.43;0.55;0.62" dur="1.9s" repeatCount="indefinite"/>
      </circle>
    </svg>);
}

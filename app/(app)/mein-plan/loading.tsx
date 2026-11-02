export default function MeinPlanLoading() {
    return (<div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-40 bg-[var(--akzent-flaeche)] rounded-lg"/>
      <div className="h-12 bg-[var(--akzent-flaeche)] rounded-xl"/>
      {[1, 2, 3, 4].map(i => (<div key={i} className="h-20 bg-[var(--akzent-flaeche)] rounded-xl"/>))}
    </div>);
}

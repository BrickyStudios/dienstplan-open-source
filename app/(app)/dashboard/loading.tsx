export default function DashboardLoading() {
    return (<div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-[var(--akzent-flaeche)] rounded-lg"/>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (<div key={i} className="h-28 bg-[var(--akzent-flaeche)] rounded-xl"/>))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-[var(--akzent-flaeche)] rounded-xl"/>
        <div className="h-64 bg-[var(--akzent-flaeche)] rounded-xl"/>
      </div>
    </div>);
}

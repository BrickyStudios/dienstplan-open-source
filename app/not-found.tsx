import Link from "next/link";
export default function NichtGefunden() {
    return (<main className="min-h-svh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-[24px] font-medium">Seite nicht gefunden</h1>
      <Link href="/dashboard" className="underline">Zum Dienstplan</Link>
    </main>);
}

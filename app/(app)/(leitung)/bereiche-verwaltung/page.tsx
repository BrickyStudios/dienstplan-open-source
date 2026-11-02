"use client";
import Header from "@/components/Header";
import BereicheManager from "@/components/BereicheManager";
export default function BereicheVerwaltungPage() {
    return (<div>
      <Header title="Bereiche" subtitle="Funktionsbereiche & Aufgaben deiner Praxis"/>
      <div className="px-7 pb-7 pt-4">
        <BereicheManager />
      </div>
    </div>);
}

"use client";
import { createContext, useContext, useState } from "react";
type SidebarCtx = {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
};
const SidebarContext = createContext<SidebarCtx>({
    isOpen: false,
    toggle: () => { },
    close: () => { },
});
export const useSidebar = () => useContext(SidebarContext);
export function SidebarProvider({ children }: {
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);
    return (<SidebarContext.Provider value={{
            isOpen,
            toggle: () => setIsOpen(v => !v),
            close: () => setIsOpen(false),
        }}>
      {children}
    </SidebarContext.Provider>);
}

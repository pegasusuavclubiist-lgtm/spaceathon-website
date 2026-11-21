"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteContentBundle } from "@/app/content/site-content-types";

const SiteContentContext = createContext<SiteContentBundle | null>(null);

export function SiteContentProvider({
  initialContent,
  children,
}: {
  initialContent: SiteContentBundle;
  children: ReactNode;
}) {
  return (
    <SiteContentContext.Provider value={initialContent}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent(): SiteContentBundle {
  const ctx = useContext(SiteContentContext);
  if (!ctx) {
    throw new Error("useSiteContent must be used inside SiteContentProvider");
  }
  return ctx;
}

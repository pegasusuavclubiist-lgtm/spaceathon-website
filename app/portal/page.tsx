import type { Metadata } from "next";
import { PortalApp } from "@/app/components/portal/PortalApp";
import { PageHeader } from "@/app/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Team portal",
  description: "Sign in with your personal portal key.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/portal" },
};

export default function PortalPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <PageHeader
        eyebrow="Mission control"
        title="Team portal"
        description="Sign the Integrity Declaration, get your problem statements at kickoff, record checkpoints and make your submission."
      />
      <div className="mt-10">
        <PortalApp />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { JudgePortalApp } from "@/app/components/judge/JudgePortalApp";
import { PageHeader } from "@/app/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Judging Portal",
  description:
    "Kosmodrome 2027 Judging Portal: blind submission review, AI-usage transparency telemetry, and locked rubric scoring.",
  robots: { index: false, follow: false },
};

export default function JudgePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <PageHeader
        eyebrow="Evaluation desk"
        title="Judging Portal"
        description="Review assigned submissions, inspect AI-usage telemetry and declared AI logs, and submit locked rubric score sheets."
      />
      <div className="mt-10">
        <JudgePortalApp />
      </div>
    </div>
  );
}

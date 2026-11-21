import type { Metadata } from "next";
import { Button3D } from "@/app/components/ui/Button3D";
import { Callout } from "@/app/components/ui/Callout";
import { Frame } from "@/app/components/ui/Frame";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { SectionHeading } from "@/app/components/ui/SectionHeading";
import { TimelineView } from "@/app/components/sections/TimelineView";
import { CalendarDownload } from "@/app/components/sections/CalendarDownload";
import { TBA } from "@/app/content/site-config";
import { getLiveSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Timeline",
  description:
    "The full Kosmodrome 2027 schedule (17–18 January 2027): registration, kickoff, checkpoints, hard close, blind judging, finals and results.",
  alternates: {
    canonical: "/timeline",
  },
};

export default async function TimelinePage() {
  const { general, timeline } = await getLiveSiteContent();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <PageHeader
        eyebrow="Launch sequence"
        title="From registration to the final result"
        description={`Event dates: ${general.eventDatesLabel}. Milestones across registration, the 48-hour build, judging and the closing ceremony.`}
      >
        <Button3D href="/rules" variant="secondary">
          Read the rules
        </Button3D>
      </PageHeader>

      <Frame className="mt-8 rounded-xl">
        <Callout title="Time base" tone="primary">
          <p>
            Event dates: <strong>{general.eventDatesLabel}</strong>. All times
            IST. Kickoff (T0) is at 10:00 IST on Day 1.
          </p>
          {general.eventStartISO ? null : (
            <p className="mt-2 text-muted">Calendar dates: {TBA}.</p>
          )}
        </Callout>
      </Frame>

      <div className="mt-6">
        <CalendarDownload />
      </div>

      <section
        className="mt-12"
        aria-labelledby="full-timeline-heading"
        data-hud="LAUNCH SEQUENCE"
      >
        <SectionHeading
          id="full-timeline-heading"
          eyebrow="Full schedule"
          title="Every milestone and deadline"
        />
        <div className="mt-8">
          <TimelineView items={timeline} />
        </div>
      </section>
    </div>
  );
}

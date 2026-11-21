import type { Metadata } from "next";
import Link from "next/link";
import { Accordion } from "@/app/components/ui/Accordion";
import { Button3D } from "@/app/components/ui/Button3D";
import { Callout } from "@/app/components/ui/Callout";
import { Frame } from "@/app/components/ui/Frame";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { SectionHeading } from "@/app/components/ui/SectionHeading";
import { TBA } from "@/app/content/site-config";
import { getLiveSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "Official rules for Kosmodrome 2027: eligibility, teams, development, platform conduct, grievances, IP and data.",
  alternates: {
    canonical: "/rules",
  },
};

export default async function RulesPage() {
  const { general, ruleSections } = await getLiveSiteContent();

  const accordionItems = ruleSections.map((section) => ({
    id: section.id,
    title: section.title,
    content: (
      <ul className="space-y-2.5">
        {section.bullets.map((bullet, index) => (
          <li key={index} className="flex gap-3">
            <span
              className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    ),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <PageHeader
        eyebrow="Range rules"
        title="The rules, in short"
        description="A compact summary of the rulebook. Open a section for the short bullet version."
      >
        <div className="flex flex-wrap gap-3">
          <Button3D href="/fair-play" variant="secondary">
            Fair-play framework
          </Button3D>
          <Button3D href="/submission" variant="secondary">
            Submission rules
          </Button3D>
        </div>
      </PageHeader>

      <Frame className="mt-8 rounded-xl">
        <Callout title="Rulebook status" tone="warning">
          <p>
            Full rulebook:{" "}
            {general.rulebookUrl ? (
              <Link
                href={general.rulebookUrl}
                className="text-primary underline underline-offset-4"
              >
                Read the rulebook
              </Link>
            ) : (
              <span className="font-medium text-foreground">{TBA}</span>
            )}
            .
          </p>
        </Callout>
      </Frame>

      <section
        className="mt-12"
        aria-labelledby="rule-sections-heading"
        data-hud="RANGE RULES"
      >
        <SectionHeading
          id="rule-sections-heading"
          eyebrow="Sections"
          title="Rulebook sections"
          description="Eligibility, teams, development, platform conduct, grievances, and IP and data."
        />
        <Frame className="mt-8 rounded-xl">
          <Accordion
            items={accordionItems}
            defaultOpenIds={ruleSections[0] ? [ruleSections[0].id] : []}
            className="rulebook"
          />
        </Frame>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button3D href="/register" variant="secondary">
          Register
        </Button3D>
        <Button3D href="/contact" variant="secondary">
          Ask the OC
        </Button3D>
      </div>
    </div>
  );
}

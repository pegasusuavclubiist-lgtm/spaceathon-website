import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/app/components/sections/FaqList";
import { Hero } from "@/app/components/sections/Hero";
import { MiniTimeline } from "@/app/components/sections/MiniTimeline";
import { SponsorsStrip } from "@/app/components/sections/SponsorsStrip";
import { TrackCards } from "@/app/components/sections/TrackCards";
import { Marquee } from "@/app/components/fx/Marquee";
import { Magnetic } from "@/app/components/fx/Magnetic";
import { GantryDivider } from "@/app/components/fx/GantryDivider";
import { Reveal } from "@/app/components/fx/Reveal";
import { SplitHeading } from "@/app/components/fx/SplitHeading";
import { SpotlightGroup } from "@/app/components/fx/SpotlightGroup";
import { SpotlightTile } from "@/app/components/fx/SpotlightTile";
import { TiltCard } from "@/app/components/fx/TiltCard";
import { Badge } from "@/app/components/ui/Badge";
import { BeamBorder } from "@/app/components/ui/BeamBorder";
import { Button3D } from "@/app/components/ui/Button3D";
import { Card } from "@/app/components/ui/Card";
import { Frame } from "@/app/components/ui/Frame";
import { SectionHeading } from "@/app/components/ui/SectionHeading";
import { StatCard } from "@/app/components/ui/StatCard";
import { cn } from "@/app/components/ui/cn";
import { ArrowRightIcon } from "@/app/components/ui/icons";
import type { FaqGroup, TimelineItem } from "@/app/content/event-data";
import { siteConfig } from "@/app/content/site-config";
import { getLiveSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — ${siteConfig.tagline}` },
  description: siteConfig.description,
  alternates: {
    canonical: "/",
  },
};

const pageContainer =
  "mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8";

export default async function HomePage() {
  const content = await getLiveSiteContent();
  const {
    general,
    stats,
    guarantees,
    tracks,
    trackThemesNote,
    timeline,
    prizeTracks,
    prizeCertificates,
    faqGroups,
    homeFaqIds,
  } = content;

  const eventJsonLd = general.eventStartISO
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: general.name,
        description: general.description,
        startDate: general.eventStartISO,
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: {
          "@type": "VirtualLocation",
          url: siteConfig.siteUrl,
        },
        organizer: {
          "@type": "Organization",
          name: general.organiser,
          url: siteConfig.siteUrl,
        },
        url: siteConfig.siteUrl,
      }
    : null;

  const faqById = new Map(
    faqGroups.flatMap((group) =>
      group.items.map((item) => [item.id, item] as const),
    ),
  );

  const homeFaqItems = homeFaqIds.flatMap((id) => {
    const item = faqById.get(id);
    return item ? [item] : [];
  });

  const homeFaqGroup: FaqGroup = {
    id: "home-faq",
    title: "FAQ preview",
    items:
      homeFaqItems.length > 0
        ? homeFaqItems
        : faqGroups.flatMap((g) => g.items).slice(0, 4),
  };

  const byId = (id: string) => timeline.find((t) => t.id === id);
  const homeTimeline: TimelineItem[] = [
    byId("registration-opens"),
    byId("kickoff"),
    {
      id: "checkpoints",
      when: "T+12 / T+24 / T+36",
      clock: "22:00 / 10:00 / 22:00",
      event:
        "Checkpoints 1-3: progress and readiness notes, repository snapshots and a live video check-in with all members present",
      note: "Each missed checkpoint: -3 points",
      type: "checkpoint",
    },
    byId("hard-close"),
    byId("final-results"),
  ].filter((item): item is TimelineItem => Boolean(item));

  const missionThemes = tracks.flatMap((track) => track.themes);

  return (
    <>
      <Hero />

      <section
        className="relative overflow-hidden border-b border-border/70 bg-background-deep/40 py-4"
        aria-label="Indicative mission themes"
        data-hud="SPACEPORT GATE"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <span className="telemetry text-primary">Mission themes</span>
            <span
              className="hidden h-px w-8 bg-border sm:block"
              aria-hidden="true"
            />
          </div>
          <Marquee
            items={missionThemes}
            duration={62}
            className="min-w-0 flex-1"
          />
          <p className="telemetry hidden shrink-0 lg:block">
            Live briefs at T0
          </p>
          <p className="sr-only">{trackThemesNote}</p>
        </div>
      </section>

      <section
        className={pageContainer}
        aria-labelledby="stats-heading"
        data-hud="STATUS BOARD"
      >
        <SectionHeading
          id="stats-heading"
          eyebrow="Status board"
          title="Pre-launch status board"
          description="Two tracks, 48 hours and a final field of eight teams per track."
        />
        <SpotlightGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Reveal
              key={`${stat.label}-${index}`}
              delay={index * 70}
              className="h-full"
            >
              <StatCard {...stat} />
            </Reveal>
          ))}
        </SpotlightGroup>
      </section>

      <section
        className="border-y border-border bg-surface/60"
        aria-labelledby="guarantees-heading"
        data-hud="RANGE CHECKS"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            id="guarantees-heading"
            eyebrow="Range safety"
            title="Three range checks"
            description="The event is designed to keep problems sealed, work traceable and scores open to audit."
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {guarantees.map((guarantee, index) => (
              <Reveal
                as="li"
                key={`${guarantee.title}-${index}`}
                delay={index * 80}
                className="h-full"
              >
                <TiltCard spotlight className="h-full rounded-xl">
                  <Card className="h-full hover:border-border-strong">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-medium text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-muted">
                        Guarantee
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                      {guarantee.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {guarantee.description}
                    </p>
                  </Card>
                </TiltCard>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section
        className={pageContainer}
        aria-labelledby="tracks-heading"
        data-hud="LAUNCH PADS"
      >
        <SectionHeading
          id="tracks-heading"
          eyebrow="Launch pads"
          title="Two tracks, separate problem sets"
          description="Beginner teams get a guided build. Advanced teams get open-ended mission problems. Tracks never compete against each other."
        />
        <div className="mt-8">
          <TrackCards tracks={tracks} />
        </div>
        <p className="mt-6 text-sm leading-relaxed text-muted">
          {trackThemesNote}
        </p>
      </section>

      <section
        className="border-y border-border bg-surface/50"
        aria-labelledby="timeline-preview-heading"
        data-hud="LAUNCH SEQUENCE"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              id="timeline-preview-heading"
              eyebrow="Launch sequence"
              title="From registration to orbit"
              description={`Event dates: ${general.eventDatesLabel}. Key moments from the full schedule.`}
            />
            <Button3D href="/timeline" variant="secondary" size="sm">
              View full timeline
            </Button3D>
          </div>
          <div className="mt-10">
            <MiniTimeline items={homeTimeline} />
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            All times IST. Kickoff is scheduled for {general.eventDatesLabel} at 10:00 IST.
          </p>
        </div>
      </section>

      <section
        className={pageContainer}
        aria-labelledby="prizes-heading"
        data-hud="MISSION HONOURS"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            id="prizes-heading"
            eyebrow="Mission honours"
            title="Prizes and certificates"
            description="Awards for both tracks, chosen from the finalists."
          />
          <Button3D href="/prizes" variant="secondary" size="sm">
            See all prizes
          </Button3D>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {prizeTracks.map((track, index) => (
            <Reveal
              key={track.id}
              delay={index * 90}
              className="h-full"
            >
              <TiltCard spotlight className="h-full rounded-xl">
                <Card className="h-full hover:border-border-strong">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      tone={track.id === "beginner" ? "primary" : "accent"}
                    >
                      {track.name}
                    </Badge>
                    <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
                      Track honours
                    </span>
                  </div>
                  <ul className="mt-4 divide-y divide-border/70">
                    {track.awards.map((award, awardIndex) => (
                      <li
                        key={`${award.name}-${awardIndex}`}
                        className="flex items-start justify-between gap-4 py-3"
                      >
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-[0.6875rem] text-muted">
                            {String(awardIndex + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <p
                              className={cn(
                                "text-sm font-medium",
                                awardIndex === 0
                                  ? "text-primary"
                                  : "text-foreground",
                              )}
                            >
                              {award.name}
                            </p>
                            {award.note ? (
                              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                {award.note}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
                          {award.amount}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <SpotlightGroup className="mt-5 grid gap-3 sm:grid-cols-3">
          {prizeCertificates.map((certificate, index) => (
            <SpotlightTile
              key={`${certificate.name}-${index}`}
              className="corner-frame rounded-xl border border-border bg-surface/60 p-4"
            >
              <p className="text-sm font-medium text-foreground">
                {certificate.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {certificate.description}
              </p>
            </SpotlightTile>
          ))}
        </SpotlightGroup>
      </section>

      <section
        className="border-y border-border bg-surface"
        aria-labelledby="faq-preview-heading"
        data-hud="GROUND SUPPORT"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              id="faq-preview-heading"
              eyebrow="Ground support"
              title="A few things teams ask"
            />
            <Button3D href="/faq" variant="secondary" size="sm">
              Read all FAQs
            </Button3D>
          </div>
          <Reveal className="mt-8">
            <FaqList
              groups={[homeFaqGroup]}
              showGroupTitles={false}
            />
          </Reveal>
        </div>
      </section>

      <GantryDivider className="text-border-strong" />

      <SponsorsStrip />

      <section
        className="relative pb-16 pt-14 sm:pb-24 sm:pt-20"
        data-hud="FINAL CALL"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <BeamBorder className="rounded-2xl">
              <Frame className="rounded-2xl">
                <div className="hero-space relative overflow-hidden rounded-2xl border border-border px-6 py-14 text-center sm:px-12 sm:py-20">
                  <div
                    className="bg-mission-grid pointer-events-none absolute inset-0 opacity-30"
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <p className="telemetry text-primary">Final call</p>
                    <SplitHeading
                      as="h2"
                      text={general.finalCallHeading}
                      className="display-title text-h1 mx-auto mt-3 max-w-3xl text-balance text-foreground"
                    />
                    <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
                      {general.finalCallCopy}
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                      <Magnetic>
                        <Button3D
                          href="/register"
                          size="lg"
                          data-cursor="LAUNCH"
                        >
                          Register
                          <ArrowRightIcon className="size-4" />
                        </Button3D>
                      </Magnetic>
                      <Magnetic>
                        <Button3D
                          href="/rules"
                          size="lg"
                          variant="secondary"
                        >
                          Read the rules
                        </Button3D>
                      </Magnetic>
                    </div>
                    <p className="mt-6 text-sm text-muted">
                      Already exploring?{" "}
                      <Link
                        href="/tracks"
                        className="text-primary underline underline-offset-4"
                      >
                        Compare the tracks
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </Frame>
            </BeamBorder>
          </Reveal>
        </div>
      </section>
      {eventJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      ) : null}
    </>
  );
}

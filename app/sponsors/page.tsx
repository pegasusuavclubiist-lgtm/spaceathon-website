import type { Metadata } from "next";
import { Reveal } from "@/app/components/fx/Reveal";
import { SpotlightGroup } from "@/app/components/fx/SpotlightGroup";
import { SpotlightTile } from "@/app/components/fx/SpotlightTile";
import { TiltCard } from "@/app/components/fx/TiltCard";
import { Badge } from "@/app/components/ui/Badge";
import { BeamBorder } from "@/app/components/ui/BeamBorder";
import { Button3D } from "@/app/components/ui/Button3D";
import { Card } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { SectionHeading } from "@/app/components/ui/SectionHeading";
import { TBA } from "@/app/content/site-config";
import { getLiveSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Sponsors",
  description:
    "Official sponsors and space industry partners of Kosmodrome 2027, led by Kepler Aerospace.",
  alternates: { canonical: "/sponsors" },
};

const pageContainer =
  "mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8";

const keplerHighlights = [
  {
    eyebrow: "01 · Swarm ISR",
    title: "Autonomous Swarming Satellite Constellation",
    body: "Developing India's first six-satellite autonomous swarming Intelligence, Surveillance, and Reconnaissance (ISR) constellation under a $4M iDEX Prime contract with the Ministry of Defence and the Defence Space Agency, carrying electro-optical, thermal, and electronic-warfare payloads.",
  },
  {
    eyebrow: "02 · Ground & Ops",
    title: "Mission Operations & Ground Station as a Service",
    body: "Operates virtualized ground-segment infrastructure and Mission Operations as a Service (MOaaS), supplying components, satellite services, and ground-station support for ISRO's Space Based Surveillance-III (SBS-III) programme and Indian private space missions.",
  },
  {
    eyebrow: "03 · Flight Avionics",
    title: "Flight-Proven Satellite Subsystems",
    body: "Engineers indigenous space hardware including onboard computers, S-Band TxRx systems, MEMS IMU modules, reaction wheels, IRNSS-based GNSS receivers, and astronaut health monitoring avionics for ISRO's Gaganyaan human spaceflight programme.",
  },
  {
    eyebrow: "04 · Defence & Scale",
    title: "Indigenous Space Infrastructure",
    body: "Headquartered in Bengaluru and founded in July 2018 by former ISRO engineers Navneet Singh and Kiran V. Sharma, Kepler Aerospace raised an $8M seed round in September 2026 to scale persistent space-based ISR and avionics-as-a-service globally.",
  },
];

const keplerFacts = [
  { label: "Founded", value: "July 2018" },
  { label: "Headquarters", value: "Bengaluru, India" },
  { label: "Founders", value: "Navneet Singh & Kiran V. Sharma" },
  { label: "Focus", value: "Swarm ISR · GSaaS · Satellite Avionics" },
];

export default async function SponsorsPage() {
  const { general, sponsors } = await getLiveSiteContent();

  const otherSponsors = sponsors.filter(
    (s) => s.id !== "kepler-aerospace" && !s.name.toLowerCase().includes("kepler"),
  );

  return (
    <div className={pageContainer}>
      <PageHeader
        eyebrow="Mission partners"
        title="Sponsors & Industry Partners"
        description={`Kosmodrome ${general.year} (${general.eventDatesLabel}) is supported by space-tech leaders building India's orbital and ground-segment future.`}
      >
        <div className="flex flex-wrap gap-3">
          <Button3D href="/register" data-cursor="LAUNCH">
            Register your team
          </Button3D>
          <Button3D href="/contact" variant="secondary">
            Partner with us
          </Button3D>
        </div>
      </PageHeader>

      {/* Featured Sponsor: Kepler Aerospace */}
      <section className="mt-12" aria-labelledby="kepler-heading" data-hud="KEPLER AEROSPACE">
        <BeamBorder className="rounded-2xl">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--elev-2)] sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:items-center">
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white p-6 text-center shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logos/kepler-aerospace.png"
                  alt="Kepler Aerospace logo"
                  className="h-24 w-auto max-w-full object-contain"
                />
                <span className="mt-3 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-neutral-600">
                  Official Space Partner
                </span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">Official Space Partner</Badge>
                  <Badge tone="accent">Bengaluru · Est. 2018</Badge>
                </div>
                <h2
                  id="kepler-heading"
                  className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                >
                  Kepler Aerospace Private Limited
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                  Kepler Aerospace is a Bengaluru-based Indian space infrastructure and mission
                  operations company that designs and operates scalable space and ground systems
                  for sovereign, defence, and commercial satellite operators. Founded in July 2018
                  by Navneet Singh and Kiran V. Sharma, Kepler operates at the intersection of
                  autonomous satellite swarms, RF engineering, flight-proven satellite avionics,
                  and virtualized ground-station operations.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                  From delivering astronaut health monitoring avionics for ISRO&apos;s Gaganyaan
                  programme and supporting ISRO&apos;s 21-satellite SBS-III programme to building
                  India&apos;s first autonomous six-satellite ISR swarm constellation under the
                  Ministry of Defence&apos;s iDEX Prime initiative, Kepler Aerospace is helping
                  compress the path from orbital data to actionable intelligence.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <a
                    href="https://kepleraero.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-primary bg-primary-soft px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Visit kepleraero.com ↗
                  </a>
                </div>
              </div>
            </div>

            <dl className="mt-8 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-2 lg:grid-cols-4">
              {keplerFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-lg border border-border bg-background/70 p-3.5"
                >
                  <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </BeamBorder>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {keplerHighlights.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 70} className="h-full">
              <TiltCard spotlight className="h-full rounded-xl">
                <Card className="h-full hover:border-border-strong">
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-primary">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {item.body}
                  </p>
                </Card>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Additional Partners (CMS-editable from /admin) */}
      <section className="mt-16" aria-labelledby="partners-heading" data-hud="PARTNERS">
        <SectionHeading
          id="partners-heading"
          eyebrow="Ecosystem"
          title="Additional Partners"
          description="More industry, academic, and community partners supporting Kosmodrome 2027."
        />
        <SpotlightGroup className="mt-8 grid gap-4 sm:grid-cols-3">
          {otherSponsors.map((sponsor) => {
            const isTba = !sponsor.logoUrl && (!sponsor.name || sponsor.name === TBA);
            return (
              <SpotlightTile
                key={sponsor.id}
                className={
                  isTba
                    ? "flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/60 p-5 text-center"
                    : "flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-5 text-center"
                }
              >
                {sponsor.logoUrl ? (
                  <div className="rounded-md bg-white px-3 py-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sponsor.logoUrl}
                      alt={sponsor.name}
                      className="h-10 w-auto max-w-full object-contain"
                    />
                  </div>
                ) : null}
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted">
                  {sponsor.tier}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {sponsor.name || TBA}
                </span>
                {sponsor.websiteUrl ? (
                  <a
                    href={sponsor.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-4"
                  >
                    Visit website ↗
                  </a>
                ) : null}
              </SpotlightTile>
            );
          })}
        </SpotlightGroup>
      </section>

      {/* Become a sponsor CTA */}
      <section className="mt-16 rounded-2xl border border-border bg-surface p-6 text-center sm:p-10">
        <p className="telemetry text-primary">Collaborate with IIST</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Interested in sponsoring Kosmodrome {general.year}?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Partner with IIST&apos;s national space hackathon to mentor teams, host problem
          tracks, and connect with India&apos;s next generation of aerospace engineers.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button3D href="/contact">Contact the Organising Committee</Button3D>
          <Button3D href="/tracks" variant="secondary">
            Explore hackathon tracks
          </Button3D>
        </div>
      </section>
    </div>
  );
}

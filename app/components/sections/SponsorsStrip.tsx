"use client";

import Link from "next/link";
import { TBA } from "@/app/content/site-config";
import { useSiteContent } from "../content/SiteContentProvider";
import { SpotlightGroup } from "../fx/SpotlightGroup";
import { SpotlightTile } from "../fx/SpotlightTile";
import { Button3D } from "../ui/Button3D";
import { SectionHeading } from "../ui/SectionHeading";

export function SponsorsStrip() {
  const { sponsors } = useSiteContent();
  const named = sponsors
    .filter((s) => s.name && s.name !== TBA)
    .map((s) => s.name);

  return (
    <section
      aria-labelledby="sponsors-heading"
      className="border-y border-border bg-surface"
      data-hud="SUPPORT"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            id="sponsors-heading"
            eyebrow="Support"
            title="Sponsors"
            description={
              named.length > 0
                ? `Official space partner: ${named.join(", ")}. More partners: ${TBA}.`
                : `Partners: ${TBA}.`
            }
          />
          <Button3D href="/sponsors" variant="secondary" size="sm">
            Meet our sponsors
          </Button3D>
        </div>
        <SpotlightGroup className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sponsors.map((sponsor) => {
            const isTba = !sponsor.logoUrl && (!sponsor.name || sponsor.name === TBA);
            const inner = sponsor.logoUrl ? (
              <>
                <span className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sponsor.logoUrl}
                    alt={sponsor.name}
                    className="h-9 w-auto max-w-full object-contain"
                  />
                </span>
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
                  {sponsor.tier}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
                  {sponsor.tier}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {sponsor.name || TBA}
                </span>
              </>
            );

            return (
              <SpotlightTile
                as="li"
                key={sponsor.id}
                className={
                  isTba
                    ? "flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center"
                    : "flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-4 text-center"
                }
              >
                {!isTba ? (
                  <Link
                    href="/sponsors"
                    className="flex flex-col items-center justify-center gap-2"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </SpotlightTile>
            );
          })}
        </SpotlightGroup>
      </div>
    </section>
  );
}

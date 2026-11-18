import { TBA } from "@/app/content/site-config";
import { SpotlightGroup } from "../fx/SpotlightGroup";
import { SpotlightTile } from "../fx/SpotlightTile";
import { SectionHeading } from "../ui/SectionHeading";

export function SponsorsStrip() {
  return (
    <section
      aria-labelledby="sponsors-heading"
      className="border-y border-border bg-surface"
      data-hud="SUPPORT"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <SectionHeading
          id="sponsors-heading"
          eyebrow="Support"
          title="Sponsors"
          description={`Sponsors: Kepler. More partners: ${TBA}.`}
        />
        <SpotlightGroup className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SpotlightTile
            as="li"
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-4 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/Kepler_Logo.svg"
              alt="Kepler"
              className="h-9 w-auto"
            />
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
              Sponsor
            </span>
          </SpotlightTile>
          {["Partner", "Partner", "Partner"].map(
            (label, index) => (
              <SpotlightTile
                as="li"
                key={index}
                className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center"
              >
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted">
                  {label}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {TBA}
                </span>
              </SpotlightTile>
            ),
          )}
        </SpotlightGroup>
      </div>
    </section>
  );
}

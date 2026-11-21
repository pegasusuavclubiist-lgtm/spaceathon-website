import type { Metadata } from "next";
import { RegisterForm } from "@/app/components/sections/RegisterForm";
import { SpotlightGroup } from "@/app/components/fx/SpotlightGroup";
import { SpotlightTile } from "@/app/components/fx/SpotlightTile";
import { Badge } from "@/app/components/ui/Badge";
import { Button3D } from "@/app/components/ui/Button3D";
import { Callout } from "@/app/components/ui/Callout";
import { Frame } from "@/app/components/ui/Frame";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { SectionHeading } from "@/app/components/ui/SectionHeading";
import { TBA } from "@/app/content/site-config";
import { getLiveSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Register",
  description:
    "Kosmodrome 2027 registration: eligibility, UPI QR payment (₹299 IISTians / ₹499 outsiders), college ID upload, and OC confirmation.",
  alternates: {
    canonical: "/register",
  },
};

const pageContainer =
  "mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8";

export default async function RegisterPage() {
  const { general, registrationEligibility, registrationSteps } =
    await getLiveSiteContent();
  const isOpen = general.registrationOpen;
  const fee = general.registrationFee ?? TBA;

  return (
    <div className={pageContainer}>
      <PageHeader
        eyebrow="Crew manifest"
        title={isOpen ? "Register your team" : "Registration preview"}
        description={`Event dates: ${general.eventDatesLabel}. Check eligibility, upload college IDs, and complete UPI QR payment (₹${general.feeIist} IISTians / ₹${general.feeOutsider} outsiders).`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={isOpen ? "success" : "warning"}>
            {isOpen ? "Registration open" : "Registration not open yet"}
          </Badge>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
            Fee: {fee}
          </span>
          <Button3D href="/rules" variant="secondary" size="sm">
            Read the rules
          </Button3D>
        </div>
      </PageHeader>

      {!isOpen ? (
        <Frame className="mt-8 rounded-xl">
          <Callout title="Registration is currently closed" tone="warning">
            <p>
              Registration is currently paused by the Organising Committee.
              Check back soon or contact the OC.
            </p>
          </Callout>
        </Frame>
      ) : null}

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="eligibility-heading">
          <SectionHeading
            id="eligibility-heading"
            eyebrow="Eligibility"
            title="Before you apply"
            description="Every member must meet these requirements before the team can be locked."
          />
          <SpotlightGroup className="mt-6">
            <ul className="space-y-3">
              {registrationEligibility.map((item) => (
                <SpotlightTile
                  as="li"
                  key={item}
                  className="flex gap-3 rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-foreground"
                >
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </SpotlightTile>
              ))}
            </ul>
          </SpotlightGroup>
        </section>

        <section aria-labelledby="process-heading">
          <SectionHeading
            id="process-heading"
            eyebrow="Process"
            title="Steps to team confirmation"
            description="From UPI QR payment to OC verification and portal activation."
          />
          <SpotlightGroup className="mt-6">
            <ol className="space-y-3">
              {registrationSteps.map((step, index) => (
                <SpotlightTile
                  as="li"
                  key={step.title}
                  className="registration-step flex gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary bg-primary-soft font-mono text-sm text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {step.description}
                    </p>
                  </div>
                </SpotlightTile>
              ))}
            </ol>
          </SpotlightGroup>
        </section>
      </div>

      <section
        className="mt-16 scroll-mt-24"
        id="registration-form"
        aria-labelledby="registration-form-heading"
        data-hud="CREW MANIFEST"
      >
        <SectionHeading
          id="registration-form-heading"
          eyebrow="Registration form"
          title="Team registration & UPI payment"
          description="Submit team details, college IDs, and UPI QR payment UTR. Confirmation email is sent once the OC confirms your payment."
        />
        <div className="mt-8">
          <RegisterForm />
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button3D href="/tracks" variant="secondary">
          Compare tracks
        </Button3D>
        <Button3D href="/faq" variant="secondary">
          Read the FAQ
        </Button3D>
        <Button3D href="/contact" variant="secondary">
          Ask the OC
        </Button3D>
      </div>
    </div>
  );
}

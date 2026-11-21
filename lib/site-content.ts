import {
  about,
  benchmark,
  contactChannels,
  disqualifications,
  fairPlayCards,
  fairPlayThreats,
  faqGroups,
  finalScore,
  guarantees,
  homeFaqIds,
  judgingProcess,
  ocContactNotes,
  penalties,
  prizeCertificates,
  prizeConditions,
  prizeRules,
  prizeTracks,
  registrationEligibility,
  registrationSteps,
  ruleSections,
  scoringBands,
  scoringTabs,
  stats,
  submission,
  submissionChecklist,
  tieBreakers,
  timeline,
  trackRules,
  tracks,
  trackThemesNote,
} from "@/app/content/event-data";
import { brand, siteConfig, TBA } from "@/app/content/site-config";
import type {
  SiteContentBundle,
  SiteContentSectionKey,
  SponsorItem,
} from "@/app/content/site-content-types";
import { SITE_CONTENT_SECTIONS } from "@/app/content/site-content-types";
import { getConfig, isDatabaseConfigured } from "./config";
import { selectRows } from "./supabase";

export const DEFAULT_SPONSORS: SponsorItem[] = [
  {
    id: "kepler-aerospace",
    name: "Kepler Aerospace",
    tier: "Official Space Partner",
    logoUrl: "/logos/kepler-aerospace.png",
    websiteUrl: "https://kepleraero.com",
  },
  {
    id: "partner-1",
    name: TBA,
    tier: "Partner",
    logoUrl: null,
    websiteUrl: null,
  },
  {
    id: "partner-2",
    name: TBA,
    tier: "Partner",
    logoUrl: null,
    websiteUrl: null,
  },
  {
    id: "partner-3",
    name: TBA,
    tier: "Partner",
    logoUrl: null,
    websiteUrl: null,
  },
];

export function getDefaultSiteContent(): SiteContentBundle {
  return {
    general: {
      name: siteConfig.name,
      displayName: siteConfig.displayName,
      shortName: siteConfig.shortName,
      year: siteConfig.year,
      tagline: siteConfig.tagline,
      subtitle: siteConfig.subtitle,
      conceptLine: brand.conceptLine,
      organiser: siteConfig.organiser,
      factsLine: siteConfig.factsLine,
      description: siteConfig.description,
      eventStartISO: siteConfig.eventStartISO,
      eventDatesLabel: siteConfig.eventDatesLabel,
      registrationOpen: siteConfig.registrationOpen,
      registrationFee: siteConfig.registrationFee,
      feeIist: siteConfig.feeIist,
      feeOutsider: siteConfig.feeOutsider,
      upiId: siteConfig.upiId,
      upiPayeeName: siteConfig.upiPayeeName,
      paymentQrPath: siteConfig.paymentQrPath,
      contactEmail: siteConfig.contactEmail,
      portalUrl: siteConfig.portalUrl,
      announcementsUrl: siteConfig.announcementsUrl,
      clarificationsUrl: siteConfig.clarificationsUrl,
      rulebookUrl: siteConfig.rulebookUrl,
      heroFootnote:
        "Event dates: 17–18 January 2027 · Fee: ₹299 (IISTians) / ₹499 (Outsiders).",
      finalCallHeading: "Ready for liftoff?",
      finalCallCopy:
        "Kosmodrome 2027 launches on 17–18 January 2027. Registration fee: ₹299 for IISTians and ₹499 for outsiders via UPI QR.",
    },
    stats: structuredClone(stats),
    guarantees: structuredClone(guarantees),
    tracks: structuredClone(tracks),
    trackRules: [...trackRules],
    trackThemesNote,
    timeline: structuredClone(timeline),
    scoringTabs: structuredClone(scoringTabs),
    scoringBands: structuredClone(scoringBands),
    benchmark: structuredClone(benchmark),
    finalScore: structuredClone(finalScore),
    judgingProcess: [...judgingProcess],
    penalties: structuredClone(penalties),
    tieBreakers: [...tieBreakers],
    disqualifications: [...disqualifications],
    ruleSections: structuredClone(ruleSections),
    submission: structuredClone(submission),
    submissionChecklist: structuredClone(submissionChecklist),
    prizeTracks: structuredClone(prizeTracks),
    prizeCertificates: structuredClone(prizeCertificates),
    prizeConditions: [...prizeConditions],
    prizeRules: [...prizeRules],
    faqGroups: structuredClone(faqGroups),
    homeFaqIds: [...homeFaqIds],
    registrationSteps: structuredClone(registrationSteps),
    registrationEligibility: [...registrationEligibility],
    about: structuredClone(about),
    fairPlayCards: structuredClone(fairPlayCards),
    fairPlayThreats: structuredClone(fairPlayThreats),
    sponsors: structuredClone(DEFAULT_SPONSORS),
    contactChannels: structuredClone(contactChannels),
    ocContactNotes: structuredClone(ocContactNotes),
  };
}

export async function getLiveSiteContent(): Promise<SiteContentBundle> {
  const defaults = getDefaultSiteContent();
  if (!isDatabaseConfigured(getConfig())) return defaults;

  try {
    const { rows } = await selectRows<{
      section: string;
      data: unknown;
    }>("site_content", {
      select: "section,data",
    });

    const merged = { ...defaults } as Record<string, unknown>;
    const valid = new Set<string>(SITE_CONTENT_SECTIONS);

    for (const row of rows) {
      if (!valid.has(row.section) || row.data == null) continue;
      if (row.section === "general" && typeof row.data === "object" && !Array.isArray(row.data)) {
        merged.general = {
          ...defaults.general,
          ...(row.data as Record<string, unknown>),
        };
      } else {
        merged[row.section] = row.data;
      }
    }

    return merged as unknown as SiteContentBundle;
  } catch {
    return defaults;
  }
}

export function isValidSection(section: string): section is SiteContentSectionKey {
  return (SITE_CONTENT_SECTIONS as readonly string[]).includes(section);
}

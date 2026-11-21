import type {
  ChecklistItem,
  ContactChannel,
  FairPlayCard,
  FaqGroup,
  Guarantee,
  Penalty,
  PrizeTrack,
  ProcessStep,
  RegistrationStep,
  RuleSection,
  ScoringBand,
  ScoringTab,
  Stat,
  SubmissionRequirement,
  ThreatControl,
  TimelineItem,
  Track,
} from "./event-data";

export interface SponsorItem {
  id: string;
  name: string;
  tier: string;
  logoUrl: string | null;
  websiteUrl: string | null;
}

export interface SiteGeneralSettings {
  name: string;
  displayName: string;
  shortName: string;
  year: number;
  tagline: string;
  subtitle: string;
  conceptLine: string;
  organiser: string;
  factsLine: string;
  description: string;
  eventStartISO: string | null;
  eventDatesLabel: string;
  registrationOpen: boolean;
  registrationFee: string | null;
  feeIist: number;
  feeOutsider: number;
  upiId: string;
  upiPayeeName: string;
  paymentQrPath: string;
  contactEmail: string | null;
  portalUrl: string | null;
  announcementsUrl: string | null;
  clarificationsUrl: string | null;
  rulebookUrl: string | null;
  heroFootnote: string;
  finalCallHeading: string;
  finalCallCopy: string;
}

export interface SiteContentBundle {
  general: SiteGeneralSettings;
  stats: Stat[];
  guarantees: Guarantee[];
  tracks: Track[];
  trackRules: string[];
  trackThemesNote: string;
  timeline: TimelineItem[];
  scoringTabs: ScoringTab[];
  scoringBands: ScoringBand[];
  benchmark: { title: string; formula: string; notes: string[] };
  finalScore: { title: string; top8: string; rest: string };
  judgingProcess: string[];
  penalties: Penalty[];
  tieBreakers: string[];
  disqualifications: string[];
  ruleSections: RuleSection[];
  submission: {
    window: string;
    blindJudging: string;
    missingItem: string;
    grace: string;
    comparison: SubmissionRequirement[];
  };
  submissionChecklist: ChecklistItem[];
  prizeTracks: PrizeTrack[];
  prizeCertificates: Array<{ name: string; description: string }>;
  prizeConditions: string[];
  prizeRules: string[];
  faqGroups: FaqGroup[];
  homeFaqIds: string[];
  registrationSteps: RegistrationStep[];
  registrationEligibility: string[];
  about: {
    intro: string[];
    organiser: string;
    whoCanJoin: string[];
    process: ProcessStep[];
  };
  fairPlayCards: FairPlayCard[];
  fairPlayThreats: ThreatControl[];
  sponsors: SponsorItem[];
  contactChannels: ContactChannel[];
  ocContactNotes: Array<{ title: string; body: string }>;
}

export type SiteContentSectionKey = keyof SiteContentBundle;

export const SITE_CONTENT_SECTIONS: readonly SiteContentSectionKey[] = [
  "general",
  "stats",
  "guarantees",
  "tracks",
  "trackRules",
  "trackThemesNote",
  "timeline",
  "scoringTabs",
  "scoringBands",
  "benchmark",
  "finalScore",
  "judgingProcess",
  "penalties",
  "tieBreakers",
  "disqualifications",
  "ruleSections",
  "submission",
  "submissionChecklist",
  "prizeTracks",
  "prizeCertificates",
  "prizeConditions",
  "prizeRules",
  "faqGroups",
  "homeFaqIds",
  "registrationSteps",
  "registrationEligibility",
  "about",
  "fairPlayCards",
  "fairPlayThreats",
  "sponsors",
  "contactChannels",
  "ocContactNotes",
] as const;

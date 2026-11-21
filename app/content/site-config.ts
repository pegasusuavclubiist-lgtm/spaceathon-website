export const TBA = "To be announced";

export const brand = {
  name: "Kosmodrome",
  displayName: "KOSMODROME",
  shortName: "Kosmodrome",
  year: 2027,
  tagline: "48 Hours to Orbit",
  subtitle: "IIST National Space Hackathon",
  conceptLine:
    "A kosmodrome is a spaceport: the place every mission starts. Kosmodrome is where your idea leaves the pad.",
  watermark: "КОСМОДРОМ",
  organiser: "Indian Institute of Space Science and Technology (IIST)",
} as const;

export interface NavLink {
  label: string;
  href: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export const siteConfig = {
  name: `${brand.name} ${brand.year}`,
  displayName: brand.displayName,
  shortName: brand.shortName,
  year: brand.year,
  tagline: brand.tagline,
  subtitle: brand.subtitle,
  organiser: brand.organiser,
  factsLine:
    "National level | 17–18 January 2027 | 48 hours | Beginner and Advanced tracks",
  description:
    "Kosmodrome 2027: 48 Hours to Orbit is the IIST National Space Hackathon — taking place on 17–18 January 2027 with Beginner and Advanced tracks.",

  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000",

  eventStartISO: "2027-01-17T10:00:00+05:30" as string | null,
  eventDatesLabel: "17–18 January 2027",
  registrationOpen: true,

  registrationFee: "₹299 (IISTians) / ₹499 (Outsiders)" as string | null,
  feeIist: 299,
  feeOutsider: 499,
  upiId: "90323601@ubin",
  upiPayeeName: "VEDENDRA VARDHAN",
  paymentQrPath: "/payment-qr.jpeg",

  contactEmail: null as string | null,
  portalUrl: "/portal" as string | null,
  announcementsUrl: null as string | null,
  clarificationsUrl: null as string | null,
  rulebookUrl: null as string | null,

  navLinks: [
    { label: "About", href: "/about" },
    { label: "Tracks", href: "/tracks" },
    { label: "Timeline", href: "/timeline" },
    { label: "Scoring", href: "/scoring" },
    { label: "Rules", href: "/rules" },
    { label: "Submission", href: "/submission" },
    { label: "Fair play", href: "/fair-play" },
    { label: "Prizes", href: "/prizes" },
    { label: "Sponsors", href: "/sponsors" },
    { label: "FAQ", href: "/faq" },
    { label: "Contact", href: "/contact" },
  ] satisfies NavLink[],

  registerCta: { label: "Register", href: "/register" } satisfies NavLink,

  primaryNavLinks: [
    { label: "Tracks", href: "/tracks" },
    { label: "Timeline", href: "/timeline" },
    { label: "Scoring", href: "/scoring" },
    { label: "Rules", href: "/rules" },
    { label: "Prizes", href: "/prizes" },
    { label: "Sponsors", href: "/sponsors" },
  ] satisfies NavLink[],

  moreNavLinks: [
    { label: "About", href: "/about" },
    { label: "Submission", href: "/submission" },
    { label: "Fair play", href: "/fair-play" },
    { label: "FAQ", href: "/faq" },
    { label: "Team portal", href: "/portal" },
    { label: "Judging portal", href: "/judge" },
    { label: "Admin portal", href: "/admin" },
    { label: "Contact", href: "/contact" },
  ] satisfies NavLink[],

  footerGroups: [
    {
      title: "Explore",
      links: [
        { label: "About", href: "/about" },
        { label: "Tracks", href: "/tracks" },
        { label: "Timeline", href: "/timeline" },
        { label: "Scoring", href: "/scoring" },
        { label: "Sponsors", href: "/sponsors" },
      ],
    },
    {
      title: "Participate",
      links: [
        { label: "Rules", href: "/rules" },
        { label: "Submission", href: "/submission" },
        { label: "Fair play", href: "/fair-play" },
        { label: "Register", href: "/register" },
        { label: "Team portal", href: "/portal" },
      ],
    },
    {
      title: "Portals & More",
      links: [
        { label: "Prizes", href: "/prizes" },
        { label: "FAQ", href: "/faq" },
        { label: "Contact", href: "/contact" },
        { label: "Judging portal", href: "/judge" },
        { label: "Admin portal", href: "/admin" },
      ],
    },
  ] satisfies NavGroup[],
};

export type SiteConfig = typeof siteConfig;

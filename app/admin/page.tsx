import type { Metadata } from "next";
import { AdminPortalApp } from "@/app/components/admin/AdminPortalApp";
import { PageHeader } from "@/app/components/ui/PageHeader";

export const metadata: Metadata = {
  title: "Admin Portal",
  description:
    "Kosmodrome 2027 Admin Mission Control: edit all website content, verify UPI QR payments, send confirmation emails, manage judges, and inspect AI usage.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <PageHeader
        eyebrow="Mission control"
        title="Admin Portal"
        description="Edit every section of the main website live, confirm UPI QR payments before sending confirmation emails, manage judges, and monitor AI usage."
      />
      <div className="mt-10">
        <AdminPortalApp />
      </div>
    </div>
  );
}

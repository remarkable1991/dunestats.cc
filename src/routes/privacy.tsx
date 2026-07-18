import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Strategy Arena" },
      { name: "description", content: "Privacy Policy for Strategy Arena." },
      { property: "og:title", content: "Privacy Policy — Strategy Arena" },
      { property: "og:description", content: "Privacy Policy for Strategy Arena." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sand/40 bg-sand/10 px-3 py-1 text-xs uppercase tracking-widest text-sand">
              <Shield className="size-3.5" /> Legal
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Privacy Policy
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: July 18, 2026
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/70 backdrop-blur p-6 sm:p-8 shadow-arena">
            <div className="prose prose-invert prose-sm max-w-none text-muted-foreground">
              <p>
                At Strategy Arena, we respect your privacy and are committed to protecting any information you share with us.
              </p>
              <p>
                This Privacy Policy explains how we collect, use, and safeguard your personal information when you use our website and services.
              </p>

              {/* PLACEHOLDER: Paste your legal text below this line */}
              <div className="space-y-6 text-muted-foreground whitespace-pre-wrap">
                <h2 className="text-xl font-bold text-foreground mt-8">Privacy Policy for Strategy Arena</h2>

                <p>
                  <strong>Effective Date:</strong> July 1, 2026
                </p>

                <p>
                  At Strategy Arena (dunestats.cc), we value your privacy. This policy outlines how we collect, use, and protect your information.
                </p>

                <h3 className="text-lg font-bold text-foreground mt-6">1. Information We Collect</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Account Data:</strong> When you sign in via Discord or email, we collect your basic profile information (such as your User ID and username) to manage your account and track your leaderboard statistics.</li>
                  <li><strong>Uploaded Content:</strong> When you upload match screenshots, these images are stored in our secure cloud storage bucket to parse game results.</li>
                  <li><strong>Game Statistics:</strong> We record player names, leader choices, match placements, points, and ELO history associated with submitted games.</li>
                </ul>

                <h3 className="text-lg font-bold text-foreground mt-6">2. How We Use Your Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>To maintain the global leaderboard and calculate accurate tournament/casual ELO ratings.</li>
                  <li>To verify match validity and prevent duplicate submissions.</li>
                  <li>To display game histories publicly on the platform.</li>
                </ul>

                <h3 className="text-lg font-bold text-foreground mt-6">3. Data Storage & Security</h3>
                <p>
                  Your data is securely hosted using Supabase. Uploaded screenshots are protected and accessible via signed URLs. We do not sell or share your personal data with third-party advertisers.
                </p>

                <h3 className="text-lg font-bold text-foreground mt-6">4. Your Rights</h3>
                <p>
                  You can request the deletion of your account or uploaded match data at any time by contacting the administrator via our Discord community.
                </p>
              </div>
              {/* PLACEHOLDER: Paste your legal text above this line */}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Strategy Arena" },
      { name: "description", content: "Terms of Service for Strategy Arena." },
      { property: "og:title", content: "Terms of Service — Strategy Arena" },
      { property: "og:description", content: "Terms of Service for Strategy Arena." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sand/40 bg-sand/10 px-3 py-1 text-xs uppercase tracking-widest text-sand">
              <FileText className="size-3.5" /> Legal
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Terms of Service
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: July 18, 2026
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/70 backdrop-blur p-6 sm:p-8 shadow-arena">
            <div className="prose prose-invert prose-sm max-w-none text-muted-foreground">
              <p>
                Welcome to Strategy Arena. These Terms of Service govern your use of the website and services provided by Strategy Arena.
              </p>
              <p>
                By accessing or using Strategy Arena, you agree to be bound by these terms. If you do not agree, please do not use the site.
              </p>

              {/* PLACEHOLDER: Paste your legal text below this line */}
              <div className="space-y-6 text-muted-foreground whitespace-pre-wrap">
                <h2 className="text-xl font-bold text-foreground mt-8">Terms of Service for Strategy Arena</h2>

                <p>
                  <strong>Effective Date:</strong> July 1, 2026
                </p>

                <p>
                  Welcome to Strategy Arena (dunestats.cc). By accessing or uploading data to our platform, you agree to comply with the following terms.
                </p>

                <h3 className="text-lg font-bold text-foreground mt-6">1. Acceptable Use</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You agree to only upload valid, unaltered screenshots of your completed Dune: Imperium Digital matches.</li>
                  <li>Submitting fraudulent data, manipulating points, or intentionally engineering duplicate matches to spoof ELO tracking is strictly prohibited.</li>
                </ul>

                <h3 className="text-lg font-bold text-foreground mt-6">2. User-Generated Content</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>By uploading a match screenshot, you grant Strategy Arena a non-exclusive, royalty-free license to store, process, and display the match data publicly on our leaderboards.</li>
                  <li>You are responsible for ensuring that your uploaded content does not violate anyone else's privacy or rights.</li>
                </ul>

                <h3 className="text-lg font-bold text-foreground mt-6">3. Tournament Data</h3>
                <p>
                  Tournament match placements and schedules are synchronized with our official systems. The platform reserves the right to strip tournament tags or adjust ELO anomalies resulting from false-flag match detections.
                </p>

                <h3 className="text-lg font-bold text-foreground mt-6">4. Limitation of Liability</h3>
                <p>
                  Strategy Arena is provided "as is" for hobby and community tracking purposes. We are not responsible for any temporary data loss, leaderboard inaccuracies, or service interruptions.
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

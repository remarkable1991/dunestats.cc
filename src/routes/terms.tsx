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
              <div className="my-8 rounded-lg border-2 border-dashed border-border/40 bg-background/50 p-6 text-center">
                <p className="text-foreground font-medium">[Your Terms of Service text goes here]</p>
                <p className="mt-2">
                  Replace this placeholder section with the full legal text for your Terms of Service.
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

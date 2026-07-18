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
              <div className="my-8 rounded-lg border-2 border-dashed border-border/40 bg-background/50 p-6 text-center">
                <p className="text-foreground font-medium">[Your Privacy Policy text goes here]</p>
                <p className="mt-2">
                  Replace this placeholder section with the full legal text for your Privacy Policy.
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

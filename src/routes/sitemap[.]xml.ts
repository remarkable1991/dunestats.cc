import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { ALL_LEADERS } from "@/lib/leader-slug";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://dunestats.cc";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/leaderboard", changefreq: "daily", priority: "0.9" },
          { path: "/matches", changefreq: "daily", priority: "0.9" },
          { path: "/stats", changefreq: "daily", priority: "0.8" },
          { path: "/tournament", changefreq: "daily", priority: "0.8" },
          { path: "/rewards", changefreq: "daily", priority: "0.7" },
          { path: "/tournament-register", changefreq: "weekly", priority: "0.6" },
          { path: "/upload", changefreq: "monthly", priority: "0.6" },
          { path: "/claim", changefreq: "monthly", priority: "0.5" },
          { path: "/auth", changefreq: "monthly", priority: "0.4" },
          { path: "/forgot-password", changefreq: "yearly", priority: "0.2" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
        ];

        for (const l of ALL_LEADERS) {
          entries.push({
            path: `/leaders/${l.origin}/${l.slug}`,
            changefreq: "weekly",
            priority: "0.6",
          });
        }

        try {
          const { data } = await supabase
            .from("player_ratings")
            .select("player_key")
            .order("games_played", { ascending: false })
            .limit(2000);
          const seen = new Set<string>();
          for (const row of data ?? []) {
            const key = (row as { player_key: string }).player_key;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            entries.push({
              path: `/players/${encodeURIComponent(key)}`,
              changefreq: "weekly",
              priority: "0.5",
            });
          }
        } catch {
          // player list is optional — keep the static sitemap valid
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

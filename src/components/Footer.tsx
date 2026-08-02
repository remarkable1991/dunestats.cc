import { Link } from "@tanstack/react-router";
import { Instagram, Facebook } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
        <span>Strategy Arena · Where great minds compete · Fan-made tracker, not affiliated with Dire Wolf Digital.</span>
        <div className="flex items-center gap-4">
          <a
            href="https://www.instagram.com/strategycommunity/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
            aria-label="Instagram"
          >
            <Instagram className="size-4" />
          </a>
          <a
            href="https://www.facebook.com/StrategyArena/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
            aria-label="Facebook"
          >
            <Facebook className="size-4" />
          </a>
          <a
            href="https://discord.gg/XuvUmtcSDQ"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
            aria-label="Discord"
          >
            Discord
          </a>
          <span className="opacity-30">|</span>
          <Link
            to="/terms"
            className="hover:text-foreground transition-colors"
            activeProps={{ className: "text-foreground" }}
          >
            Terms of Service
          </Link>
          <span className="opacity-30">|</span>
          <Link
            to="/privacy"
            className="hover:text-foreground transition-colors"
            activeProps={{ className: "text-foreground" }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}


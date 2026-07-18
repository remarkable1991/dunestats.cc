import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <span>Strategy Arena · Where great minds compete · Fan-made tracker, not affiliated with Dire Wolf Digital.</span>
        <div className="flex items-center gap-4">
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

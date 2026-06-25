import logoAsset from "@/assets/logo.png.asset.json";
import { Link } from "@tanstack/react-router";

export function Logo({ size = 40, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      <img
        src={logoAsset.url}
        alt="Strategy Arena"
        width={size}
        height={size}
        className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-105"
      />
      {withText && (
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="font-display text-lg font-bold tracking-wider text-foreground">
            STRATEGY <span className="text-coral">A</span><span className="text-teal">RENA</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-sand">Where great minds compete</span>
        </div>
      )}
    </Link>
  );
}

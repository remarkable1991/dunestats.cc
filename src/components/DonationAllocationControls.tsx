import { Coffee, Trophy, Wrench } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  formatDonationMoney,
  rebalanceDonationAllocation,
  type DonationAllocation,
  type DonationCurrency,
} from "@/lib/donations";

const CATEGORIES = [
  {
    key: "tournament" as const,
    title: "Tournament & season rewards",
    description: "Cash prizes, physical rewards and community tournament financing.",
    icon: Trophy,
    color: "text-primary",
  },
  {
    key: "maintenance" as const,
    title: "Maintenance & development",
    description: "Hosting, domains, servers and improvements to the tracker and bot.",
    icon: Wrench,
    color: "text-teal",
  },
  {
    key: "developer" as const,
    title: "Developer coffee & board games",
    description: "A personal thank-you for the developer, for private appreciation.",
    icon: Coffee,
    color: "text-coral",
  },
];

export function DonationAllocationControls({
  amount,
  currency,
  value,
  onChange,
}: {
  amount: number;
  currency: DonationCurrency;
  value: DonationAllocation;
  onChange: (value: DonationAllocation) => void;
}) {
  return (
    <div className="space-y-5">
      {CATEGORIES.map(({ key, title, description, icon: Icon, color }) => (
        <div key={key} className="space-y-3 rounded-lg border border-border/50 bg-background/35 p-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 ${color}`}><Icon className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor={`allocation-${key}`} className="text-sm font-medium text-foreground">{title}</label>
                <span className={`font-display text-lg tabular-nums ${color}`}>{value[key]}%</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              id={`allocation-${key}`}
              aria-label={title}
              min={0}
              max={100}
              step={1}
              value={[value[key]]}
              onValueChange={([next]) => onChange(rebalanceDonationAllocation(value, key, next))}
            />
            <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
              {formatDonationMoney((amount * value[key]) / 100, currency)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-right text-xs text-muted-foreground">Always balanced to <span className="text-foreground">100%</span></p>
    </div>
  );
}

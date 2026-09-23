import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Settings } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";

/** Links to the tournament admin area, for admins, tournament hosts and tournament moderators. */
export function AdminTournamentsLink() {
  const { isTournamentHost, isTournamentModerator } = useRoles();

  if (isTournamentHost) {
    return (
      <Button asChild variant="outline" size="sm" className="gap-1 border-sand/50 text-sand hover:bg-sand/10">
        <Link to="/admin/tournaments">
          <Settings className="size-4" /> Manage tournaments
        </Link>
      </Button>
    );
  }

  if (isTournamentModerator) {
    return (
      <Button asChild variant="outline" size="sm" className="gap-1 border-sand/50 text-sand hover:bg-sand/10">
        <Link to="/admin/match-approvals">
          <ClipboardCheck className="size-4" /> Match approvals
        </Link>
      </Button>
    );
  }

  return null;
}

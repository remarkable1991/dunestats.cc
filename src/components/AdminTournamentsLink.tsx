import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Settings, UserCog } from "lucide-react";
import { useRoles } from "@/hooks/use-roles";

/** Links to the tournament admin area, for admins, tournament hosts and tournament moderators. */
export function AdminTournamentsLink() {
  const { isTournamentHost, isTournamentModerator, isAdmin } = useRoles();

  if (isTournamentHost) {
    return (
      <span className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1 border-sand/50 text-sand hover:bg-sand/10">
          <Link to="/admin/tournaments">
            <Settings className="size-4" /> Manage tournaments
          </Link>
        </Button>
        {isAdmin && (
          <Button asChild variant="outline" size="sm" className="gap-1 border-sand/50 text-sand hover:bg-sand/10">
            <Link to="/admin/players">
              <UserCog className="size-4" /> Player names
            </Link>
          </Button>
        )}
      </span>
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

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Renders a link to the tournament admin page, only for admins. */
export function AdminTournamentsLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setIsAdmin((data ?? []).some((r) => r.role === "admin"));
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isAdmin) return null;

  return (
    <Button asChild variant="outline" size="sm" className="gap-1 border-sand/50 text-sand hover:bg-sand/10">
      <Link to="/admin/tournaments">
        <Settings className="size-4" /> Manage tournaments
      </Link>
    </Button>
  );
}

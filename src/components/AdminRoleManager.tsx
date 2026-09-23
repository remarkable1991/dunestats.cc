import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";

const ASSIGNABLE = [
  { key: "admin", label: "Main admin", hint: "Full access to everything" },
  { key: "tournament_host", label: "Tournament host", hint: "Create and edit tournaments, send tournament emails" },
  { key: "tournament_moderator", label: "Tournament moderator", hint: "Approve or reject tournament match submissions" },
  { key: "match_moderator", label: "Match moderator", hint: "Edit any match and mark matches as manually verified" },
  { key: "lfg_admin", label: "LFG admin", hint: "Manage any matchmaking lobby" },
] as const;

/** Main-admin-only panel to grant or remove roles for a player's account. */
export function AdminRoleManager({ userId, displayName }: { userId: string | null; displayName: string }) {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("admin_list_user_roles", { p_user_id: userId });
      if (cancelled) return;
      if (error) toast.error(error.message);
      setRoles((data as string[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userId]);

  if (rolesLoading || !isAdmin) return null;

  const toggle = async (role: string, enabled: boolean) => {
    if (!userId) return;
    setBusy(role);
    const { data, error } = await supabase.rpc("admin_set_user_role", {
      p_user_id: userId,
      p_role: role,
      p_enabled: enabled,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next = (data as { roles?: string[] } | null)?.roles ?? [];
    setRoles(next);
    toast.success(enabled ? "Role granted" : "Role removed");
  };

  return (
    <Card className="mb-8 p-4 border-sand/40">
      <h2 className="font-display text-lg mb-1 flex items-center gap-2">
        <ShieldCheck className="size-5 text-sand" /> Roles
      </h2>
      {!userId ? (
        <p className="text-sm text-muted-foreground">
          {displayName} has not linked an account yet. Roles can be given once they claim this name on the site.
        </p>
      ) : loading ? (
        <div className="py-3 flex justify-center">
          <Loader2 className="size-4 animate-spin text-sand" />
        </div>
      ) : (
        <div className="space-y-3 mt-2">
          {ASSIGNABLE.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.hint}</div>
              </div>
              <Switch
                checked={roles.includes(r.key)}
                disabled={busy === r.key}
                onCheckedChange={(v) => void toggle(r.key, v)}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

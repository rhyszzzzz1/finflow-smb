import { Badge } from "@/components/ui/badge";

const classes: Record<string, string> = {
  invited: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  blocked: "bg-red-100 text-red-700 border-red-200",
  inactive: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

export const RelationshipStatusBadge = ({ status }: { status?: string | null }) => {
  const normalized = String(status || "unknown").toLowerCase();
  return (
    <Badge variant="outline" className={classes[normalized] || "bg-slate-100 text-slate-700 border-slate-200"}>
      {normalized.replaceAll("_", " ")}
    </Badge>
  );
};

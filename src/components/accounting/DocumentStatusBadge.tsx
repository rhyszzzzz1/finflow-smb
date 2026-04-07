import { Badge } from "@/components/ui/badge";

type Props = {
  status?: string | null;
};

const toneMap: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  approved: "bg-cyan-100 text-cyan-700 border-cyan-200",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  posted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  partially_paid: "bg-violet-100 text-violet-700 border-violet-200",
  partially_invoiced: "bg-violet-100 text-violet-700 border-violet-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  void: "bg-zinc-200 text-zinc-700 border-zinc-300",
  converted: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const labelize = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const DocumentStatusBadge = ({ status }: Props) => {
  const normalized = String(status || "unknown").toLowerCase();
  return (
    <Badge variant="outline" className={toneMap[normalized] || "bg-slate-100 text-slate-700 border-slate-200"}>
      {labelize(normalized)}
    </Badge>
  );
};

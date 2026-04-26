import { cn } from "@/lib/utils";
import type { ReportSectionKey } from "./reportTypes";

type NavItem = { key: ReportSectionKey; title: string; description: string };

const items: NavItem[] = [
  { key: "financial_statements", title: "Financial statements", description: "Trial balance, P&L, balance sheet" },
  { key: "subledger", title: "Subledger reports", description: "AR/AP aging, customer/vendor statements" },
  { key: "inventory", title: "Inventory reports", description: "Stock summary, stock ledger" },
  { key: "reconciliations", title: "Reconciliations", description: "Control accounts and variance drilldowns" },
];

type Props = {
  active: ReportSectionKey;
  onChange: (next: ReportSectionKey) => void;
};

export function ReportSectionNav({ active, onChange }: Props) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            "w-full text-left rounded-md border px-3 py-2 transition-colors",
            active === item.key ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted/50"
          )}
        >
          <div className="font-semibold text-sm text-foreground">{item.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
        </button>
      ))}
    </div>
  );
}


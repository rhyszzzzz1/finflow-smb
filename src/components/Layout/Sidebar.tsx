import { NavLink } from "@/components/NavLink";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Handshake,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";

const menuSections = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    ],
  },
  {
    title: "Sales",
    items: [
      { icon: FileText, label: "Quotes", path: "/sales/quotes" },
      { icon: FileText, label: "Orders", path: "/sales/orders" },
      { icon: Users, label: "Invoices", path: "/sales/invoices" },
      { icon: CheckCircle2, label: "Credit Notes", path: "/sales/credit-notes" },
    ],
  },
  {
    title: "Procurement",
    items: [
      { icon: ShoppingCart, label: "Purchase Orders", path: "/procurement/orders" },
      { icon: Package, label: "Goods Receipts", path: "/procurement/receipts" },
      { icon: Building2, label: "Purchase Bills", path: "/procurement/bills" },
      { icon: CheckCircle2, label: "Debit Notes", path: "/procurement/debit-notes" },
    ],
  },
  {
    title: "Operations",
    items: [
      { icon: Package, label: "Inventory", path: "/inventory" },
      { icon: CreditCard, label: "Settlements", path: "/settlements" },
      { icon: Handshake, label: "Relationships", path: "/relationships" },
      { icon: BarChart3, label: "Reports", path: "/reports" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

export const Sidebar = () => {
  return (
    <aside className="w-64 bg-card border-r border-border flex-shrink-0 h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold text-primary">FinTrac</h1>
        <p className="text-xs text-muted-foreground mt-1">Cloud Accounting for SMEs</p>
      </div>
      
      <nav className="p-4 space-y-5">
        {menuSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              {section.title}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-foreground/70 hover:bg-secondary/50 hover:text-foreground transition-all duration-200"
                  activeClassName="bg-primary/10 text-primary hover:bg-primary/15"
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card">
        <p className="text-xs text-muted-foreground text-center">
          Final Year Project, 2025
        </p>
      </div>
    </aside>
  );
};

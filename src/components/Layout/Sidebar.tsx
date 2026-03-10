import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Package, FileText, CreditCard, BarChart3, Settings, Users } from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Package, label: "Inventory", path: "/inventory" },
  { icon: FileText, label: "Billing", path: "/billing" },
  { icon: CreditCard, label: "Receivables / Payables", path: "/receivables" },
  { icon: Users, label: "Clients & Vendors", path: "/clients" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const Sidebar = () => {
  return (
    <aside className="w-64 bg-card border-r border-border flex-shrink-0 h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold text-primary">FinTrac</h1>
        <p className="text-xs text-muted-foreground mt-1">Cloud Accounting for SMEs</p>
      </div>
      
      <nav className="p-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-foreground/70 hover:bg-secondary/50 hover:text-foreground transition-all duration-200"
            activeClassName="bg-primary/10 text-primary hover:bg-primary/15"
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
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

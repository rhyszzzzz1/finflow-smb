import { Card } from "@/components/ui/card";
import { 
  LayoutDashboard, Package, FileText, CreditCard, Users, BarChart3, 
  Settings, LogIn, UserPlus, Shield, Upload, Search, Plus, Download,
  Edit, Trash2, Eye, Check, X, ChevronRight
} from "lucide-react";

const WireframeBox = ({ 
  label, 
  className = "", 
  icon: Icon 
}: { 
  label: string; 
  className?: string;
  icon?: React.ElementType;
}) => (
  <div className={`border-2 border-dashed border-muted-foreground/40 rounded px-2 py-1.5 text-[10px] text-muted-foreground flex items-center justify-center gap-1 ${className}`}>
    {Icon && <Icon className="w-3 h-3" />}
    <span>{label}</span>
  </div>
);

const PageWireframe = ({ 
  title, 
  route,
  icon: Icon,
  children 
}: { 
  title: string; 
  route: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) => (
  <Card className="p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-[10px] text-muted-foreground font-mono">{route}</span>
      </div>
    </div>
    <div className="bg-muted/30 rounded-lg p-3 min-h-[280px] border border-border/50">
      {children}
    </div>
  </Card>
);

const Wireframes = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">FinTrac Wireframes</h1>
        <p className="text-muted-foreground">Detailed layout structure of all major pages in the application</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Login */}
        <PageWireframe title="Login" route="/login" icon={LogIn}>
          <div className="flex flex-col items-center justify-center h-full gap-3 max-w-[200px] mx-auto">
            <div className="text-center mb-2">
              <WireframeBox label="FinTrac Logo" className="w-24 h-10 mx-auto mb-1" />
              <div className="text-[9px] text-muted-foreground">Cloud Accounting</div>
            </div>
            <WireframeBox label="Email Input" className="w-full" />
            <WireframeBox label="Password Input" className="w-full" />
            <div className="flex justify-between w-full text-[9px]">
              <WireframeBox label="☐ Remember" className="text-[8px] py-0.5" />
              <WireframeBox label="Forgot?" className="text-[8px] py-0.5" />
            </div>
            <WireframeBox label="Sign In" className="w-full bg-primary/20 font-medium" icon={LogIn} />
            <div className="text-[9px] text-muted-foreground">
              Don't have account? <span className="text-primary">Sign up</span>
            </div>
          </div>
        </PageWireframe>

        {/* Signup */}
        <PageWireframe title="Signup" route="/signup" icon={UserPlus}>
          <div className="flex flex-col gap-2">
            <WireframeBox label="Full Name" className="w-full" />
            <WireframeBox label="Email Address" className="w-full" />
            <div className="grid grid-cols-2 gap-2">
              <WireframeBox label="Password" />
              <WireframeBox label="Confirm Password" />
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded p-2 mt-1">
              <div className="text-[9px] font-medium text-muted-foreground mb-2">KYC Documents</div>
              <WireframeBox label="Business Name" className="w-full mb-1.5" />
              <div className="grid grid-cols-2 gap-1.5">
                <WireframeBox label="Citizenship" icon={Upload} />
                <WireframeBox label="PAN/VAT" icon={Upload} />
                <WireframeBox label="Company Reg." icon={Upload} />
                <WireframeBox label="Supporting" icon={Upload} />
              </div>
            </div>
            <WireframeBox label="Create Account" className="w-full bg-primary/20 mt-2" icon={UserPlus} />
          </div>
        </PageWireframe>

        {/* Dashboard */}
        <PageWireframe title="Dashboard" route="/" icon={LayoutDashboard}>
          <div className="flex flex-col gap-2">
            <WireframeBox label="⚠ KYC Status Banner (Pending/Rejected)" className="w-full bg-yellow-500/10" />
            <div className="grid grid-cols-4 gap-1.5">
              <WireframeBox label="₹ Sales" className="h-12 flex-col" />
              <WireframeBox label="₹ Receivables" className="h-12 flex-col" />
              <WireframeBox label="₹ Payables" className="h-12 flex-col" />
              <WireframeBox label="₹ Inventory" className="h-12 flex-col" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="border border-dashed border-muted-foreground/30 rounded p-2">
                <div className="text-[9px] font-medium text-muted-foreground mb-1">Monthly Sales Overview</div>
                <WireframeBox label="📈 Line Chart" className="h-16" />
              </div>
              <div className="border border-dashed border-muted-foreground/30 rounded p-2">
                <div className="text-[9px] font-medium text-muted-foreground mb-1">Inventory by Category</div>
                <WireframeBox label="🥧 Pie Chart" className="h-16" />
              </div>
            </div>
          </div>
        </PageWireframe>

        {/* Inventory */}
        <PageWireframe title="Inventory" route="/inventory" icon={Package}>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <WireframeBox label="Search products..." className="flex-1" icon={Search} />
              <WireframeBox label="Bulk Upload" className="bg-secondary/30" icon={Upload} />
              <WireframeBox label="Add Product" className="bg-primary/20" icon={Plus} />
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded overflow-hidden">
              <div className="bg-muted/50 p-1.5 grid grid-cols-7 gap-1 text-[8px] font-medium">
                <span>Name</span><span>SKU</span><span>Vendor</span><span>Stock</span><span>Buy</span><span>Sell</span><span>Actions</span>
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-1.5 grid grid-cols-7 gap-1 text-[8px] border-t border-dashed border-muted-foreground/20">
                  <span className="text-muted-foreground">Product {i}</span>
                  <span className="text-muted-foreground">SKU-00{i}</span>
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="text-muted-foreground">{i * 10}</span>
                  <span className="text-muted-foreground">₹{i * 100}</span>
                  <span className="text-muted-foreground">₹{i * 150}</span>
                  <div className="flex gap-0.5">
                    <Edit className="w-2.5 h-2.5" />
                    <Trash2 className="w-2.5 h-2.5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-muted-foreground">Add/Edit Modal: Name, SKU, Category, Stock, Prices, Tax, Vendor, Payment Type</div>
          </div>
        </PageWireframe>

        {/* Billing */}
        <PageWireframe title="Billing" route="/billing" icon={FileText}>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <WireframeBox label="Search invoices..." className="flex-1" icon={Search} />
              <WireframeBox label="Create Invoice" className="bg-primary/20" icon={Plus} />
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded overflow-hidden">
              <div className="bg-muted/50 p-1.5 grid grid-cols-6 gap-1 text-[8px] font-medium">
                <span>Invoice #</span><span>Client</span><span>Amount</span><span>Due Date</span><span>Status</span><span>Actions</span>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-1.5 grid grid-cols-6 gap-1 text-[8px] border-t border-dashed border-muted-foreground/20">
                  <span className="text-muted-foreground">INV-00{i}</span>
                  <span className="text-muted-foreground">Client {i}</span>
                  <span className="text-muted-foreground">₹{i * 1000}</span>
                  <span className="text-muted-foreground">2025-01-{i}</span>
                  <span className={i === 1 ? "text-green-600" : "text-yellow-600"}>{i === 1 ? "Paid" : "Pending"}</span>
                  <div className="flex gap-0.5">
                    <Edit className="w-2.5 h-2.5" />
                    <Trash2 className="w-2.5 h-2.5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-muted-foreground">Create Modal: Client, Product (dropdown), Qty, Due Date → Auto-calculates amount</div>
          </div>
        </PageWireframe>

        {/* Receivables/Payables */}
        <PageWireframe title="Receivables / Payables" route="/receivables" icon={CreditCard}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <WireframeBox label="Receivables" className="bg-primary/20 font-medium" />
              <WireframeBox label="Payables" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-dashed border-muted-foreground/30 rounded p-2 text-center">
                <div className="text-[9px] text-muted-foreground">Total Outstanding</div>
                <div className="text-sm font-bold text-primary">₹25,000</div>
              </div>
              <div className="border border-dashed border-muted-foreground/30 rounded p-2 text-center">
                <div className="text-[9px] text-muted-foreground">Pending Invoices</div>
                <div className="text-sm font-bold text-primary">5</div>
              </div>
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded overflow-hidden">
              <div className="bg-muted/50 p-1.5 grid grid-cols-5 gap-1 text-[8px] font-medium">
                <span>ID</span><span>Client/Vendor</span><span>Amount</span><span>Due</span><span>Action</span>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-1.5 grid grid-cols-5 gap-1 text-[8px] border-t border-dashed border-muted-foreground/20 items-center">
                  <span className="text-muted-foreground">REC-00{i}</span>
                  <span className="text-muted-foreground">Name {i}</span>
                  <span className="text-muted-foreground">₹{i * 500}</span>
                  <span className="text-muted-foreground">Jan {i}</span>
                  <WireframeBox label="Mark Paid" className="text-[7px] py-0.5 bg-green-500/10" icon={Check} />
                </div>
              ))}
            </div>
          </div>
        </PageWireframe>

        {/* Clients & Vendors */}
        <PageWireframe title="Clients & Vendors" route="/clients" icon={Users}>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-1.5">
              <WireframeBox label="3 Clients" className="h-10 flex-col text-[9px]" />
              <WireframeBox label="4 Vendors" className="h-10 flex-col text-[9px]" />
              <WireframeBox label="₹25K Recv." className="h-10 flex-col text-[9px]" />
              <WireframeBox label="₹18K Pay." className="h-10 flex-col text-[9px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <WireframeBox label="Sales Clients" className="bg-primary/20 font-medium" />
              <WireframeBox label="Purchase Vendors" />
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded overflow-hidden">
              <div className="bg-muted/50 p-1.5 grid grid-cols-5 gap-1 text-[8px] font-medium">
                <span>Name</span><span>Invoices</span><span>Total</span><span>Paid</span><span>Outstanding</span>
              </div>
              {[1, 2].map((i) => (
                <div key={i} className="p-1.5 grid grid-cols-5 gap-1 text-[8px] border-t border-dashed border-muted-foreground/20">
                  <span className="text-muted-foreground">Client {i}</span>
                  <span className="text-muted-foreground">{i + 2}</span>
                  <span className="text-muted-foreground">₹{i * 5000}</span>
                  <span className="text-muted-foreground">₹{i * 3000}</span>
                  <span className="text-primary font-medium">₹{i * 2000}</span>
                </div>
              ))}
            </div>
          </div>
        </PageWireframe>

        {/* Reports */}
        <PageWireframe title="Reports" route="/reports" icon={BarChart3}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="text-xs font-medium">Financial Reports</div>
              <WireframeBox label="Download" className="bg-secondary/30" icon={Download} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-dashed border-muted-foreground/30 rounded p-2">
                <div className="text-[9px] font-medium text-muted-foreground mb-1">Sales vs Purchases</div>
                <WireframeBox label="📊 Bar Chart (Monthly)" className="h-14" />
              </div>
              <div className="border border-dashed border-muted-foreground/30 rounded p-2">
                <div className="text-[9px] font-medium text-muted-foreground mb-1">Tax Overview</div>
                <WireframeBox label="🥧 Pie (Collected vs Payable)" className="h-14" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="border border-dashed border-muted-foreground/30 rounded p-2 text-center">
                <div className="text-[8px] text-muted-foreground">Net Profit</div>
                <div className="text-xs font-bold text-green-600">₹45,000</div>
              </div>
              <div className="border border-dashed border-muted-foreground/30 rounded p-2 text-center">
                <div className="text-[8px] text-muted-foreground">Revenue</div>
                <div className="text-xs font-bold text-primary">₹1,20,000</div>
              </div>
              <div className="border border-dashed border-muted-foreground/30 rounded p-2 text-center">
                <div className="text-[8px] text-muted-foreground">Expenses</div>
                <div className="text-xs font-bold text-red-500">₹75,000</div>
              </div>
            </div>
          </div>
        </PageWireframe>

        {/* Settings */}
        <PageWireframe title="Settings" route="/settings" icon={Settings}>
          <div className="flex flex-col gap-2">
            <div className="border border-dashed border-muted-foreground/30 rounded p-2 bg-green-500/5">
              <div className="flex items-center gap-2">
                <Check className="w-3 h-3 text-green-600" />
                <div>
                  <div className="text-[9px] font-medium">KYC Status: Approved</div>
                  <div className="text-[8px] text-muted-foreground">Verified on Jan 15, 2025</div>
                </div>
              </div>
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded p-2">
              <div className="text-[9px] font-medium mb-2">Company Details</div>
              <div className="space-y-1.5">
                <WireframeBox label="Company Name" className="w-full" />
                <WireframeBox label="Address" className="w-full" />
                <WireframeBox label="GST/VAT Number" className="w-full" />
                <div className="grid grid-cols-2 gap-2">
                  <WireframeBox label="Region (Nepal/India)" />
                  <WireframeBox label="Currency (NPR/INR)" />
                </div>
              </div>
            </div>
            <WireframeBox label="Save Settings" className="w-full bg-primary/20" icon={Check} />
          </div>
        </PageWireframe>

        {/* Admin Login */}
        <PageWireframe title="Admin Login" route="/admin" icon={Shield}>
          <div className="flex flex-col items-center justify-center h-full gap-3 max-w-[200px] mx-auto">
            <div className="text-center mb-2">
              <WireframeBox label="🛡️ Admin Portal" className="w-28 h-10 mx-auto mb-1 bg-red-500/10" />
              <div className="text-[9px] text-muted-foreground">Restricted Access</div>
            </div>
            <WireframeBox label="Admin Email" className="w-full" />
            <WireframeBox label="Admin Password" className="w-full" />
            <WireframeBox label="Admin Sign In" className="w-full bg-red-500/20 font-medium" icon={Shield} />
            <div className="text-[8px] text-muted-foreground text-center">
              Only authorized administrators can access this portal
            </div>
          </div>
        </PageWireframe>

        {/* Admin Dashboard */}
        <PageWireframe title="Admin Dashboard" route="/admin/dashboard" icon={Shield}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="text-xs font-medium">KYC Verification Queue</div>
              <WireframeBox label="Logout" className="bg-red-500/10 text-[8px]" />
            </div>
            <div className="flex gap-1.5">
              <WireframeBox label="All (15)" className="bg-primary/20" />
              <WireframeBox label="Pending (8)" className="bg-yellow-500/10" />
              <WireframeBox label="Approved (5)" className="bg-green-500/10" />
              <WireframeBox label="Rejected (2)" className="bg-red-500/10" />
            </div>
            <div className="border border-dashed border-muted-foreground/30 rounded overflow-hidden">
              <div className="bg-muted/50 p-1.5 grid grid-cols-6 gap-1 text-[8px] font-medium">
                <span>User</span><span>Business</span><span>Status</span><span>Date</span><span>Docs</span><span>Actions</span>
              </div>
              {[1, 2].map((i) => (
                <div key={i} className="p-1.5 grid grid-cols-6 gap-1 text-[8px] border-t border-dashed border-muted-foreground/20 items-center">
                  <span className="text-muted-foreground">user{i}@email</span>
                  <span className="text-muted-foreground">Biz {i}</span>
                  <span className="text-yellow-600">Pending</span>
                  <span className="text-muted-foreground">Jan {i}</span>
                  <Eye className="w-2.5 h-2.5 text-primary" />
                  <div className="flex gap-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                    <X className="w-2.5 h-2.5 text-red-500" />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-muted-foreground">View docs modal, Approve/Reject with optional reason</div>
          </div>
        </PageWireframe>

        {/* Main Layout */}
        <PageWireframe title="Main Layout Structure" route="/* (authenticated)" icon={LayoutDashboard}>
          <div className="flex gap-2 h-full">
            <div className="w-20 flex flex-col gap-1.5 border border-dashed border-muted-foreground/30 rounded p-1.5">
              <WireframeBox label="FinTrac" className="h-8 bg-primary/10" />
              <div className="flex-1 flex flex-col gap-1">
                {["Dashboard", "Inventory", "Billing", "Recv/Pay", "Clients", "Reports", "Settings"].map((item) => (
                  <div key={item} className="flex items-center gap-1 text-[7px] text-muted-foreground px-1 py-0.5 rounded hover:bg-muted/50">
                    <ChevronRight className="w-2 h-2" />
                    {item}
                  </div>
                ))}
              </div>
              <WireframeBox label="Footer" className="text-[7px]" />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="border border-dashed border-muted-foreground/30 rounded p-1.5 flex justify-between items-center">
                <span className="text-[8px]">Welcome, User</span>
                <div className="flex items-center gap-1">
                  <WireframeBox label="Avatar" className="w-5 h-5 rounded-full" />
                  <WireframeBox label="Logout" className="text-[7px]" />
                </div>
              </div>
              <div className="flex-1 border border-dashed border-muted-foreground/30 rounded p-2">
                <div className="text-[9px] text-muted-foreground text-center">
                  Page Content Area<br />
                  (Routes render here)
                </div>
              </div>
            </div>
          </div>
        </PageWireframe>

      </div>

      <div className="mt-8 p-4 border border-dashed border-muted-foreground/30 rounded-lg">
        <h3 className="font-semibold mb-2">Data Flow Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div>
            <strong className="text-foreground">Inventory → Purchases:</strong><br />
            Adding product auto-creates purchase record & payable (cash = paid, credit = pending)
          </div>
          <div>
            <strong className="text-foreground">Invoice → Receivables → Sales:</strong><br />
            Creating invoice creates receivable. Marking paid creates sale & updates stock.
          </div>
          <div>
            <strong className="text-foreground">KYC Flow:</strong><br />
            Signup → Pending → Admin reviews → Approve/Reject → User access
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wireframes;

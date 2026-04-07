import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Sidebar } from "./components/Layout/Sidebar";
import { Header } from "./components/Layout/Header";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { KYCStatusBanner } from "./components/KYC/KYCStatusBanner";
import { useKYCStatus } from "./hooks/useKYCStatus";
import { Login, Signup, AdminLogin } from "./pages/auth/AuthPages";
import {
  DashboardPage,
  GoodsReceiptsPage,
  InventoryPage,
  PurchaseBillsPage,
  PurchaseDebitNotesPage,
  PurchaseOrdersPage,
  RelationshipsPage,
  ReportsPage,
  SalesCreditNotesPage,
  SalesInvoicesPage,
  SalesOrdersPage,
  SalesQuotesPage,
  SettingsPage,
  SettlementsPage,
} from "./pages/app/AppPages";
import { AdminDashboard } from "./pages/admin/AdminPages";
import Wireframes from "./pages/Wireframes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Layout component with KYC banner
const AppLayout = () => {
  const { kycStatus, rejectionReason } = useKYCStatus();

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-8">
          <KYCStatusBanner status={kycStatus} rejectionReason={rejectionReason} />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sales/quotes" element={<SalesQuotesPage />} />
            <Route path="/sales/orders" element={<SalesOrdersPage />} />
            <Route path="/sales/invoices" element={<SalesInvoicesPage />} />
            <Route path="/sales/credit-notes" element={<SalesCreditNotesPage />} />
            <Route path="/procurement/orders" element={<PurchaseOrdersPage />} />
            <Route path="/procurement/receipts" element={<GoodsReceiptsPage />} />
            <Route path="/procurement/bills" element={<PurchaseBillsPage />} />
            <Route path="/procurement/debit-notes" element={<PurchaseDebitNotesPage />} />
            <Route path="/inventory" element={<InventoryPage initialTab="items" />} />
            <Route path="/inventory/warehouses" element={<InventoryPage initialTab="warehouses" />} />
            <Route path="/inventory/movements" element={<InventoryPage initialTab="movements" />} />
            <Route path="/settlements" element={<SettlementsPage />} />
            <Route path="/relationships" element={<RelationshipsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/billing" element={<Navigate to="/sales/invoices" replace />} />
            <Route path="/receivables" element={<Navigate to="/settlements" replace />} />
            <Route path="/clients" element={<Navigate to="/relationships" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/wireframes" element={<Wireframes />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

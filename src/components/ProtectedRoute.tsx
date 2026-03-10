import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useKYCStatus } from "@/hooks/useKYCStatus";
import { KYCStatusBanner } from "@/components/KYC/KYCStatusBanner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { kycStatus, rejectionReason, isLoading: kycLoading } = useKYCStatus();

  if (authLoading || kycLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Export KYC status for use in layout
export { useKYCStatus } from "@/hooks/useKYCStatus";
export { KYCStatusBanner } from "@/components/KYC/KYCStatusBanner";

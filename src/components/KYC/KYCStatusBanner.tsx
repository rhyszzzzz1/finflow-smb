import { AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface KYCStatusBannerProps {
  status: 'pending' | 'approved' | 'rejected' | null;
  rejectionReason?: string | null;
}

export const KYCStatusBanner = ({ status, rejectionReason }: KYCStatusBannerProps) => {
  if (status === 'approved') return null;

  if (status === 'pending') {
    return (
      <Alert className="mb-6 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
        <Clock className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200">KYC Verification Pending</AlertTitle>
        <AlertDescription className="text-yellow-700 dark:text-yellow-300">
          Your documents have been submitted for verification. You will gain full access once approved by the administrator.
          Some features may be restricted until verification is complete.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'rejected') {
    return (
      <Alert className="mb-6 border-destructive/50 bg-destructive/10">
        <XCircle className="h-4 w-4 text-destructive" />
        <AlertTitle className="text-destructive">KYC Verification Rejected</AlertTitle>
        <AlertDescription className="text-destructive/80">
          Your KYC submission was rejected. 
          {rejectionReason && <span className="block mt-1">Reason: {rejectionReason}</span>}
          Please contact support or re-upload your documents from the Settings page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-6 border-muted">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>KYC Not Submitted</AlertTitle>
      <AlertDescription>
        Please complete your KYC verification to access all features.
      </AlertDescription>
    </Alert>
  );
};

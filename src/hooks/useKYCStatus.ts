import { useState, useEffect } from "react";
import { kycApi } from "@/services/api";

export interface KYCDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
}

export const useKYCStatus = () => {
  const [kycStatus, setKycStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState<KYCDocument[]>([]);

  const fetchKYCData = async () => {
    try {
      const [statusData, docsData] = await Promise.all([
        kycApi.getStatus(),
        kycApi.getDocuments(),
      ]);

      if (statusData) {
        // Backend returns: { status, rejection_reason, submitted_at, ... }
        setKycStatus(statusData.status ?? null);
        setRejectionReason(statusData.rejection_reason ?? null);
      }

      // business_name comes from the user profile stored in localStorage
      const storedUser = localStorage.getItem("auth_user");
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setBusinessName(user.business_name ?? null);
        } catch { /* ignore */ }
      }

      if (docsData) {
        setDocuments(Array.isArray(docsData) ? docsData : []);
      }
    } catch (error) {
      console.error("Failed to fetch KYC data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKYCData();
  }, []);

  return {
    kycStatus,
    rejectionReason,
    businessName,
    isLoading,
    documents,
    refetch: fetchKYCData,
  };
};

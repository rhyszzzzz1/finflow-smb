import { useState, useEffect, useCallback } from "react";
import { clientsApi } from "@/services/api";

export interface SalesClient {
  id: string;
  client_name: string;
  email?: string;
  phone?: string;
  total_invoices: number;
  total_amount: number;
  outstanding_amount: number;
}

export interface PurchaseVendor {
  id: string;
  vendor_name: string;
  email?: string;
  phone?: string;
  total_payables: number;
  total_amount: number;
  outstanding_amount: number;
}

export const useClients = () => {
  const [salesClients, setSalesClients] = useState<SalesClient[]>([]);
  const [purchaseVendors, setPurchaseVendors] = useState<PurchaseVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [clientsData, vendorsData] = await Promise.all([
        clientsApi.getSalesClients(),
        clientsApi.getVendors(),
      ]);
      setSalesClients(Array.isArray(clientsData) ? clientsData : clientsData.data || []);
      setPurchaseVendors(Array.isArray(vendorsData) ? vendorsData : vendorsData.data || []);
    } catch (error) {
      console.error("Failed to load clients/vendors:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    salesClients,
    purchaseVendors,
    isLoading,
    refetch: fetchData,
  };
};

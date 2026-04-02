import { useState, useEffect, useCallback } from "react";
import { clientsApi } from "@/services/api";

export interface SalesClient {
  id: string;
  linked_profile_id?: string | null;
  client_name: string;
  email?: string;
  phone?: string;
  total_invoices: number;
  total_amount: number;
  outstanding_amount: number;
  pending_invoices?: number;
  paid_amount?: number;
}

export interface PurchaseVendor {
  id: string;
  linked_profile_id?: string | null;
  vendor_name: string;
  email?: string;
  phone?: string;
  total_payables: number;
  total_amount: number;
  outstanding_amount: number;
  pending_payables?: number;
  paid_amount?: number;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSalesClient = (client: any): SalesClient => ({
  ...client,
  total_invoices: toNumber(client.total_invoices),
  total_amount: toNumber(client.total_amount),
  outstanding_amount: toNumber(client.outstanding_amount),
  pending_invoices: toNumber(client.pending_invoices),
  paid_amount: toNumber(client.paid_amount),
});

const normalizePurchaseVendor = (vendor: any): PurchaseVendor => ({
  ...vendor,
  total_payables: toNumber(vendor.total_payables),
  total_amount: toNumber(vendor.total_amount),
  outstanding_amount: toNumber(vendor.outstanding_amount),
  pending_payables: toNumber(vendor.pending_payables),
  paid_amount: toNumber(vendor.paid_amount),
});

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
      const sales = Array.isArray(clientsData) ? clientsData : clientsData.data || [];
      const vendors = Array.isArray(vendorsData) ? vendorsData : vendorsData.data || [];
      setSalesClients(sales.map(normalizeSalesClient));
      setPurchaseVendors(vendors.map(normalizePurchaseVendor));
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

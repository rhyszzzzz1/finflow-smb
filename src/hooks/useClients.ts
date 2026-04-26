import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { clientsApi } from "@/services/api";

export interface SalesClient {
  id: string;
  counterparty_id?: string | null;
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
  counterparty_id?: string | null;
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

export type LegacyContactPayload = {
  email?: string;
  phone?: string;
  address?: string;
};

export const useClients = () => {
  const [salesClients, setSalesClients] = useState<SalesClient[]>([]);
  const [purchaseVendors, setPurchaseVendors] = useState<PurchaseVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  const addLegacyClient = useCallback(
    async (client_name: string, extra?: LegacyContactPayload) => {
      const name = String(client_name || "").trim();
      if (!name) {
        toast.error("Client name is required");
        return false;
      }
      setIsSaving(true);
      try {
        await clientsApi.addClient({
          client_name: name,
          email: extra?.email?.trim() || undefined,
          phone: extra?.phone?.trim() || undefined,
          address: extra?.address?.trim() || undefined,
        });
        toast.success("Legacy client added");
        await fetchData();
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add client";
        toast.error(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchData]
  );

  const addLegacyVendor = useCallback(
    async (vendor_name: string, extra?: LegacyContactPayload) => {
      const name = String(vendor_name || "").trim();
      if (!name) {
        toast.error("Vendor name is required");
        return false;
      }
      setIsSaving(true);
      try {
        await clientsApi.addVendor({
          vendor_name: name,
          email: extra?.email?.trim() || undefined,
          phone: extra?.phone?.trim() || undefined,
          address: extra?.address?.trim() || undefined,
        });
        toast.success("Legacy vendor added");
        await fetchData();
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add vendor";
        toast.error(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchData]
  );

  const linkLegacyClient = useCallback(
    async (linked_profile_id: string) => {
      const id = String(linked_profile_id || "").trim();
      if (!id) {
        toast.error("Select a registered account");
        return false;
      }
      setIsSaving(true);
      try {
        await clientsApi.addClient({ linked_profile_id: id });
        toast.success("Registered account added as legacy client");
        await fetchData();
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to link client";
        toast.error(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchData]
  );

  const linkLegacyVendor = useCallback(
    async (linked_profile_id: string) => {
      const id = String(linked_profile_id || "").trim();
      if (!id) {
        toast.error("Select a registered account");
        return false;
      }
      setIsSaving(true);
      try {
        await clientsApi.addVendor({ linked_profile_id: id });
        toast.success("Registered account added as legacy vendor");
        await fetchData();
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to link vendor";
        toast.error(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchData]
  );

  return {
    salesClients,
    purchaseVendors,
    isLoading,
    isSaving,
    refetch: fetchData,
    addLegacyClient,
    addLegacyVendor,
    linkLegacyClient,
    linkLegacyVendor,
  };
};

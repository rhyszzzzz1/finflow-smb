import { useState, useEffect } from "react";
import { settingsApi } from "@/services/api";
import { toast } from "sonner";

export interface CompanySettings {
  id?: string;
  company_name: string;
  gst_number: string;
  address: string;
  currency: string;
  region: string;
}

const defaultSettings: CompanySettings = {
  company_name: "My Business",
  gst_number: "",
  address: "Kathmandu, Nepal",
  currency: "NPR",
  region: "Nepal",
};

export const useCompanySettings = () => {
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const data = await settingsApi.get();
      if (data) {
        setSettings({
          id: data.id,
          company_name: data.company_name || defaultSettings.company_name,
          gst_number: data.gst_number || "",
          address: data.address || defaultSettings.address,
          currency: data.currency || defaultSettings.currency,
          region: data.region || defaultSettings.region,
        });
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveSettings = async (newSettings: CompanySettings) => {
    try {
      await settingsApi.save({
        company_name: newSettings.company_name,
        gst_number: newSettings.gst_number,
        address: newSettings.address,
        currency: newSettings.currency,
        region: newSettings.region,
      });
      toast.success("Settings saved successfully");
      await fetchSettings();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
      return false;
    }
  };

  return {
    settings,
    isLoading,
    saveSettings,
    refetch: fetchSettings,
  };
};

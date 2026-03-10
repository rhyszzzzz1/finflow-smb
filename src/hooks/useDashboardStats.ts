import { useState, useEffect } from "react";
import { dashboardApi } from "@/services/api";

export interface DashboardStats {
  totalSales: number;
  pendingReceivables: number;
  pendingReceivablesCount: number;
  outstandingPayables: number;
  inventoryValue: number;
  inventoryCount: number;
  monthlySales: { month: string; sales: number }[];
}

const defaultStats: DashboardStats = {
  totalSales: 0,
  pendingReceivables: 0,
  pendingReceivablesCount: 0,
  outstandingPayables: 0,
  inventoryValue: 0,
  inventoryCount: 0,
  monthlySales: [],
};

export const useDashboardStats = () => {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const data = await dashboardApi.getStats();
      setStats(data || defaultStats);
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
      setStats(defaultStats);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
};

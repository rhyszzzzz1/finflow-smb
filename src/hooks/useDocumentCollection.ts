import { useEffect, useState } from "react";
import { toast } from "sonner";

type ListApi<T> = () => Promise<T[] | { data?: T[] }>;

type DocumentCollectionConfig<T> = {
  entityName: string;
  list: ListApi<T>;
  normalize?: (value: any) => T;
  actions?: Record<string, (...args: any[]) => Promise<any>>;
};

const toArray = <T,>(value: T[] | { data?: T[] } | null | undefined) =>
  Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

export const useDocumentCollection = <T,>({
  entityName,
  list,
  normalize = (value) => value as T,
  actions = {},
}: DocumentCollectionConfig<T>) => {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const result = await list();
      setItems(toArray(result).map(normalize));
    } catch (error) {
      console.error(error);
      toast.error(`Failed to load ${entityName}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const callAction = async <R,>(label: string, fn: (...args: any[]) => Promise<R>, args: any[], successMessage: string) => {
    try {
      const result = await fn(...args);
      toast.success(successMessage);
      await fetchItems();
      return result;
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${label} ${entityName}`);
      return null;
    }
  };

  return {
    items,
    isLoading,
    refetch: fetchItems,
    callAction,
    actions,
  };
};

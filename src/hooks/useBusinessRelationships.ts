import { businessRelationshipApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

export const useBusinessRelationships = () => {
  const collection = useDocumentCollection({
    entityName: "business relationships",
    list: businessRelationshipApi.list,
  });

  return {
    relationships: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    inviteRelationship: (payload: any) => collection.callAction("invite", businessRelationshipApi.invite, [payload], "Relationship invitation sent"),
    acceptRelationship: (id: string) => collection.callAction("accept", businessRelationshipApi.accept, [id], "Relationship accepted"),
  };
};

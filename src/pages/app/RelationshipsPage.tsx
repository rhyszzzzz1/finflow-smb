import { useState } from "react";
import { Building2, Handshake, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelationshipStatusBadge } from "@/components/accounting/RelationshipStatusBadge";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessRelationships } from "@/hooks/useBusinessRelationships";
import { useClients } from "@/hooks/useClients";
import { useMasterData } from "@/hooks/useMasterData";
import { relationshipRoleBadge } from "./documentPageUtils";

export const RelationshipsPage = () => {
  const { user } = useAuth();
  const { relationships, isLoading, inviteRelationship, acceptRelationship } = useBusinessRelationships();
  const { salesClients, purchaseVendors } = useClients();
  const { registeredAccountOptions } = useMasterData();
  const [inviteForm, setInviteForm] = useState({
    actor_role: "seller",
    counterparty_profile_id: "",
    default_payment_terms_days: "30",
    credit_limit: "",
    notes: "",
  });

  if (isLoading) {
    return <LoadingState title="Relationships" message="Loading business relationships..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Relationships</h1>
        <p className="text-muted-foreground mt-1">
          Work with bilateral business relationships for connected counterparties while keeping legacy client and vendor lists visible as compatibility data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Handshake className="w-4 h-4" />Invite Business Relationship</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="grid gap-2">
            <Label>Your Role</Label>
            <Select value={inviteForm.actor_role} onValueChange={(value) => setInviteForm((current) => ({ ...current, actor_role: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="seller">We are Seller</SelectItem>
                <SelectItem value="buyer">We are Buyer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Counterparty Account</Label>
            <Select value={inviteForm.counterparty_profile_id} onValueChange={(value) => setInviteForm((current) => ({ ...current, counterparty_profile_id: value }))}>
              <SelectTrigger><SelectValue placeholder="Select registered account" /></SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                {registeredAccountOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Terms (days)</Label>
            <Input value={inviteForm.default_payment_terms_days} onChange={(event) => setInviteForm((current) => ({ ...current, default_payment_terms_days: event.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label>Credit Limit</Label>
            <Input value={inviteForm.credit_limit} onChange={(event) => setInviteForm((current) => ({ ...current, credit_limit: event.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={async () => {
                const payload =
                  inviteForm.actor_role === "seller"
                    ? { actor_role: "seller", buyer_profile_id: inviteForm.counterparty_profile_id }
                    : { actor_role: "buyer", seller_profile_id: inviteForm.counterparty_profile_id };

                const result = await inviteRelationship({
                  ...payload,
                  default_payment_terms_days: Number(inviteForm.default_payment_terms_days || 0),
                  credit_limit: inviteForm.credit_limit ? Number(inviteForm.credit_limit) : null,
                  notes: inviteForm.notes || null,
                });

                if (result) {
                  setInviteForm({
                    actor_role: "seller",
                    counterparty_profile_id: "",
                    default_payment_terms_days: "30",
                    credit_limit: "",
                    notes: "",
                  });
                }
              }}
            >
              Send Invite
            </Button>
          </div>
          <div className="grid gap-2 md:col-span-5">
            <Label>Notes</Label>
            <Input value={inviteForm.notes} onChange={(event) => setInviteForm((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active">Business Relationships</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Client/Vendor View</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardHeader><CardTitle>Connected Businesses</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Viewer Role</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relationships.length === 0 ? (
                    <TableRow><TableCell colSpan={6}><EmptyState title="No relationships yet" description="Invite counterparties into a real bilateral business relationship instead of relying only on unilateral contact records." /></TableCell></TableRow>
                  ) : relationships.map((relationship: any) => (
                    <TableRow key={relationship.id}>
                      <TableCell className="font-medium">{relationship.buyer_name || relationship.buyer_company_id}</TableCell>
                      <TableCell>{relationship.seller_name || relationship.seller_company_id}</TableCell>
                      <TableCell><RelationshipStatusBadge status={relationship.relationship_status} /></TableCell>
                      <TableCell>{relationshipRoleBadge(relationship.viewer_role)}</TableCell>
                      <TableCell>{relationship.counterparty_company_id || "-"}</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const invited = String(relationship.relationship_status || "").toLowerCase() === "invited";
                          if (!invited) return "-";
                          const isInviter =
                            Boolean(user?.id && relationship.created_by_user_id) &&
                            relationship.created_by_user_id === user.id;
                          if (isInviter) {
                            return <span className="text-muted-foreground text-sm">Awaiting counterparty</span>;
                          }
                          return (
                            <Button size="sm" variant="outline" onClick={() => acceptRelationship(relationship.id)}>
                              Accept Relationship
                            </Button>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legacy">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" />Legacy Sales Clients</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesClients.length === 0 ? (
                      <TableRow><TableCell colSpan={2}>No legacy clients</TableCell></TableRow>
                    ) : salesClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.client_name}</TableCell>
                        <TableCell className="text-right">{client.outstanding_amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-4 h-4" />Legacy Purchase Vendors</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseVendors.length === 0 ? (
                      <TableRow><TableCell colSpan={2}>No legacy vendors</TableCell></TableRow>
                    ) : purchaseVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                        <TableCell className="text-right">{vendor.outstanding_amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

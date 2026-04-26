import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Building2, ChevronDown, ChevronRight, Handshake, Link2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const {
    salesClients,
    purchaseVendors,
    isSaving: legacySaving,
    addLegacyClient,
    addLegacyVendor,
    linkLegacyClient,
    linkLegacyVendor,
  } = useClients();
  const { registeredAccountOptions } = useMasterData();
  const [showLegacy, setShowLegacy] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    actor_role: "seller",
    counterparty_profile_id: "",
    default_payment_terms_days: "30",
    credit_limit: "",
    notes: "",
  });
  const [legacyClientManual, setLegacyClientManual] = useState({ name: "", email: "", phone: "", address: "" });
  const [legacyVendorManual, setLegacyVendorManual] = useState({ name: "", email: "", phone: "", address: "" });
  const [legacyLinkClientId, setLegacyLinkClientId] = useState("");
  const [legacyLinkVendorId, setLegacyLinkVendorId] = useState("");

  if (isLoading) {
    return <LoadingState title="Relationships" message="Loading business relationships..." />;
  }

  const pendingInvites = (relationships || []).filter(
    (r: any) => String(r.relationship_status || "").toLowerCase() === "invited"
  );
  const activeRelationships = (relationships || []).filter(
    (r: any) => String(r.relationship_status || "").toLowerCase() !== "invited"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Relationships</h1>
        <p className="text-muted-foreground mt-1">
          <span className="font-medium text-foreground">Business relationships</span> are the authoritative way to trade with counterparties.
          Legacy client/vendor lists remain available as <span className="font-medium">compatibility records</span>.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="w-4 h-4" />
            Invite a business relationship (authoritative)
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Use this to connect to another registered account and enable bilateral trading roles (buyer/seller) with clear status and acceptance.
          </div>
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
                {registeredAccountOptions
                  .filter((option) => option.value !== "")
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
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
              disabled={!inviteForm.counterparty_profile_id}
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

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Business relationships (primary)</h2>
            <p className="text-sm text-muted-foreground">
              Authoritative connected counterparty model with bilateral roles, status, and acceptance.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Active: <span className="font-semibold text-foreground">{activeRelationships.length}</span> · Pending:{" "}
            <span className="font-semibold text-foreground">{pendingInvites.length}</span>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Viewer role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRelationships.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState
                          title="No active relationships"
                          description="Invite counterparties into the bilateral relationship model to make connected trading authoritative."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeRelationships.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.counterparty_name || r.counterparty_company_id || "-"}</TableCell>
                        <TableCell>{r.buyer_name || r.buyer_company_id}</TableCell>
                        <TableCell>{r.seller_name || r.seller_company_id}</TableCell>
                        <TableCell><RelationshipStatusBadge status={r.relationship_status} /></TableCell>
                        <TableCell>{relationshipRoleBadge(r.viewer_role)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className={pendingInvites.length > 0 ? "border-amber-200" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending invites</CardTitle>
            <div className="text-sm text-muted-foreground">
              Invitations require acceptance by the counterparty to become authoritative.
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Counterparty</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState title="No pending invites" description="When invites exist, you can accept them here." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingInvites.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.counterparty_name || r.counterparty_company_id || "-"}</TableCell>
                        <TableCell>{r.buyer_name || r.buyer_company_id}</TableCell>
                        <TableCell>{r.seller_name || r.seller_company_id}</TableCell>
                        <TableCell><RelationshipStatusBadge status={r.relationship_status} /></TableCell>
                        <TableCell className="text-right">
                          {(() => {
                            const isInviter =
                              Boolean(user?.id && r.created_by_user_id) &&
                              r.created_by_user_id === user.id;
                            if (isInviter) {
                              return <span className="text-muted-foreground text-sm">Awaiting counterparty</span>;
                            }
                            return (
                              <Button size="sm" variant="outline" onClick={() => acceptRelationship(r.id)}>
                                Accept
                              </Button>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed border-border bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              Legacy contacts (compatibility)
            </span>
            <Button variant="ghost" className="gap-2" onClick={() => setShowLegacy((v) => !v)}>
              {showLegacy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {showLegacy ? "Hide" : "Show"}
            </Button>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            These are transitional, unilateral records for older flows. Prefer business relationships for authoritative counterparty management.
          </div>
        </CardHeader>
        {showLegacy ? (
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Link2 className="w-4 h-4" />
                    Legacy sales clients
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <div className="text-sm font-medium">Link registered account as client</div>
                    <p className="text-xs text-muted-foreground">
                      Creates a client row from another FinFlow user profile and an accepted buyer/seller relationship (same as API link flow).
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="grid gap-2 min-w-[200px] flex-1">
                        <Label className="text-xs">Registered account</Label>
                        <Select value={legacyLinkClientId} onValueChange={setLegacyLinkClientId}>
                          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent className="bg-popover border border-border">
                            {registeredAccountOptions
                              .filter((option) => option.value !== "")
                              .map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        disabled={legacySaving || !legacyLinkClientId}
                        onClick={async () => {
                          const ok = await linkLegacyClient(legacyLinkClientId);
                          if (ok) setLegacyLinkClientId("");
                        }}
                      >
                        Link as client
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <div className="text-sm font-medium">Add manual legacy client</div>
                    <p className="text-xs text-muted-foreground">
                      Unilateral contact for quotes and invoices when the other party is not on the platform. A counterparty record is created for allocations.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2 sm:col-span-2">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          value={legacyClientManual.name}
                          onChange={(e) => setLegacyClientManual((c) => ({ ...c, name: e.target.value }))}
                          placeholder="Customer or business name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Email</Label>
                        <Input
                          type="email"
                          value={legacyClientManual.email}
                          onChange={(e) => setLegacyClientManual((c) => ({ ...c, email: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          value={legacyClientManual.phone}
                          onChange={(e) => setLegacyClientManual((c) => ({ ...c, phone: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2 sm:col-span-2">
                        <Label className="text-xs">Address</Label>
                        <Textarea
                          rows={2}
                          value={legacyClientManual.address}
                          onChange={(e) => setLegacyClientManual((c) => ({ ...c, address: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={legacySaving || !legacyClientManual.name.trim()}
                      onClick={async () => {
                        const ok = await addLegacyClient(legacyClientManual.name, {
                          email: legacyClientManual.email,
                          phone: legacyClientManual.phone,
                          address: legacyClientManual.address,
                        });
                        if (ok) setLegacyClientManual({ name: "", email: "", phone: "", address: "" });
                      }}
                    >
                      Add manual client
                    </Button>
                  </div>

                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
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
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4" />
                    Legacy purchase vendors
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <div className="text-sm font-medium">Link registered account as vendor</div>
                    <p className="text-xs text-muted-foreground">
                      Creates a vendor row from another FinFlow user profile and an accepted relationship.
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="grid gap-2 min-w-[200px] flex-1">
                        <Label className="text-xs">Registered account</Label>
                        <Select value={legacyLinkVendorId} onValueChange={setLegacyLinkVendorId}>
                          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent className="bg-popover border border-border">
                            {registeredAccountOptions
                              .filter((option) => option.value !== "")
                              .map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        disabled={legacySaving || !legacyLinkVendorId}
                        onClick={async () => {
                          const ok = await linkLegacyVendor(legacyLinkVendorId);
                          if (ok) setLegacyLinkVendorId("");
                        }}
                      >
                        Link as vendor
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <div className="text-sm font-medium">Add manual legacy vendor</div>
                    <p className="text-xs text-muted-foreground">
                      Unilateral supplier record for purchase documents when they are not on the platform.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2 sm:col-span-2">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          value={legacyVendorManual.name}
                          onChange={(e) => setLegacyVendorManual((c) => ({ ...c, name: e.target.value }))}
                          placeholder="Supplier or business name"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Email</Label>
                        <Input
                          type="email"
                          value={legacyVendorManual.email}
                          onChange={(e) => setLegacyVendorManual((c) => ({ ...c, email: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          value={legacyVendorManual.phone}
                          onChange={(e) => setLegacyVendorManual((c) => ({ ...c, phone: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2 sm:col-span-2">
                        <Label className="text-xs">Address</Label>
                        <Textarea
                          rows={2}
                          value={legacyVendorManual.address}
                          onChange={(e) => setLegacyVendorManual((c) => ({ ...c, address: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      disabled={legacySaving || !legacyVendorManual.name.trim()}
                      onClick={async () => {
                        const ok = await addLegacyVendor(legacyVendorManual.name, {
                          email: legacyVendorManual.email,
                          phone: legacyVendorManual.phone,
                          address: legacyVendorManual.address,
                        });
                        if (ok) setLegacyVendorManual({ name: "", email: "", phone: "", address: "" });
                      }}
                    >
                      Add manual vendor
                    </Button>
                  </div>

                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
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
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
};

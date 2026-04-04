import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/utils/format";
import { useReceivables } from "@/hooks/useReceivables";
import { usePayables } from "@/hooks/usePayables";
import { usePayments } from "@/hooks/usePayments";

type PaymentTarget = {
  mode: "incoming" | "outgoing";
  document_id: string;
  counterparty_id: string | null;
  counterparty_name: string;
  document_no: string;
  outstanding_amount: number;
};

export const SettlementView = () => {
  const { receivables, aging: receivablesAging, customerBalances, isLoading: receivablesLoading, refetch: refetchReceivables } = useReceivables();
  const { payables, aging: payablesAging, vendorBalances, isLoading: payablesLoading, refetch: refetchPayables } = usePayables();
  const { bankAccounts, applyPayment } = usePayments();
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    method: "cash",
    bank_account_id: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    reference: "",
    notes: "",
  });

  const totalReceivables = Number(receivablesAging?.buckets?.total || 0);
  const totalPayables = Number(payablesAging?.buckets?.total || 0);
  const isLoading = receivablesLoading || payablesLoading;

  const openPaymentDialog = (target: PaymentTarget) => {
    setPaymentTarget(target);
    setPaymentForm({
      method: "cash",
      bank_account_id: "",
      date: new Date().toISOString().slice(0, 10),
      amount: String(target.outstanding_amount || ""),
      reference: target.document_no,
      notes: "",
    });
  };

  const closeDialog = () => setPaymentTarget(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget) return;
    if (!paymentTarget.counterparty_id) {
      toast.error("This document is not linked to a registered account yet");
      return;
    }

    setIsSubmitting(true);
    try {
      const amount = Number(paymentForm.amount || 0);
      if (amount <= 0) {
        toast.error("Payment amount must be greater than zero");
        return;
      }

      const result = await applyPayment({
        type: paymentTarget.mode,
        amount,
        date: paymentForm.date,
        method: paymentForm.method as any,
        bank_account_id: paymentForm.method === "cash" ? null : paymentForm.bank_account_id || null,
        customer_id: paymentTarget.mode === "incoming" ? paymentTarget.counterparty_id : null,
        vendor_id: paymentTarget.mode === "outgoing" ? paymentTarget.counterparty_id : null,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        allocations: [
          {
            target_type: paymentTarget.mode === "incoming" ? "sales_invoice" : "purchase_bill",
            target_id: paymentTarget.document_id,
            allocated_amount: amount,
          },
        ],
      });

      if (result) {
        closeDialog();
        await Promise.all([refetchReceivables(), refetchPayables()]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Receivables & Payables</h1>
          <p className="text-muted-foreground mt-1">Loading data...</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Receivables & Payables</h1>
        <p className="text-muted-foreground mt-1">Review aging and settle outstanding documents through payment allocations.</p>
      </div>

      <Tabs defaultValue="receivables" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
        </TabsList>

        <TabsContent value="receivables" className="space-y-4">
          <Card className="p-4 bg-info/10 border-info/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Outstanding Receivables</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalReceivables)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Bucket</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(receivablesAging?.buckets?.current || 0)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">91+ Days</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(receivablesAging?.buckets?.days_91_plus || 0)}</p>
              </div>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Invoice No.</TableHead>
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                  <TableHead className="font-semibold">Customer Balance</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Age</TableHead>
                  <TableHead className="font-semibold text-right">Settlement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No receivables found.</TableCell>
                  </TableRow>
                ) : receivables.map((item) => (
                  <TableRow key={item.document_id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{item.document_no}</TableCell>
                    <TableCell>{item.customer_name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(item.document_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-600">{formatCurrency(item.outstanding_amount)}</TableCell>
                    <TableCell>{formatCurrency(customerBalances[item.customer_id || ""] || item.outstanding_amount)}</TableCell>
                    <TableCell>{formatDate(item.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={item.days_overdue > 0 ? "destructive" : "secondary"} className="capitalize">
                        {item.days_overdue > 0 ? `${item.days_overdue}d overdue` : "Current"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPaymentDialog({
                          mode: "incoming",
                          document_id: item.document_id,
                          counterparty_id: item.customer_id,
                          counterparty_name: item.customer_name,
                          document_no: item.document_no,
                          outstanding_amount: item.outstanding_amount,
                        })}
                      >
                        Record Receipt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payables" className="space-y-4">
          <Card className="p-4 bg-warning/10 border-warning/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Outstanding Payables</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalPayables)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Bucket</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(payablesAging?.buckets?.current || 0)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">91+ Days</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(payablesAging?.buckets?.days_91_plus || 0)}</p>
              </div>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Bill No.</TableHead>
                  <TableHead className="font-semibold">Vendor Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                  <TableHead className="font-semibold">Vendor Balance</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Age</TableHead>
                  <TableHead className="font-semibold text-right">Settlement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payables found.</TableCell>
                  </TableRow>
                ) : payables.map((item) => (
                  <TableRow key={item.document_id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{item.document_no}</TableCell>
                    <TableCell>{item.vendor_name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(item.document_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{formatCurrency(item.outstanding_amount)}</TableCell>
                    <TableCell>{formatCurrency(vendorBalances[item.vendor_id || ""] || item.outstanding_amount)}</TableCell>
                    <TableCell>{formatDate(item.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={item.days_overdue > 0 ? "destructive" : "secondary"} className="capitalize">
                        {item.days_overdue > 0 ? `${item.days_overdue}d overdue` : "Current"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPaymentDialog({
                          mode: "outgoing",
                          document_id: item.document_id,
                          counterparty_id: item.vendor_id,
                          counterparty_name: item.vendor_name,
                          document_no: item.document_no,
                          outstanding_amount: item.outstanding_amount,
                        })}
                      >
                        Record Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(paymentTarget)} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{paymentTarget?.mode === "incoming" ? "Record Customer Receipt" : "Record Vendor Payment"}</DialogTitle>
          </DialogHeader>
          {paymentTarget && (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Document</Label>
                    <Input value={paymentTarget.document_no} disabled />
                  </div>
                  <div className="grid gap-2">
                    <Label>Outstanding</Label>
                    <Input value={formatCurrency(paymentTarget.outstanding_amount)} disabled />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>{paymentTarget.mode === "incoming" ? "Customer" : "Vendor"}</Label>
                  <Input value={paymentTarget.counterparty_name} disabled />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Date</Label>
                    <Input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Amount</Label>
                    <Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Method</Label>
                    <Select value={paymentForm.method} onValueChange={(value) => setPaymentForm({ ...paymentForm, method: value, bank_account_id: value === "cash" ? "" : paymentForm.bank_account_id })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="wallet">Wallet</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {paymentForm.method !== "cash" && (
                    <div className="grid gap-2">
                      <Label>Bank Account</Label>
                      <Select value={paymentForm.bank_account_id} onValueChange={(value) => setPaymentForm({ ...paymentForm, bank_account_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                          {bankAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.account_name}{account.bank_name ? ` - ${account.bank_name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Reference</Label>
                  <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional notes..." />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Posting..." : "Post Payment"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

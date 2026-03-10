import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { useReceivables } from "@/hooks/useReceivables";
import { usePayables } from "@/hooks/usePayables";

const Receivables = () => {
  const { receivables, isLoading: receivablesLoading, markAsPaid: markReceivableAsPaid } = useReceivables();
  const { payables, isLoading: payablesLoading, markAsPaid: markPayableAsPaid } = usePayables();

  const totalReceivables = receivables
    .filter(item => item.status !== "Paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  
  const totalPayables = payables
    .filter(item => item.status !== "Paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const isLoading = receivablesLoading || payablesLoading;

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
        <p className="text-muted-foreground mt-1">Track outstanding payments and bills</p>
      </div>

      <Tabs defaultValue="receivables" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
        </TabsList>

        <TabsContent value="receivables" className="space-y-4">
          <Card className="p-4 bg-info/10 border-info/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Outstanding Receivables</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalReceivables)}</p>
              </div>
              <Badge variant="secondary">{receivables.filter(r => r.status !== "Paid").length} invoices pending</Badge>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Invoice ID</TableHead>
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No receivables found.
                    </TableCell>
                  </TableRow>
                ) : (
                  receivables.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{item.invoice_id}</TableCell>
                      <TableCell>{item.client_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>{formatDate(item.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "Overdue" ? "destructive" : item.status === "Paid" ? "default" : "secondary"} className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {item.status !== "Paid" && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2"
                              onClick={() => markReceivableAsPaid(item.id)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Mark as Paid
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payables" className="space-y-4">
          <Card className="p-4 bg-warning/10 border-warning/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Outstanding Payables</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalPayables)}</p>
              </div>
              <Badge variant="secondary">{payables.filter(p => p.status !== "Paid").length} bills pending</Badge>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Bill ID</TableHead>
                  <TableHead className="font-semibold">Vendor Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No payables found.
                    </TableCell>
                  </TableRow>
                ) : (
                  payables.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{item.invoice_id}</TableCell>
                      <TableCell>{item.vendor_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>{formatDate(item.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "Overdue" ? "destructive" : item.status === "Paid" ? "default" : "secondary"} className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {item.status !== "Paid" && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2"
                              onClick={() => markPayableAsPaid(item.id)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Mark as Paid
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Receivables;

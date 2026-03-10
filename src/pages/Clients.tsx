import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { useClients } from "@/hooks/useClients";

const Clients = () => {
  const { salesClients, purchaseVendors, isLoading } = useClients();

  const totalOutstandingReceivables = salesClients.reduce((sum, c) => sum + c.outstanding_amount, 0);
  const totalOutstandingPayables = purchaseVendors.reduce((sum, v) => sum + v.outstanding_amount, 0);
  const totalPendingInvoices = salesClients.reduce((sum, c) => sum + c.pending_invoices, 0);
  const totalPendingPayables = purchaseVendors.reduce((sum, v) => sum + v.pending_payables, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients & Vendors</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
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
        <h1 className="text-3xl font-bold text-foreground">Clients & Vendors</h1>
        <p className="text-muted-foreground mt-1">Track your sales clients and purchase vendors</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sales Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesClients.length}</div>
            <p className="text-xs text-muted-foreground">Active clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Receivables</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalOutstandingReceivables)}</div>
            <p className="text-xs text-muted-foreground">{totalPendingInvoices} pending invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Purchase Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseVendors.length}</div>
            <p className="text-xs text-muted-foreground">Active vendors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Payables</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstandingPayables)}</div>
            <p className="text-xs text-muted-foreground">{totalPendingPayables} pending payables</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Sales Clients</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold text-center">Total Invoices</TableHead>
                  <TableHead className="font-semibold text-right">Total Amount</TableHead>
                  <TableHead className="font-semibold text-right">Paid</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No sales clients yet. Create your first invoice to see clients here.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesClients.map((client) => (
                    <TableRow key={client.client_name} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{client.client_name}</TableCell>
                      <TableCell className="text-center">{client.total_invoices}</TableCell>
                      <TableCell className="text-right">{formatCurrency(client.total_amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(client.paid_amount)}</TableCell>
                      <TableCell className="text-right text-amber-600">{formatCurrency(client.outstanding_amount)}</TableCell>
                      <TableCell className="text-center">
                        {client.pending_invoices > 0 ? (
                          <Badge variant="secondary">{client.pending_invoices} pending</Badge>
                        ) : (
                          <Badge variant="default">All paid</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Vendor Name</TableHead>
                  <TableHead className="font-semibold text-center">Total Payables</TableHead>
                  <TableHead className="font-semibold text-right">Total Amount</TableHead>
                  <TableHead className="font-semibold text-right">Paid</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No vendors yet. Add inventory on credit to see vendors here.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseVendors.map((vendor) => (
                    <TableRow key={vendor.vendor_name} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                      <TableCell className="text-center">{vendor.total_payables}</TableCell>
                      <TableCell className="text-right">{formatCurrency(vendor.total_amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(vendor.paid_amount)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(vendor.outstanding_amount)}</TableCell>
                      <TableCell className="text-center">
                        {vendor.pending_payables > 0 ? (
                          <Badge variant="destructive">{vendor.pending_payables} pending</Badge>
                        ) : (
                          <Badge variant="default">All paid</Badge>
                        )}
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

export default Clients;

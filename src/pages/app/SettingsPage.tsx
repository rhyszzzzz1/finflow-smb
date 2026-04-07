import { useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useKYCStatus } from "@/hooks/useKYCStatus";
import { LoadingState } from "@/components/accounting/LoadingState";

export const SettingsPage = () => {
  const { settings, isLoading } = useCompanySettings();
  const { kycStatus, rejectionReason, businessName } = useKYCStatus();
  const [formData, setFormData] = useState({
    companyName: settings.company_name,
    gstNumber: settings.gst_number,
    address: settings.address,
  });

  if (isLoading) {
    return <LoadingState title="Settings" message="Loading company settings..." />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Company profile and project-level compliance visibility.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            KYC Verification Status
            {kycStatus === "approved" && <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>}
            {kycStatus === "pending" && <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
            {kycStatus === "rejected" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>}
          </CardTitle>
          <CardDescription>Your business verification status in the shared platform context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {businessName ? <p className="font-medium">{businessName}</p> : null}
          {kycStatus === "rejected" && rejectionReason ? (
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-sm">
              <p className="font-medium">Rejection Reason: {rejectionReason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Read-only frontend alignment for the current project setup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input id="company-name" value={formData.companyName} onChange={(event) => setFormData((current) => ({ ...current, companyName: event.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gst">GST/VAT Number</Label>
            <Input id="gst" value={formData.gstNumber} onChange={(event) => setFormData((current) => ({ ...current, gstNumber: event.target.value }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Business Address</Label>
            <Input id="address" value={formData.address} onChange={(event) => setFormData((current) => ({ ...current, address: event.target.value }))} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useKYCStatus } from "@/hooks/useKYCStatus";
import { CheckCircle, Clock, XCircle, FileText } from "lucide-react";

const Settings = () => {
  const { user } = useAuth();
  const { settings, isLoading, saveSettings } = useCompanySettings();
  const { kycStatus, rejectionReason, businessName, documents, isLoading: kycLoading } = useKYCStatus();
  
  const [formData, setFormData] = useState({
    companyName: settings.company_name,
    gstNumber: settings.gst_number,
    address: settings.address,
    currency: settings.currency.toLowerCase(),
    financialYear: "april",
    email: user?.email || "",
    phone: "",
    dateFormat: "dd-mm-yyyy",
    timezone: "npt",
  });

  // Update form when settings load
  useState(() => {
    if (!isLoading) {
      setFormData((prev) => ({
        ...prev,
        companyName: settings.company_name,
        gstNumber: settings.gst_number,
        address: settings.address,
        currency: settings.currency.toLowerCase(),
      }));
    }
  });

  const handleSave = async () => {
    await saveSettings({
      company_name: formData.companyName,
      gst_number: formData.gstNumber,
      address: formData.address,
      currency: formData.currency.toUpperCase(),
      region: settings.region,
    });
  };

  const handleReset = () => {
    setFormData({
      companyName: "My Business",
      gstNumber: "",
      address: "Kathmandu, Nepal",
      currency: "npr",
      financialYear: "april",
      email: user?.email || "",
      phone: "",
      dateFormat: "dd-mm-yyyy",
      timezone: "npt",
    });
    toast.success("Settings reset to default");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Loading settings...</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your company information and preferences</p>
      </div>

      {/* KYC Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            KYC Verification Status
            {kycStatus === 'approved' && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Approved
              </Badge>
            )}
            {kycStatus === 'pending' && (
              <Badge className="bg-yellow-100 text-yellow-800">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            )}
            {kycStatus === 'rejected' && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Rejected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Your business verification status and submitted documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {businessName && (
            <div>
              <Label className="text-muted-foreground">Business Name</Label>
              <p className="font-medium">{businessName}</p>
            </div>
          )}
          
          {kycStatus === 'rejected' && rejectionReason && (
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive font-medium">Rejection Reason:</p>
              <p className="text-sm text-destructive/80">{rejectionReason}</p>
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <Label className="text-muted-foreground">Submitted Documents</Label>
              <div className="mt-2 space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 text-sm p-2 bg-muted/30 rounded">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    <span className="text-muted-foreground">- {doc.file_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kycStatus === 'pending' && (
            <p className="text-sm text-muted-foreground">
              Your documents are being reviewed. You will be notified once verification is complete.
            </p>
          )}

          {kycStatus === 'approved' && (
            <p className="text-sm text-green-600">
              Your business verification is complete. You have full access to all features.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Update your business details and tax information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              placeholder="Enter company name"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gst-number">GST/VAT Number</Label>
            <Input
              id="gst-number"
              placeholder="Enter GST/VAT number"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Business Address</Label>
            <Input
              id="address"
              placeholder="Enter business address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="npr">Nepali Rupee (NPR)</SelectItem>
                  <SelectItem value="inr">Indian Rupee (₹)</SelectItem>
                  <SelectItem value="usd">US Dollar ($)</SelectItem>
                  <SelectItem value="eur">Euro (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="financial-year">Financial Year Start</Label>
              <Select
                value={formData.financialYear}
                onValueChange={(value) => setFormData({ ...formData, financialYear: value })}
              >
                <SelectTrigger id="financial-year">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="january">January</SelectItem>
                  <SelectItem value="april">April</SelectItem>
                  <SelectItem value="july">July</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Contact Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Contact Phone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="Enter phone number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleReset}>Reset</Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your application experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="date-format">Date Format</Label>
            <Select
              value={formData.dateFormat}
              onValueChange={(value) => setFormData({ ...formData, dateFormat: value })}
            >
              <SelectTrigger id="date-format">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd-mm-yyyy">DD/MM/YYYY (Nepali Standard)</SelectItem>
                <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) => setFormData({ ...formData, timezone: value })}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="npt">Nepal Time (NPT - Asia/Kathmandu)</SelectItem>
                <SelectItem value="ist">India Standard Time (IST)</SelectItem>
                <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={handleReset}>Reset to Default</Button>
            <Button onClick={handleSave}>Save Preferences</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;

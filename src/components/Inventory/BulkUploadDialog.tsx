import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, AlertCircle, CheckCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = "http://localhost:5000";

interface ProductRow {
  product_name: string;
  sku: string;
  stock_quantity: number;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  category: string;
  payment_type: string;
  vendor_name: string;
  description: string;
  status: string;
  errors: string[];
  isValid: boolean;
}

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  existingSkus: string[];
}

const VALID_PAYMENT_TYPES = ["cash", "credit"];

const normalizePaymentType = (value: string): string => {
  const lower = value?.toLowerCase().trim() || "";
  if (lower.includes("cash") || lower === "cash") return "cash";
  if (lower.includes("credit") || lower.includes("card") || lower.includes("online")) return "credit";
  return "cash";
};

export const BulkUploadDialog = ({ open, onOpenChange, onSuccess, existingSkus }: BulkUploadDialogProps) => {
  const { session } = useAuth();
  const [parsedData, setParsedData] = useState<ProductRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number } | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");

  const validateRow = useCallback((row: any, index: number, skusSeen: Set<string>): ProductRow => {
    const errors: string[] = [];

    const productName = row["Product Name"] || row["product_name"] || row["Product name"] || "";
    const sku = row["SKU"] || row["sku"] || "";
    const stockQty = Number(row["Stock Quantity"] || row["stock_quantity"] || row["Stock quantity"] || 0);
    const purchasePrice = Number(row["Purchase Price"] || row["purchase_price"] || 0);
    const sellingPrice = Number(row["Selling Price"] || row["selling_price"] || 0);
    const taxRate = Number(row["Tax Rate"] || row["tax_rate"] || row["Tax Rate (%)"] || 0);
    const category = row["Category"] || row["category"] || "";
    const paymentType = row["Payment Type"] || row["payment_type"] || row["Payment type"] || "cash";
    const vendorName = row["Vendor Name"] || row["vendor_name"] || row["Supplier Name"] || "";
    const description = row["Description"] || row["description"] || row["Product Description"] || "";
    const status = row["Status"] || row["status"] || "Active";

    if (!productName?.trim()) errors.push("Product Name is required");
    if (!sku?.trim()) errors.push("SKU is required");

    if (sku && existingSkus.includes(sku)) {
      errors.push("SKU already exists in inventory");
    }
    if (sku && skusSeen.has(sku)) {
      errors.push("Duplicate SKU in this upload");
    }
    if (sku) skusSeen.add(sku);

    if (isNaN(stockQty) || stockQty < 0 || !Number.isInteger(stockQty)) {
      errors.push("Stock Quantity must be a non-negative integer");
    }
    if (isNaN(purchasePrice) || purchasePrice < 0) {
      errors.push("Purchase Price must be a non-negative number");
    }
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      errors.push("Selling Price must be a non-negative number");
    }
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      errors.push("Tax Rate must be between 0 and 100");
    }

    return {
      product_name: productName?.trim() || "",
      sku: sku?.trim() || "",
      stock_quantity: Math.max(0, Math.floor(stockQty)),
      purchase_price: Math.max(0, purchasePrice),
      selling_price: Math.max(0, sellingPrice),
      tax_rate: Math.max(0, Math.min(100, taxRate)),
      category: category?.trim() || "",
      payment_type: normalizePaymentType(paymentType),
      vendor_name: vendorName?.trim() || "",
      description: description?.trim() || "",
      status: status?.trim() || "Active",
      errors,
      isValid: errors.length === 0,
    };
  }, [existingSkus]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast.error("No data found in the file");
          return;
        }

        const skusSeen = new Set<string>();
        const validated = jsonData.map((row, index) => validateRow(row, index, skusSeen));
        setParsedData(validated);
        setStep("preview");
      } catch (error) {
        toast.error("Failed to parse Excel file");
        console.error(error);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [validateRow]);

  const handleUpload = async () => {
    if (!session?.token) {
      toast.error("Not authenticated");
      return;
    }

    const validRows = parsedData.filter(row => row.isValid);
    if (validRows.length === 0) {
      toast.error("No valid rows to upload");
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let failedCount = 0;

    // Insert one by one (backend doesn't have a bulk insert endpoint)
    for (const row of validRows) {
      try {
        const res = await fetch(`${API_BASE}/api/inventory`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            product_name: row.product_name,
            sku: row.sku,
            stock_quantity: row.stock_quantity,
            purchase_price: row.purchase_price,
            selling_price: row.selling_price,
            tax_rate: row.tax_rate,
            category: row.category || null,
            payment_type: row.payment_type,
            vendor_name: row.vendor_name || null,
            description: row.description || null,
          }),
        });

        if (res.ok) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    const invalidCount = parsedData.filter(row => !row.isValid).length;
    setUploadResult({
      success: successCount,
      failed: failedCount + invalidCount
    });
    setStep("result");
    setIsUploading(false);

    if (successCount > 0) {
      onSuccess();
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        "Product Name": "Example Product",
        "SKU": "PRD-001",
        "Stock Quantity": 100,
        "Purchase Price": 50.00,
        "Selling Price": 75.00,
        "Tax Rate": 13,
        "Category": "Electronics",
        "Payment Type": "Cash",
        "Vendor Name": "ABC Supplies",
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "product_upload_template.xlsx");
    toast.success("Template downloaded");
  };

  const downloadErrorReport = () => {
    const errorRows = parsedData.filter(row => !row.isValid).map(row => ({
      "Product Name": row.product_name,
      "SKU": row.sku,
      "Stock Quantity": row.stock_quantity,
      "Purchase Price": row.purchase_price,
      "Selling Price": row.selling_price,
      "Tax Rate": row.tax_rate,
      "Category": row.category,
      "Payment Type": row.payment_type,
      "Vendor Name": row.vendor_name,
      "Errors": row.errors.join("; "),
    }));

    const ws = XLSX.utils.json_to_sheet(errorRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "upload_errors.xlsx");
    toast.success("Error report downloaded");
  };

  const resetDialog = () => {
    setParsedData([]);
    setUploadResult(null);
    setStep("upload");
  };

  const handleClose = () => {
    resetDialog();
    onOpenChange(false);
  };

  const validCount = parsedData.filter(row => row.isValid).length;
  const invalidCount = parsedData.filter(row => !row.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Bulk Upload Products"}
            {step === "preview" && "Preview & Validate"}
            {step === "result" && "Upload Complete"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Upload an Excel file (.xlsx) with your products
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="bulk-upload-input"
              />
              <label htmlFor="bulk-upload-input">
                <Button asChild>
                  <span>Select File</span>
                </Button>
              </label>
            </div>

            <div className="flex items-center justify-center">
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="w-4 h-4" />
                Download Template
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <p className="font-medium mb-2">Required columns:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Product Name</li>
                <li>SKU (must be unique)</li>
                <li>Stock Quantity (non-negative integer)</li>
                <li>Purchase Price (non-negative number)</li>
                <li>Selling Price (non-negative number)</li>
              </ul>
              <p className="font-medium mt-4 mb-2">Optional columns:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Tax Rate (0-100, defaults to 0)</li>
                <li>Category</li>
                <li>Payment Type (Cash or Credit)</li>
                <li>Vendor Name</li>
              </ul>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                {validCount} valid
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {invalidCount} with errors
                </Badge>
              )}
            </div>

            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8">Status</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Selling</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((row, index) => (
                    <TableRow
                      key={index}
                      className={!row.isValid ? "bg-destructive/10" : ""}
                    >
                      <TableCell>
                        {row.isValid ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <X className="w-4 h-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{row.product_name || "-"}</TableCell>
                      <TableCell>{row.sku || "-"}</TableCell>
                      <TableCell>{row.stock_quantity}</TableCell>
                      <TableCell>{row.purchase_price}</TableCell>
                      <TableCell>{row.selling_price}</TableCell>
                      <TableCell>{row.vendor_name || "-"}</TableCell>
                      <TableCell className="text-destructive text-xs max-w-[200px]">
                        {row.errors.join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between pt-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                {invalidCount > 0 && (
                  <Button variant="outline" onClick={downloadErrorReport} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download Errors
                  </Button>
                )}
              </div>
              <Button
                onClick={handleUpload}
                disabled={validCount === 0 || isUploading}
                className="gap-2"
              >
                {isUploading ? "Uploading..." : `Upload ${validCount} Products`}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && uploadResult && (
          <div className="py-8 text-center space-y-6">
            <div className="flex justify-center gap-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-green-500">{uploadResult.success}</div>
                <div className="text-muted-foreground">Uploaded</div>
              </div>
              {uploadResult.failed > 0 && (
                <div className="text-center">
                  <div className="text-4xl font-bold text-destructive">{uploadResult.failed}</div>
                  <div className="text-muted-foreground">Failed</div>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              {uploadResult.failed > 0 && (
                <Button variant="outline" onClick={downloadErrorReport} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download Error Report
                </Button>
              )}
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

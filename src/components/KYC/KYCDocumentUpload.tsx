import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface DocumentFile {
  file: File | null;
  name: string;
}

interface KYCDocumentUploadProps {
  documents: {
    citizenship: DocumentFile;
    panVat: DocumentFile;
    companyRegistration: DocumentFile;
    supportingDoc: DocumentFile;
  };
  setDocuments: React.Dispatch<React.SetStateAction<{
    citizenship: DocumentFile;
    panVat: DocumentFile;
    companyRegistration: DocumentFile;
    supportingDoc: DocumentFile;
  }>>;
  businessName: string;
  setBusinessName: React.Dispatch<React.SetStateAction<string>>;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

export const KYCDocumentUpload = ({ 
  documents, 
  setDocuments, 
  businessName, 
  setBusinessName 
}: KYCDocumentUploadProps) => {
  
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    docType: keyof typeof documents
  ) => {
    const file = e.target.files?.[0];
    
    if (!file) return;
    
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Invalid file type. Please upload PDF, JPG, or PNG files only.");
      return;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 5MB limit.");
      return;
    }
    
    setDocuments(prev => ({
      ...prev,
      [docType]: { file, name: file.name }
    }));
  };

  const removeFile = (docType: keyof typeof documents) => {
    setDocuments(prev => ({
      ...prev,
      [docType]: { file: null, name: "" }
    }));
  };

  const DocumentInput = ({ 
    id, 
    label, 
    docType, 
    required = true 
  }: { 
    id: string; 
    label: string; 
    docType: keyof typeof documents; 
    required?: boolean;
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
        {!required && <span className="text-muted-foreground text-xs">(Optional)</span>}
      </Label>
      
      {documents[docType].file ? (
        <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1 truncate">{documents[docType].name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeFile(docType)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={id}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, docType)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => document.getElementById(id)?.click()}
          >
            <Upload className="h-4 w-4" />
            Choose file (PDF, JPG, PNG - Max 5MB)
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 border-t pt-6 mt-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Business Verification (KYC)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Please upload the required documents below. Your account will be verified by our team 
          before you can access all features.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="business-name">
          Business Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="business-name"
          type="text"
          placeholder="Enter your business/company name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
      </div>

      <DocumentInput
        id="citizenship"
        label="Citizenship / National ID"
        docType="citizenship"
      />

      <DocumentInput
        id="pan-vat"
        label="PAN / VAT Registration Card"
        docType="panVat"
      />

      <DocumentInput
        id="company-registration"
        label="Company Registration Certificate"
        docType="companyRegistration"
      />

      <DocumentInput
        id="supporting-doc"
        label="Supporting Document"
        docType="supportingDoc"
        required={false}
      />

      <p className="text-xs text-muted-foreground">
        Accepted formats: PDF, JPG, PNG. Maximum file size: 5MB per document.
      </p>
    </div>
  );
};

import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { KYCDocumentUpload } from "@/components/KYC/KYCDocumentUpload";
import { kycApi, settingsApi } from "@/services/api";

interface DocumentFile {
  file: File | null;
  name: string;
}

const Signup = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documents, setDocuments] = useState<{
    citizenship: DocumentFile;
    panVat: DocumentFile;
    companyRegistration: DocumentFile;
    supportingDoc: DocumentFile;
  }>({
    citizenship: { file: null, name: "" },
    panVat: { file: null, name: "" },
    companyRegistration: { file: null, name: "" },
    supportingDoc: { file: null, name: "" },
  });

  const { isAuthenticated, signup } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    // Validate required documents
    if (!documents.citizenship.file || !documents.panVat.file || !documents.companyRegistration.file) {
      toast.error("Please upload all required KYC documents");
      return;
    }

    if (!businessName.trim()) {
      toast.error("Please enter your business name");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create user account
      // Note: This sets the auth token in localStorage on success!
      const signUpSuccess = await signup(name, email, password);

      if (!signUpSuccess) {
        setIsSubmitting(false);
        return;
      }

      // 2. Set company name settings
      try {
        await settingsApi.save({
          company_name: businessName
        });
      } catch (e) {
        console.error("Failed to set company name", e);
      }

      // 3. Upload KYC documents
      const documentUploads = [];

      if (documents.citizenship.file) {
        documentUploads.push(kycApi.uploadDocument(documents.citizenship.file, 'citizenship'));
      }
      if (documents.panVat.file) {
        documentUploads.push(kycApi.uploadDocument(documents.panVat.file, 'pan_vat'));
      }
      if (documents.companyRegistration.file) {
        documentUploads.push(kycApi.uploadDocument(documents.companyRegistration.file, 'company_registration'));
      }
      if (documents.supportingDoc.file) {
        documentUploads.push(kycApi.uploadDocument(documents.supportingDoc.file, 'supporting_document'));
      }

      await Promise.all(documentUploads);

      toast.success(
        "Account created successfully! Your documents have been submitted for verification. You will gain full access once approved.",
        { duration: 6000 }
      );

      // Navigate is already called inside AuthContext.signup, but we can do it here too just in case
      navigate("/");
    } catch (err) {
      toast.error("Failed to complete account setup. Please try uploading KYC documents individually later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Create an Account</CardTitle>
          <CardDescription className="text-center">
            Sign up to start managing your business with FinTrac
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password <span className="text-destructive">*</span></Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <KYCDocumentUpload
              documents={documents}
              setDocuments={setDocuments}
              businessName={businessName}
              setBusinessName={setBusinessName}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;

import { useState, useEffect } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { KYCDocumentUpload } from "@/components/KYC/KYCDocumentUpload";

const API_BASE = "http://localhost:5001";

interface DocumentFile {
  file: File | null;
  name: string;
}

interface EmailStatusResponse {
  configured: boolean;
  provider: string;
  host: string | null;
  port: number | null;
  secure: boolean;
  from: string | null;
  missing: string[];
}

// ============================================
// LOGIN PAGE
// ============================================
export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const { login, isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password, rememberMe);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <LogIn className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Welcome to FinTrac</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to manage your business
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label
                  htmlFor="remember"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Remember me
                </label>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="link" className="px-0 text-sm">
                    Forgot password?
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Password reset functionality is coming soon. Please contact support for assistance.
                  </p>
                </DialogContent>
              </Dialog>
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================
// SIGNUP PAGE
// ============================================
export const Signup = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
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

  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadEmailStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/system/email-status`);
        if (!response.ok) return;
        const data = await response.json();
        setEmailStatus(data);
      } catch {
        // Ignore status probe failures and let signup request surface the error if needed.
      }
    };

    loadEmailStatus();
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const uploadDocumentToBackend = async (token: string, userId: string, docType: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", docType);

    const response = await fetch(`${API_BASE}/api/kyc/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Document upload failed");
    }
    return response.json();
  };

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
      if (!isOtpSent) {
        if (emailStatus && !emailStatus.configured) {
          const isGmail = emailStatus.provider === "gmail";
          toast.error(
            isGmail
              ? "Gmail verification is not configured on the backend yet. Add GMAIL_USER and GMAIL_APP_PASSWORD to enable signup."
              : "Email verification is not configured on the backend yet."
          );
          return;
        }

        const signupRes = await fetch(`${API_BASE}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, businessName }),
        });

        const signupData = await signupRes.json();

        if (!signupRes.ok) {
          toast.error(signupData.message || "Failed to send verification code");
          return;
        }

        setIsOtpSent(true);
        toast.success("OTP sent to your email. Enter it below to complete your signup.");
        return;
      }

      if (!otp.trim()) {
        toast.error("Please enter the OTP sent to your email");
        return;
      }

      const verifyRes = await fetch(`${API_BASE}/api/auth/verify-signup-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        toast.error(verifyData.message || "Failed to verify OTP");
        return;
      }

      const { token, user } = verifyData;
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_user", JSON.stringify(user));

      const uploads: Promise<unknown>[] = [];
      if (documents.citizenship.file)
        uploads.push(uploadDocumentToBackend(token, user.id, "citizenship", documents.citizenship.file));
      if (documents.panVat.file)
        uploads.push(uploadDocumentToBackend(token, user.id, "pan_vat", documents.panVat.file));
      if (documents.companyRegistration.file)
        uploads.push(uploadDocumentToBackend(token, user.id, "company_registration", documents.companyRegistration.file));
      if (documents.supportingDoc.file)
        uploads.push(uploadDocumentToBackend(token, user.id, "supporting_document", documents.supportingDoc.file));

      await Promise.all(uploads);

      toast.success(
        "Account created successfully! Your documents have been submitted for verification. You will gain full access once approved by the administrator.",
        { duration: 6000 }
      );

      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete signup. Please try again.");
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
                disabled={isSubmitting || isOtpSent}
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
                disabled={isSubmitting || isOtpSent}
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
                disabled={isSubmitting || isOtpSent}
              />
            </div>

            {isOtpSent && (
              <div className="space-y-2">
                <Label htmlFor="otp">Email OTP <span className="text-destructive">*</span></Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="Enter the 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  We sent a verification code to {email}. Verify it to create your account.
                </p>
              </div>
            )}

            {!isOtpSent && emailStatus && !emailStatus.configured && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Email signup is waiting for backend Gmail configuration.
              </div>
            )}

            <KYCDocumentUpload
              documents={documents}
              setDocuments={setDocuments}
              businessName={businessName}
              setBusinessName={setBusinessName}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (isOtpSent ? "Verifying OTP..." : "Sending OTP...") : (isOtpSent ? "Verify OTP & Create Account" : "Send OTP")}
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

// ============================================
// ADMIN LOGIN PAGE
// ============================================
export const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // If already logged in as admin, redirect
    const adminToken = localStorage.getItem("admin_token");
    if (adminToken) {
      navigate("/admin");
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Invalid credentials");
        return;
      }

      localStorage.setItem("admin_token", data.token);
      toast.success("Admin login successful");
      navigate("/admin");
    } catch {
      toast.error("An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Admin Portal</CardTitle>
          <CardDescription className="text-center">
            Sign in to access the KYC verification dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter admin email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-muted-foreground">
            This admin portal is for KYC verification purposes only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

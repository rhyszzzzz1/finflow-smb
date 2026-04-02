import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Shield, LogOut, Eye, CheckCircle, XCircle, Download, FileText, Image } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const API_BASE = "http://localhost:5001";

interface KYCUser {
  id: string;
  name: string;
  email: string;
  business_name: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  rejection_reason: string | null;
}

interface KYCDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
}

// ============================================
// ADMIN DASHBOARD PAGE
// ============================================
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<KYCUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<KYCUser | null>(null);
  const [userDocuments, setUserDocuments] = useState<KYCDocument[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [isAdminVerified, setIsAdminVerified] = useState(false);

  const getAdminToken = () => localStorage.getItem("admin_token");

  const adminFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = getAdminToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  }, []);

  useEffect(() => {
    const verifyAdminAccess = async () => {
      const token = getAdminToken();
      if (!token) {
        navigate("/admin/login");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/admin/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          localStorage.removeItem("admin_token");
          navigate("/admin/login");
          return;
        }
        setIsAdminVerified(true);
      } catch {
        toast.error("Failed to verify admin access");
        navigate("/admin/login");
      }
    };

    verifyAdminAccess();
  }, [navigate]);

  const fetchUsers = useCallback(async () => {
    if (!isAdminVerified) return;

    setIsLoading(true);
    try {
      const params = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const res = await adminFetch(`${API_BASE}/api/admin/kyc/users${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error("Failed to load users");
      } else {
        setUsers(data || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAdminVerified, filterStatus, adminFetch]);

  useEffect(() => {
    if (isAdminVerified) {
      fetchUsers();
    }
  }, [fetchUsers]);

  const fetchUserDocuments = async (userId: string) => {
    const res = await adminFetch(`${API_BASE}/api/admin/kyc/documents/${userId}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error("Failed to load documents");
    } else {
      setUserDocuments(data || []);
    }
  };

  const handleViewUser = async (user: KYCUser) => {
    setSelectedUser(user);
    await fetchUserDocuments(user.id);
    setIsDetailOpen(true);
    setRejectionReason("");
  };

  const handleApprove = async () => {
    if (!selectedUser) return;

    setIsProcessing(true);
    try {
      const res = await adminFetch(`${API_BASE}/api/admin/kyc/approve/${selectedUser.id}`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error("Failed to approve");

      toast.success(`KYC approved for ${selectedUser.name}`);
      setIsDetailOpen(false);
      fetchUsers();
    } catch {
      toast.error("Failed to approve KYC");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUser) return;

    setIsProcessing(true);
    try {
      const res = await adminFetch(`${API_BASE}/api/admin/kyc/reject/${selectedUser.id}`, {
        method: "PUT",
        body: JSON.stringify({
          rejectionReason: rejectionReason || "Documents did not meet verification requirements",
        }),
      });
      if (!res.ok) throw new Error("Failed to reject");

      toast.success(`KYC rejected for ${selectedUser.name}`);
      setIsDetailOpen(false);
      fetchUsers();
    } catch {
      toast.error("Failed to reject KYC");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewDocument = (doc: KYCDocument) => {
    // Documents are served from the backend /uploads directory
    const url = `${API_BASE}${doc.file_path}`;
    window.open(url, "_blank");
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    toast.success("Logged out successfully");
    navigate("/admin/login");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      default:
        return <Badge variant="secondary">Not Submitted</Badge>;
    }
  };

  const formatDocumentType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (!isAdminVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Admin Dashboard</h1>
                <p className="text-xs text-muted-foreground">KYC Verification Panel</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>KYC Verification Queue</CardTitle>
                <CardDescription>Review and verify user KYC documents</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'pending' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('pending')}
                >
                  Pending
                </Button>
                <Button
                  variant={filterStatus === 'approved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('approved')}
                >
                  Approved
                </Button>
                <Button
                  variant={filterStatus === 'rejected' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('rejected')}
                >
                  Rejected
                </Button>
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No users found with {filterStatus === 'all' ? 'any' : filterStatus} KYC status.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Date Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.business_name || "-"}</TableCell>
                      <TableCell>
                        {user.submitted_at
                          ? format(new Date(user.submitted_at), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewUser(user)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground mt-8">
          This verification system is for academic demonstration purposes only.
        </p>
      </main>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KYC Verification Details</DialogTitle>
            <DialogDescription>
              Review user information and uploaded documents
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedUser.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedUser.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Business Name</p>
                  <p className="font-medium">{selectedUser.business_name || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Status</p>
                  {getStatusBadge(selectedUser.status)}
                </div>
                {selectedUser.rejection_reason && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Rejection Reason</p>
                    <p className="font-medium text-destructive">{selectedUser.rejection_reason}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium mb-3">Uploaded Documents</h4>
                {userDocuments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No documents uploaded</p>
                ) : (
                  <div className="space-y-2">
                    {userDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {doc.mime_type?.includes('image') ? (
                            <Image className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{formatDocumentType(doc.document_type)}</p>
                            <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDocument(doc)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedUser.status === 'pending' && (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason (if rejecting)</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Enter reason for rejection (optional)"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close
            </Button>
            {selectedUser?.status === 'pending' && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

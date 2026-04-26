# Khalti Payment Gateway Integration Guide

**Reference**: GitHub: https://github.com/khalti/khalti-sdk-web | Official Docs: docs.khalti.com

---

## Overview

This guide details how to integrate the **Khalti payment gateway** into your project using a production-ready **server-side redirect pattern**. This approach is based on a working implementation in the Yarn and Yonder Studio project.

### Why This Integration Approach?

The official Khalti SDK (`khalti-checkout-web` npm package) supports **two payment flow patterns**:

1. **Browser Widget Pattern** (from official SDK examples)
   - Pros: Simpler frontend
   - Cons: Requires public key on frontend, less control, harder to debug
   - **NOT recommended for production**

2. **Server-Side Redirect Pattern** (RECOMMENDED)
   - Pros: More secure, no public key exposure, better for order tracking
   - Cons: Requires backend integration
   - **PRODUCTION-READY & TESTED**

This guide uses the **server-side redirect pattern** which is proven, secure, and scalable.

---

## Architecture Overview

```
Frontend (React)
    ↓
[Pay with Khalti Button Click]
    ↓
Backend (.NET API)
    ↓
[POST /epayment/initiate/ to Khalti]
    ↓
Khalti Dev API
    ↓
[Return payment_url + pidx]
    ↓
[Redirect user to https://test-pay.khalti.com/?pidx=...]
    ↓
User completes payment on Khalti hosted page
    ↓
[Khalti redirects back to return_url with callback params]
    ↓
[Auto-verification hook on frontend]
    ↓
Backend verifies via /epayment/lookup/
    ↓
Order status updated to "Completed"
```

---

## PHASE 1: Backend Setup (.NET)

### Step 1.1: Create Payment DTOs

File: `DTOs/PaymentDTOs.cs`

Map all Khalti API contract types:

```csharp
// Request from frontend
public class KhaltiInitiatePaymentRequestDTO
{
    public string OrderId { get; set; }
    public decimal Amount { get; set; }
    public string OrderName { get; set; }
}

// Response to frontend (safe properties only)
public class KhaltiInitiatePaymentResponseDTO
{
    public string PaymentUrl { get; set; }  // URL to redirect user to
    public string Pidx { get; set; }        // Payment ID from Khalti
    public string ExpiresAt { get; set; }
    public int ExpiresIn { get; set; }      // Seconds
}

// **CRITICAL**: Map Khalti's snake_case raw response
[System.Text.Json.Serialization.JsonSerializable]
public sealed class KhaltiInitiateGatewayResponseDTO
{
    [System.Text.Json.Serialization.JsonPropertyName("pidx")]
    public string? Pidx { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("payment_url")]
    public string? PaymentUrl { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("expires_at")]
    public string? ExpiresAt { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("expires_in")]
    public int? ExpiresIn { get; set; }
}

// Callback verification request
public class KhaltiVerifyPaymentRequestDTO
{
    public string OrderId { get; set; }
    public string Pidx { get; set; }
    public string Status { get; set; }
    public string? TransactionId { get; set; }
}

// Lookup response from Khalti API
public sealed class KhaltiLookupGatewayResponseDTO
{
    [System.Text.Json.Serialization.JsonPropertyName("pidx")]
    public string? Pidx { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("transaction_id")]
    public string? TransactionId { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("status")]
    public string? Status { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("amount")]
    public decimal? Amount { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("mobile")]
    public string? Mobile { get; set; }
}
```

### Step 1.2: Create KhaltiPaymentService

File: `Services/KhaltiPaymentService.cs`

```csharp
public class KhaltiPaymentService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<KhaltiPaymentService> _logger;
    private readonly ApplicationDbContext _dbContext;

    public KhaltiPaymentService(
        HttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<KhaltiPaymentService> logger,
        ApplicationDbContext dbContext)
    {
        _httpClient = httpClientFactory.CreateClient();
        _configuration = configuration;
        _logger = logger;
        _dbContext = dbContext;
    }

    // STEP 1: Initiate payment
    public async Task<KhaltiInitiatePaymentResponseDTO> InitiateAsync(
        KhaltiInitiatePaymentRequestDTO request)
    {
        try
        {
            // Load config
            var publicKey = _configuration["Khalti:PublicKey"];
            var secretKey = _configuration["Khalti:SecretKey"];
            var apiBaseUrl = _configuration["Khalti:ApiBaseUrl"]; // https://dev.khalti.com/api/v2/
            var websiteUrl = _configuration["Khalti:WebsiteUrl"];

            if (string.IsNullOrEmpty(secretKey))
                throw new InvalidOperationException("Khalti SecretKey not configured");

            // Get order from DB
            var order = await _dbContext.Orders.FindAsync(request.OrderId);
            if (order == null)
                throw new KeyNotFoundException($"Order {request.OrderId} not found");

            // Prepare Khalti request
            var khaltiRequest = new
            {
                return_url = $"{websiteUrl}/orders/{request.OrderId}", // Khalti redirects here after payment
                website_url = websiteUrl,
                amount = (long)(request.Amount * 100), // Khalti expects paisa (amount * 100)
                purchase_order_id = request.OrderId,
                purchase_order_name = request.OrderName
            };

            // Call Khalti API
            var content = new StringContent(
                System.Text.Json.JsonSerializer.Serialize(khaltiRequest),
                System.Text.Encoding.UTF8,
                "application/json");

            // Add authorization header: "Key <secret_key>"
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Key", secretKey);

            var response = await _httpClient.PostAsync(
                $"{apiBaseUrl}epayment/initiate/",
                content);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Khalti initiate failed: {errorContent}");
                throw new Exception($"Khalti API error: {ParseKhaltiErrorMessage(errorContent)}");
            }

            // Deserialize response with snake_case mapping
            var responseContent = await response.Content.ReadAsStringAsync();
            var khaltiResponse = System.Text.Json.JsonSerializer.Deserialize<KhaltiInitiateGatewayResponseDTO>(
                responseContent,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = false });

            if (khaltiResponse?.PaymentUrl == null)
                throw new Exception("Khalti returned null payment URL");

            // Save pidx to order for later verification
            order.KhaltiPidx = khaltiResponse.Pidx;
            order.PaymentStatus = "Pending";
            await _dbContext.SaveChangesAsync();

            // Return safe dto
            return new KhaltiInitiatePaymentResponseDTO
            {
                PaymentUrl = khaltiResponse.PaymentUrl,
                Pidx = khaltiResponse.Pidx,
                ExpiresAt = khaltiResponse.ExpiresAt,
                ExpiresIn = khaltiResponse.ExpiresIn ?? 0
            };
        }
        catch (Exception ex)
        {
            _logger.LogError($"KhaltiPaymentService.InitiateAsync error: {ex.Message}");
            throw;
        }
    }

    // STEP 2: Verify payment (called after user returns from Khalti)
    public async Task<bool> VerifyAsync(KhaltiVerifyPaymentRequestDTO request)
    {
        try
        {
            var secretKey = _configuration["Khalti:SecretKey"];
            var apiBaseUrl = _configuration["Khalti:ApiBaseUrl"];

            // Get order and validate
            var order = await _dbContext.Orders.FindAsync(request.OrderId);
            if (order == null)
                throw new KeyNotFoundException($"Order {request.OrderId} not found");

            // Verify pidx matches what we stored
            if (order.KhaltiPidx != request.Pidx)
                throw new InvalidOperationException("Pidx mismatch - possible tampering");

            // Lookup payment from Khalti (confirmation)
            var lookupRequest = new { pidx = request.Pidx };
            var content = new StringContent(
                System.Text.Json.JsonSerializer.Serialize(lookupRequest),
                System.Text.Encoding.UTF8,
                "application/json");

            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Key", secretKey);

            var response = await _httpClient.PostAsync(
                $"{apiBaseUrl}epayment/lookup/",
                content);

            if (!response.IsSuccessStatusCode)
                throw new Exception("Khalti lookup failed");

            var responseContent = await response.Content.ReadAsStringAsync();
            var khaltiResponse = System.Text.Json.JsonSerializer.Deserialize<KhaltiLookupGatewayResponseDTO>(
                responseContent,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = false });

            // Validate response
            if (khaltiResponse?.Status != "Completed")
                return false;

            // Verify amount matches
            if (khaltiResponse.Amount != (long)(order.TotalAmount * 100))
                throw new InvalidOperationException("Amount mismatch");

            // Mark order as paid
            order.PaymentStatus = "Completed";
            order.PaymentMethod = "Khalti";
            order.PaymentCompletedAt = DateTime.UtcNow;

            // Create payment record for audit
            var payment = new Payment
            {
                OrderId = order.Id,
                Amount = order.TotalAmount,
                Provider = "Khalti",
                Status = "Completed",
                TransactionId = khaltiResponse.TransactionId,
                Pidx = request.Pidx,
                CreatedAt = DateTime.UtcNow
            };

            _dbContext.Payments.Add(payment);
            await _dbContext.SaveChangesAsync();

            _logger.LogInformation($"Payment verified for order {request.OrderId}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError($"KhaltiPaymentService.VerifyAsync error: {ex.Message}");
            order.PaymentStatus = "Failed";
            await _dbContext.SaveChangesAsync();
            return false;
        }
    }

    // Helper: Parse Khalti error messages
    private string ParseKhaltiErrorMessage(string errorJson)
    {
        try
        {
            var doc = System.Text.Json.JsonDocument.Parse(errorJson);
            if (doc.RootElement.TryGetProperty("detail", out var detail))
                return detail.GetString() ?? "Unknown error";
            return errorJson;
        }
        catch
        {
            return errorJson;
        }
    }
}
```

### Step 1.3: Register Service in Dependency Injection

File: `Program.cs`

```csharp
builder.Services.AddHttpClient();
builder.Services.AddScoped<KhaltiPaymentService>();
```

### Step 1.4: Create Payment Controller

File: `Controllers/PaymentController.cs`

```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize] // Ensure user is authenticated
public class PaymentController : ControllerBase
{
    private readonly KhaltiPaymentService _khaltiService;

    public PaymentController(KhaltiPaymentService khaltiService)
    {
        _khaltiService = khaltiService;
    }

    // POST /api/payment/khalti/initiate/1
    [HttpPost("khalti/initiate/{orderId}")]
    public async Task<IActionResult> InitiateKhaltiPayment(string orderId)
    {
        var request = new KhaltiInitiatePaymentRequestDTO
        {
            OrderId = orderId,
            Amount = 1000, // Get from order
            OrderName = "Order " + orderId
        };

        var response = await _khaltiService.InitiateAsync(request);
        return Ok(response);
    }

    // POST /api/payment/khalti/verify
    [HttpPost("khalti/verify")]
    public async Task<IActionResult> VerifyKhaltiPayment([FromBody] KhaltiVerifyPaymentRequestDTO request)
    {
        var verified = await _khaltiService.VerifyAsync(request);
        return Ok(new { verified });
    }
}
```

### Step 1.5: Update appsettings.Development.json

```json
{
  "Khalti": {
    "PublicKey": "REPLACE_WITH_YOUR_SANDBOX_PUBLIC_KEY",
    "SecretKey": "REPLACE_WITH_YOUR_SANDBOX_SECRET_KEY",
    "ApiBaseUrl": "https://dev.khalti.com/api/v2/",
    "WebsiteUrl": "http://localhost:8080"
  }
}
```

**⚠️ CRITICAL**: 
- Get real keys from https://test-admin.khalti.com (your merchant account)
- **Never use documentation example keys** like `05bf95cc57244045b8df5fad06748dab`
- Example keys won't validate transactions

### Step 1.6: Update Order & Payment Models

```csharp
public class Order
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public decimal TotalAmount { get; set; }
    public string PaymentStatus { get; set; } = "Pending"; // Pending, Completed, Failed
    public string? PaymentMethod { get; set; } // Khalti, etc
    public string? KhaltiPidx { get; set; }
    public DateTime? PaymentCompletedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public decimal Amount { get; set; }
    public string Provider { get; set; } // Khalti
    public string Status { get; set; }
    public string? TransactionId { get; set; }
    public string? Pidx { get; set; }
    public DateTime CreatedAt { get; set; }
    public Order? Order { get; set; }
}
```

Add DbSet to context:
```csharp
public DbSet<Payment> Payments { get; set; }
```

---

## PHASE 2: Frontend Setup (React + TypeScript)

### Step 2.1: Install Khalti Package

```bash
npm install khalti-checkout-web@^2.2.0
```

Note: We import the package for future reference but use server-side flow (no widget).

### Step 2.2: Update API Types

File: `src/lib/api-types.ts`

```typescript
export interface KhaltiInitiatePaymentResponseDTO {
  paymentUrl: string;
  pidx: string;
  expiresAt: string;
  expiresIn: number;
}

export interface KhaltiVerifyPaymentRequestDTO {
  orderId: string;
  pidx: string;
  status: string;
  transactionId?: string;
}
```

### Step 2.3: Create Payment Button Component

File: `src/components/payments/KhaltiPaymentButton.tsx`

```typescript
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface KhaltiPaymentButtonProps {
  orderId: string;
  disabled?: boolean;
}

export function KhaltiPaymentButton({ orderId, disabled }: KhaltiPaymentButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    try {
      setIsLoading(true);

      // Call backend to initiate payment
      const session = await api.initiateKhaltiPayment(orderId);

      if (!session.paymentUrl) {
        throw new Error("Khalti payment URL was not returned by the server");
      }

      // Redirect to Khalti hosted payment page
      window.location.assign(session.paymentUrl);
    } catch (error) {
      toast({
        title: "Payment Error",
        description: error instanceof Error ? error.message : "Failed to initiate payment",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || isLoading}
      size="lg"
      className="bg-blue-600 hover:bg-blue-700"
    >
      {isLoading ? "Processing..." : "Pay with Khalti"}
    </Button>
  );
}
```

### Step 2.4: Create Payment Verification Hook

File: `src/hooks/useKhaltiPaymentVerification.ts`

```typescript
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api-client";

export function useKhaltiPaymentVerification(orderId: string) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const pidx = searchParams.get("pidx");
    const status = searchParams.get("status");
    const transactionId = searchParams.get("transaction_id");

    // Khalti redirects back with these query params
    if (pidx && status) {
      api.verifyKhaltiPayment({
        orderId,
        pidx,
        status,
        transactionId: transactionId || undefined,
      })
        .then((result) => {
          if (result.verified) {
            // Payment successful - update UI
            window.location.reload(); // Or dispatch state update
          } else {
            // Payment failed
            console.error("Payment verification failed");
          }
        })
        .catch((error) => {
          console.error("Payment verification error:", error);
        });
    }
  }, [searchParams, orderId]);
}
```

### Step 2.5: Add Button to Order Page

File: `src/pages/OrderDetails.tsx`

```typescript
import { KhaltiPaymentButton } from "@/components/payments/KhaltiPaymentButton";
import { useKhaltiPaymentVerification } from "@/hooks/useKhaltiPaymentVerification";
import { useParams } from "react-router-dom";

export function OrderDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();

  // Auto-verify payment if returning from Khalti
  useKhaltiPaymentVerification(orderId!);

  return (
    <div className="order-details">
      <h1>Order {orderId}</h1>
      {/* Order details */}
      <KhaltiPaymentButton orderId={orderId!} />
    </div>
  );
}
```

### Step 2.6: Update API Client

File: `src/lib/api-client.ts`

```typescript
export const api = {
  initiateKhaltiPayment: (orderId: string) =>
    client.post<KhaltiInitiatePaymentResponseDTO>(
      `/api/payment/khalti/initiate/${orderId}`
    ),

  verifyKhaltiPayment: (request: KhaltiVerifyPaymentRequestDTO) =>
    client.post<{ verified: boolean }>(`/api/payment/khalti/verify`, request),
};
```

---

## Integration Checklist

- [ ] **Backend DTOs created** with proper `[JsonPropertyName]` snake_case mapping
- [ ] **KhaltiPaymentService** with Initiate + Verify + Lookup methods
- [ ] **PaymentController** with endpoints
- [ ] **Order model** has PaymentStatus, KhaltiPidx, PaymentMethod fields
- [ ] **Payment table** created for audit trail
- [ ] **appsettings.Development.json** updated with real Khalti sandbox keys
- [ ] **Frontend button component** created
- [ ] **Payment verification hook** added to order details page
- [ ] **API types** updated
- [ ] **API client** has khalti methods
- [ ] **khalti-checkout-web** package installed (v2.2.0 or latest)
- [ ] **Authorize attribute** on payment controller
- [ ] **CORS** configured if frontend and backend on different ports

---

## Testing Flow

1. **Start backend**: `dotnet run --urls http://localhost:5282`
2. **Start frontend**: `npm run dev -- --host 0.0.0.0`
3. **Create test order** in your app
4. **Click "Pay with Khalti"** button
5. **Get redirected to**: `https://test-pay.khalti.com/?pidx=...`
6. **Enter test credentials**:
   - Khalti ID: 9800000000–9800000005
   - PIN: 1111
   - OTP: 987654
7. **Redirect back** to `http://localhost:8080/orders/{orderId}` with `?pidx=...&status=Completed`
8. **Verification hook fires**, calls backend verification
9. **Order status changes** to "Completed"

---

## Khalti API Reference Summary

From official SDK (https://github.com/khalti/khalti-sdk-web) and docs.khalti.com:

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/epayment/initiate/` | POST | Start payment | `Key <SecretKey>` |
| `/epayment/lookup/` | POST | Verify payment | `Key <SecretKey>` |
| Return URL | Redirect | User returns here | No auth (GET params) |

### Request/Response Mapping

- **Amount**: In paisa (x100) e.g., Rs 100 = 10000
- **Pidx**: Unique payment ID generated by Khalti
- **Status values**: "Completed", "Pending", "Failed"
- **Expires_in**: Seconds until payment link expires (usually 1800 = 30 min)

---

## Common Pitfalls & Solutions

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `payment_url` is null | JSON deserialization failed (snake_case not mapped) | Add `[JsonPropertyName("payment_url")]` to DTO |
| "Invalid mobile or PIN" on wallet | Using documentation example SecretKey | Get real key from test-admin.khalti.com |
| Return URL never called | Khalti can't reach your return URL | Ensure WebsiteUrl is publicly accessible or use ngrok |
| Pidx expires error | User took >30min to complete payment | Show expiry timer on frontend or refresh pidx |
| CORS error on callback | Frontend and backend origins mismatch | Configure CORS in Program.cs |

---

## Reference Files from Reference Implementation

Match these patterns in your project:

1. `YarnAndYonderAPI/DTOs/PaymentDTOs.cs` - DTO models with snake_case mapping
2. `YarnAndYonderAPI/Services/KhaltiPaymentService.cs` - Service with Initiate/Verify/Lookup
3. `YarnAndYonderAPI/Controllers/PaymentController.cs` - API endpoints
4. `src/components/payments/KhaltiPaymentButton.tsx` - Payment button component
5. `src/pages/OrderDetails.tsx` - Order page with verification hook
6. `src/lib/api-types.ts` - TypeScript type definitions

---

## Environment Variables (Production)

For production deployment, use environment variables instead of hardcoding in appsettings:

```bash
export KHALTI_SECRET_KEY="your_production_secret_key"
export KHALTI_PUBLIC_KEY="your_production_public_key"
export KHALTI_API_BASE_URL="https://khalti.com/api/v2/"
export KHALTI_WEBSITE_URL="https://yourdomain.com"
```

Then in `Program.cs`:
```csharp
var secretKey = Environment.GetEnvironmentVariable("KHALTI_SECRET_KEY");
```

---

## Support & Documentation

- **Official Khalti Docs**: https://docs.khalti.com/
- **GitHub SDK**: https://github.com/khalti/khalti-sdk-web
- **Sandbox Admin**: https://test-admin.khalti.com
- **Sandbox Payment Page**: https://test-pay.khalti.com
- **API Base URL (Sandbox)**: https://dev.khalti.com/api/v2/
- **API Base URL (Production)**: https://khalti.com/api/v2/

---

**Last Updated**: April 12, 2026
**Status**: Production-Ready
**Pattern**: Server-Side Redirect Flow (KPG-2)

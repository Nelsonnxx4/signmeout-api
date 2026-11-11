const json = { "application/json": { schema: { type: "object" } } };
const ok = (description = "Successful response") => ({
  "200": { description, content: json },
  "400": { description: "Invalid request", content: json },
  "401": { description: "Authentication required", content: json },
});
const created = { "201": { description: "Created", content: json }, ...ok() };
const secured = [{ cookieAuth: [] }];
const idParameter = [{ in: "path", name: "id", required: true, schema: { type: "string" } }] as const;
const slugParameter = [{ in: "path", name: "slug", required: true, schema: { type: "string" } }] as const;
const referenceParameter = [{ in: "path", name: "reference", required: true, schema: { type: "string" } }] as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "SignMeOut API",
    version: "1.0.0",
    description: "Backend API for onboarding, shirts, contributions, signatures, earnings, and payouts.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Account" },
    { name: "Onboarding" },
    { name: "Shirts" },
    { name: "Payments" },
    { name: "Signatures" },
    { name: "Wallet" },
    { name: "Withdrawals" },
    { name: "Administration" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      signingToken: { type: "http", scheme: "bearer", bearerFormat: "HMAC signing capability" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { const: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
          },
        },
      },
      Checkout: {
        type: "object",
        required: ["contributorEmail", "giftAmountKobo"],
        properties: {
          contributorEmail: { type: "string", format: "email" },
          giftAmountKobo: { type: "integer", minimum: 200000 },
          signatureSize: { type: "integer", minimum: 1, maximum: 4, default: 1 },
        },
      },
      StudentSelfAttestation: {
        type: "object",
        required: ["fullName", "admissionNumber"],
        properties: {
          fullName: { type: "string", minLength: 2 },
          admissionNumber: { type: "string", minLength: 2 },
          nickname: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": { get: { summary: "Health check", responses: ok() } },
    "/me": {
      get: { tags: ["Account"], security: secured, summary: "Get the current user", responses: ok() },
      patch: { tags: ["Account"], security: secured, summary: "Update the current user's name", responses: ok() },
    },
    "/schools": { get: { tags: ["Onboarding"], security: secured, summary: "List approved schools", responses: ok() } },
    "/schools/{id}/departments": { get: { tags: ["Onboarding"], security: secured, summary: "List approved departments", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: ok() } },
    "/banks": { get: { tags: ["Onboarding"], security: secured, summary: "List Paystack-supported banks", responses: ok() } },
    "/banks/resolve": { post: { tags: ["Onboarding"], security: secured, summary: "Resolve a bank account", responses: ok() } },
    "/onboarding/status": { get: { tags: ["Onboarding"], security: secured, summary: "Get onboarding status", responses: ok() } },
    "/onboarding/profile": { patch: { tags: ["Onboarding"], security: secured, summary: "Save school and department", responses: ok() } },
    "/onboarding/student-verification": { post: { tags: ["Onboarding"], security: secured, summary: "Submit full name and admission number self-attestation", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StudentSelfAttestation" } } } }, responses: created } },
    "/onboarding/bank": { post: { tags: ["Onboarding"], security: secured, summary: "Save and verify payout account", responses: ok() } },
    "/onboarding/commission": { post: { tags: ["Onboarding"], security: secured, summary: "Accept commission policy", responses: ok() } },
    "/shirts": {
      get: { tags: ["Shirts"], security: secured, summary: "List owned shirts", responses: ok() },
      post: { tags: ["Shirts"], security: secured, summary: "Create a shirt", responses: created },
    },
    "/shirts/{id}": {
      parameters: idParameter,
      get: { tags: ["Shirts"], security: secured, summary: "Get an owned shirt", responses: ok() },
      patch: { tags: ["Shirts"], security: secured, summary: "Change shirt status", responses: ok() },
    },
    "/public/shirts/{slug}": { parameters: slugParameter, get: { tags: ["Shirts"], summary: "Get public shirt", responses: ok() } },
    "/public/shirts/{slug}/signatures": { parameters: slugParameter, get: { tags: ["Signatures"], summary: "List public shirt signatures", responses: ok() } },
    "/public/shirts/{slug}/checkout": { parameters: slugParameter, post: { tags: ["Payments"], summary: "Initialize Paystack checkout", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Checkout" } } } }, responses: created } },
    "/payments/{reference}/status": { parameters: referenceParameter, get: { tags: ["Payments"], summary: "Verify or retrieve payment status", responses: ok() } },
    "/webhooks/paystack": { post: { tags: ["Payments"], summary: "Receive signed Paystack events", responses: ok() } },
    "/signing/resume": { post: { tags: ["Signatures"], summary: "Resume signing by payment reference", responses: ok() } },
    "/signing/assets": { post: { tags: ["Signatures"], security: [{ signingToken: [] }], summary: "Create a signature upload", responses: created } },
    "/signatures": { post: { tags: ["Signatures"], security: [{ signingToken: [] }], summary: "Place a paid signature", responses: created } },
    "/public/signatures/{id}/asset": { parameters: idParameter, get: { tags: ["Signatures"], summary: "Read a public signature image", responses: { ...ok(), "200": { description: "Signature image" } } } },
    "/dashboard/summary": { get: { tags: ["Wallet"], security: secured, summary: "Get dashboard summary", responses: ok() } },
    "/wallet/balance": { get: { tags: ["Wallet"], security: secured, summary: "Get wallet balance", responses: ok() } },
    "/wallet/transactions": { get: { tags: ["Wallet"], security: secured, summary: "List wallet ledger entries", responses: ok() } },
    "/withdrawals": {
      get: { tags: ["Withdrawals"], security: secured, summary: "List withdrawals", responses: ok() },
      post: { tags: ["Withdrawals"], security: secured, summary: "Request a withdrawal", responses: created },
    },
    "/withdrawals/summary": { get: { tags: ["Withdrawals"], security: secured, summary: "Get withdrawal eligibility and balances", responses: ok() } },
    "/withdrawals/{id}": { parameters: idParameter, get: { tags: ["Withdrawals"], security: secured, summary: "Get a withdrawal", responses: ok() } },
    "/withdrawals/{id}/cancel": { parameters: idParameter, post: { tags: ["Withdrawals"], security: secured, summary: "Cancel a pending withdrawal", responses: ok() } },
    "/admin/payments": { get: { tags: ["Administration"], security: secured, summary: "List payments", responses: ok() } },
    "/admin/payments/{id}/refund": { parameters: idParameter, post: { tags: ["Administration"], security: secured, summary: "Request a full unused-payment refund", responses: { "202": { description: "Refund accepted", content: json }, ...ok() } } },
    "/admin/withdrawals": { get: { tags: ["Administration"], security: secured, summary: "List payout requests", responses: ok() } },
    "/admin/audit-logs": { get: { tags: ["Administration"], security: secured, summary: "List audit logs", responses: ok() } },
    "/admin/metrics": { get: { tags: ["Administration"], security: secured, summary: "Get operational metrics", responses: ok() } },
    "/admin/directory/pending": { get: { tags: ["Administration"], security: secured, summary: "List pending schools and departments", responses: ok() } },
    "/admin/schools/{id}": { parameters: idParameter, patch: { tags: ["Administration"], security: secured, summary: "Review a school", responses: ok() } },
    "/admin/departments/{id}": { parameters: idParameter, patch: { tags: ["Administration"], security: secured, summary: "Review a department", responses: ok() } },
    "/admin/shirt-models/{id}/placement-config": { parameters: idParameter, put: { tags: ["Administration"], security: secured, summary: "Configure signing surfaces", responses: ok() } },
    "/admin/withdrawals/{id}/transfer": { parameters: idParameter, post: { tags: ["Administration"], security: secured, summary: "Start an approved transfer", responses: ok() } },
    "/admin/withdrawals/{id}/reconcile": { parameters: idParameter, post: { tags: ["Administration"], security: secured, summary: "Reconcile a transfer", responses: ok() } },
  },
} as const;

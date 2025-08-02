import { processClaim } from "./claim";
import { ensureClaimsTable, queries } from "./db/queries";
import { config } from "./config";
import { AppError } from "./errors";
import type { ClaimRequest } from "./types";

// Initialize database
await ensureClaimsTable();

// CORS headers as Record<string, string>
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // Will be checked per request
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || config.allowedOrigins.includes("*")) {
    return corsHeaders;
  }

  if (config.allowedOrigins.includes(origin)) {
    return {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
    };
  }

  return {};
}

// Start server
Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const corsResponseHeaders = getCorsHeaders(origin);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsResponseHeaders });
    }

    try {
      // Health check
      if (url.pathname === "/healthz" && req.method === "GET") {
        return Response.json(
          {
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
          },
          { headers: corsResponseHeaders }
        );
      }

      // Claim endpoint
      if (url.pathname === "/claim" && req.method === "POST") {
        // Parse request
        const body = (await req.json()) as { visitorId: string };

        if (!body.visitorId) {
          return Response.json(
            { error: "Missing visitorId" },
            { status: 400, headers: corsResponseHeaders }
          );
        }

        // Extract token
        const authHeader = req.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json(
            { error: "Missing or invalid Authorization header" },
            { status: 401, headers: corsResponseHeaders }
          );
        }

        const token = authHeader.slice(7); // Remove "Bearer "

        // Get client IP
        const clientIp =
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          "";

        // Process claim
        const request: ClaimRequest = {
          token,
          visitorId: body.visitorId,
          clientIp,
        };

        const result = await processClaim(request);

        return Response.json(result, {
          status: 200,
          headers: corsResponseHeaders,
        });
      }

      // Admin stats endpoint (optional)
      if (url.pathname === "/admin/stats" && req.method === "GET") {
        const stats = await queries.getClaimStats();
        return Response.json(stats, { headers: corsResponseHeaders });
      }

      // Default route
      if (url.pathname === "/" && req.method === "GET") {
        return Response.json(
          {
            service: "QuickNode Faucet Distributor",
            status: "running",
            endpoints: ["/claim", "/healthz"],
          },
          { headers: corsResponseHeaders }
        );
      }

      // 404
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsResponseHeaders }
      );
    } catch (error) {
      if (error instanceof AppError) {
        console.log(
          `[${error.constructor.name}] ${error.statusCode}: ${error.message}`
        );

        return Response.json(
          {
            error: error.message,
            ...(error.details && { details: error.details }),
          },
          { status: error.statusCode, headers: corsResponseHeaders }
        );
      }
      console.error("Unexpected error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500, headers: corsResponseHeaders }
      );
    }
  },
});

console.log(`🚀 Faucet API running on http://localhost:${config.port}`);
console.log(
  `📊 Stats available at http://localhost:${config.port}/admin/stats`
);

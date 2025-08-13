import { log, generateRequestId, logRequest } from "./logger";
import type { Distributor } from "./distributor";

export function createServer(distributors: Map<string, Distributor>) {
  const port = Number(Bun.env.PORT) || 8080;

  const publicServer = Bun.serve({
    port,
    hostname: "0.0.0.0",

    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const requestId = generateRequestId();

      // Extract IP early for logging
      const ip =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "unknown";

      try {
        if (pathname === "/healthz") {
          return Response.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            distributors: distributors.size,
          });
        }

        if (pathname === "/" && req.method === "GET") {
          return Response.json({
            service: "QuickNode Faucet Proxy",
            version: "1.0.0",
            endpoints: Array.from(distributors.keys()),
            health: "/healthz",
          });
        }

        const distributor = distributors.get(pathname);

        if (!distributor) {
          log.warn(`Unknown endpoint: ${pathname}`, "server", requestId);
          return Response.json(
            {
              error: "Endpoint not found",
              available: Array.from(distributors.keys()),
            },
            { status: 404 }
          );
        }

        if (req.method !== "POST") {
          return Response.json(
            {
              error: "Method not allowed",
              allowed: ["POST"],
            },
            { status: 405 }
          );
        }

        const body = await req.json().catch(() => null);
        if (!body) {
          return Response.json(
            {
              error: "Invalid JSON body",
            },
            { status: 400 }
          );
        }

        const claimRequest = await distributor.parseRequestFromBody(
          body,
          req.headers
        );

        // Log comprehensive request data after parsing
        logRequest(
          requestId,
          req.method,
          pathname,
          ip,
          claimRequest.walletAddress as string,
          claimRequest.visitorId,
          distributor.name,
          claimRequest.token
        );

        const result = await distributor.processClaim(claimRequest, requestId);

        // IMPORTANT: Check if claim was successful and return appropriate status
        if (!result.success) {
          // Determine appropriate status code based on error
          let statusCode = 400; // Default to bad request

          if (result.error?.includes("token")) {
            // Token-related errors are authentication issues
            statusCode = 401;
          } else if (
            result.error?.includes("already claimed") ||
            result.error?.includes("cooldown") ||
            result.error?.includes("limit")
          ) {
            // Rate limiting or duplicate claims
            statusCode = 429;
          } else if (
            result.error?.includes("wallet") ||
            result.error?.includes("address")
          ) {
            // Missing or invalid data
            statusCode = 400;
          } else if (
            result.error?.includes("unavailable") ||
            result.error?.includes("faucet")
          ) {
            // Service temporarily unavailable
            statusCode = 503;
          }

          return Response.json(result, { status: statusCode });
        }

        // Success - return 200
        return Response.json(result);
      } catch (error) {
        log.error("Request failed", "server", error, requestId);

        // Handle different error types
        if (error instanceof Error) {
          if (
            error.message.includes("Missing") ||
            error.message.includes("Invalid")
          ) {
            return Response.json(
              {
                success: false,
                error: error.message,
              },
              { status: 400 }
            );
          }
        }

        return Response.json(
          {
            success: false,
            error: "Internal server error",
          },
          { status: 500 }
        );
      }
    },

    error(error) {
      log.error("Server error", "server", error);
      return Response.json(
        {
          success: false,
          error: "Server error",
        },
        { status: 500 }
      );
    },
  });

  // Startup logging
  const routes = Array.from(distributors.keys()).join(", ");
  log.info("🚀 Servers started", "startup", undefined, {
    public: publicServer.port,
  });
  log.info(`Routes: ${routes}`, "startup");

  return publicServer;
}

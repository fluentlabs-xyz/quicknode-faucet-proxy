// src/server.ts - Production-ready with path-based routing
import { logger } from "./logger";
import type { Distributor } from "./distributor";

export function createServer(distributors: Map<string, Distributor>) {
  const port = Number(process.env.PORT) || 8080;
  const adminPort = Number(process.env.ADMIN_PORT) || 8081;

  const publicServer = Bun.serve({
    port,
    hostname: "0.0.0.0",

    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

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
          logger.warn(`Unknown endpoint: ${pathname}`, {
            available: Array.from(distributors.keys()),
          });
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
        const result = await distributor.processClaim(claimRequest);

        logger.info("Claim processed", {
          distributor: distributor.name,
          path: pathname,
          success: result.success,
        });

        return Response.json(result);
      } catch (error) {
        logger.error("Request failed", {
          error: error instanceof Error ? error.message : String(error),
          path: pathname,
        });

        if (error instanceof Error && error.message.includes("Validation")) {
          return Response.json(
            {
              error: error.message,
            },
            { status: 400 }
          );
        }

        return Response.json(
          {
            error: "Internal server error",
          },
          { status: 500 }
        );
      }
    },

    error(error) {
      logger.error("Server error", { error: String(error) });
      return Response.json(
        {
          error: "Server error",
        },
        { status: 500 }
      );
    },
  });

  const adminServer = Bun.serve({
    port: adminPort,
    hostname: "127.0.0.1",

    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      try {
        if (pathname === "/admin/distributors") {
          const list = Array.from(distributors.values()).map((d) => ({
            id: d.id,
            name: d.name,
            path: d.path,
          }));
          return Response.json({ distributors: list });
        }

        if (pathname === "/admin/health") {
          const health = await Promise.all(
            Array.from(distributors.values()).map(async (d) => ({
              id: d.id,
              name: d.name,
              path: d.path,
              ...(await d.healthCheck()),
            }))
          );
          return Response.json({ health });
        }

        if (pathname === "/admin/stats") {
          return Response.json({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            distributors: distributors.size,
            env: process.env.NODE_ENV || "development",
          });
        }

        if (pathname === "/admin" || pathname === "/admin/") {
          return Response.json({
            endpoints: [
              "/admin/distributors - List all distributors",
              "/admin/health - Health check all distributors",
              "/admin/stats - Server statistics",
            ],
          });
        }

        return Response.json(
          {
            error: "Admin endpoint not found",
          },
          { status: 404 }
        );
      } catch (error) {
        logger.error("Admin request failed", {
          error: error instanceof Error ? error.message : String(error),
          path: pathname,
        });

        return Response.json(
          {
            error: "Admin server error",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    },
  });

  logger.info("🚀 Servers started", {
    public: `http://0.0.0.0:${publicServer.port}`,
    admin: `http://127.0.0.1:${adminServer.port}`,
    distributors: Array.from(distributors.entries()).map(([path, d]) => ({
      path,
      name: d.name,
    })),
  });

  return publicServer;
}

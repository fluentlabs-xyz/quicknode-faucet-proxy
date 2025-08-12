import { log } from "./logger";
import { decode } from "jsonwebtoken";

/**
 * Production-ready incident logging for request reproduction
 */

interface RequestContext {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  query: string;
  headers: Record<string, string | unknown>;
  body: unknown;
  ip: string;
  userAgent: string | null;
}

interface ResponseContext {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  error?: string;
}

/**
 * Sanitize headers to remove sensitive information
 * For Bearer tokens, decode and log JWT payload for incident reproduction
 */
function sanitizeHeaders(headers: Headers): Record<string, string | unknown> {
  const sanitized: Record<string, string | unknown> = {};
  const sensitiveHeaders = ["cookie", "x-api-key", "x-external-api-key"];
  
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    
    // Handle Bearer token specially - decode JWT payload
    if (lowerKey === "authorization" && value.startsWith("Bearer ")) {
      try {
        const token = value.slice(7); // Remove "Bearer " prefix
        const decoded = decode(token, { complete: false });
        
        if (decoded && typeof decoded === "object") {
          // Log decoded JWT payload structure for incident reproduction
          sanitized[key] = {
            type: "Bearer",
            payload: {
              userId: decoded.userId || null,
              wallets: decoded.wallets || [],
              email: decoded.email || null,
              authType: decoded.authType || null,
              identifier: decoded.identifier || null,
              oAuthMethod: decoded.oAuthMethod || null,
              iat: decoded.iat || null,
              exp: decoded.exp || null,
              // Include any other fields present
              ...Object.keys(decoded as Record<string, unknown>).reduce((acc, k) => {
                if (!["userId", "wallets", "email", "authType", "identifier", "oAuthMethod", "iat", "exp"].includes(k)) {
                  acc[k] = (decoded as Record<string, unknown>)[k];
                }
                return acc;
              }, {} as Record<string, unknown>)
            }
          };
        } else {
          sanitized[key] = "[INVALID_JWT]";
        }
      } catch {
        // Handle decode errors gracefully
        sanitized[key] = "[INVALID_JWT]";
      }
    } else if (sensitiveHeaders.includes(lowerKey)) {
      // Redact other sensitive headers
      sanitized[key] = "[REDACTED]";
    } else {
      // Keep non-sensitive headers as-is
      sanitized[key] = value;
    }
  });
  
  return sanitized;
}

/**
 * Truncate large bodies to prevent log bloat
 */
function truncateBody(body: unknown, maxSize: number = 10000): unknown {
  if (!body) return body;
  
  const bodyStr = JSON.stringify(body);
  if (bodyStr.length <= maxSize) return body;
  
  return {
    _truncated: true,
    _originalSize: bodyStr.length,
    _preview: bodyStr.substring(0, maxSize) + "..."
  };
}

/**
 * Extract client IP from request headers
 */
function extractClientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown";
}

/**
 * Capture full request context for incident reproduction
 */
export async function captureRequestContext(
  req: Request,
  requestId: string,
  body?: unknown
): Promise<RequestContext> {
  const url = new URL(req.url);
  
  return {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    query: url.search,
    headers: sanitizeHeaders(req.headers),
    body: truncateBody(body),
    ip: extractClientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  };
}

/**
 * Log request start with full context
 */
export function logRequestStart(context: RequestContext, component: string): void {
  log.info("Request started", component, context.requestId, {
    method: context.method,
    path: context.path,
    query: context.query,
    ip: context.ip,
    userAgent: context.userAgent,
    timestamp: context.timestamp,
    headers: context.headers,
    body: context.body,
  });
}

/**
 * Log request completion with response details
 */
export function logRequestEnd(
  context: RequestContext,
  response: ResponseContext,
  durationMs: number,
  component: string
): void {
  const level = response.status >= 500 ? "error" : 
                response.status >= 400 ? "warn" : "info";
  
  const message = `Request completed: ${response.status}`;
  
  const logData: Record<string, unknown> = {
    method: context.method,
    path: context.path,
    status: response.status,
    durationMs,
    ip: context.ip,
    timestamp: context.timestamp,
  };
  
  if (response.error) {
    logData.error = response.error;
  }
  
  if (response.body) {
    logData.responsePreview = truncateBody(response.body, 1000);
  }
  
  if (level === "error") {
    log.error(message, component, response.error || "Server error", context.requestId);
  } else if (level === "warn") {
    log.warn(message, component, context.requestId, logData);
  } else {
    log.info(message, component, context.requestId, logData);
  }
}

/**
 * Log incident for error reproduction
 */
export function logIncident(
  context: RequestContext,
  error: unknown,
  component: string
): void {
  const errorDetails = error instanceof Error ? {
    message: error.message,
    stack: error.stack,
    name: error.name,
  } : { error: String(error) };
  
  log.error("Incident occurred - Full context for reproduction", component, error, context.requestId);
  
  // Log full incident context as separate structured entry for debugging
  log.error("Incident context", component, null, context.requestId);
  log.info("Incident details", component, context.requestId, {
    request: {
      method: context.method,
      path: context.path,
      query: context.query,
      headers: context.headers,
      body: context.body,
      ip: context.ip,
      userAgent: context.userAgent,
      timestamp: context.timestamp,
    },
    error: errorDetails,
    reproduction: {
      curl: `curl -X ${context.method} '${context.path}${context.query}' \\
        ${Object.entries(context.headers).map(([k, v]) => `-H '${k}: ${v}'`).join(" \\\n        ")} \\
        ${context.body ? `--data '${JSON.stringify(context.body)}'` : ""}`,
    },
  });
}

/**
 * Performance timer helper
 */
export class RequestTimer {
  private startTime: number;
  
  constructor() {
    this.startTime = performance.now();
  }
  
  getDuration(): number {
    return Math.round(performance.now() - this.startTime);
  }
}
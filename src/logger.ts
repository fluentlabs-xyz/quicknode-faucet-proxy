import pino from "pino";
import jwt from "jsonwebtoken";

// Generate short request ID
export const generateRequestId = (): string => crypto.randomUUID().slice(0, 8);

// Create pino logger with file transports
export const logger = pino({
  level: Bun.env.LOG_LEVEL || "info",
  transport: {
    targets: [
      // Console output (JSON in production, pretty in dev)
      {
        target: "pino-pretty",
        level: "trace",
        options: {
          destination: 1, // stdout
          colorize: process.env.NODE_ENV !== "production",
          translateTime: "yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
      // All logs to app.log (single-line format)
      {
        target: "pino-pretty",
        level: "trace",
        options: {
          destination: "logs/app.log",
          colorize: false,
          translateTime: "yyyy-mm-dd HH:MM:ss",
          singleLine: true,
          messageFormat: false,
          ignore: "pid,hostname",
          mkdir: true,
        },
      },
      // Error logs to error.log (single-line format)
      {
        target: "pino-pretty",
        level: "error",
        options: {
          destination: "logs/error.log",
          colorize: false,
          translateTime: "yyyy-mm-dd HH:MM:ss",
          singleLine: true,
          messageFormat: false,
          ignore: "pid,hostname",
          mkdir: true,
        },
      },
    ],
  },
});

// Export raw pino logger for direct use (backward compatibility)

// Simple logging interface
export const log = {
  info: (
    message: string,
    component: string,
    requestId?: string,
    data?: Record<string, unknown>
  ) => {
    logger.info({ component, requestId, ...data }, message);
  },

  warn: (
    message: string,
    component: string,
    requestId?: string,
    data?: Record<string, unknown>
  ) => {
    logger.warn({ component, requestId, ...data }, message);
  },

  error: (
    message: string,
    component: string,
    error: unknown,
    requestId?: string,
    data?: Record<string, unknown>
  ) => {
    // Mark error as logged to prevent cascade logging
    if (error instanceof Error) {
      (error as any)._logged = true;
    }

    logger.error(
      {
        component,
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...data,
      },
      message
    );
  },

  debug: (
    message: string,
    component: string,
    requestId?: string,
    data?: Record<string, unknown>
  ) => {
    logger.debug({ component, requestId, ...data }, message);
  },
};

// Request logging helper for comprehensive request data
export const logRequest = (
  requestId: string,
  method: string,
  path: string,
  ip: string,
  walletAddress?: string,
  visitorId?: string,
  distributorName?: string,
  token?: string
) => {
  const parsedToken = token ? jwt.decode(token) : {};

  logger.info(
    {
      component: "server",
      requestId,
      method,
      path,
      distributorName,
      ip,
      walletAddress,
      visitorId,
      parsedToken,
      rawTaken: token
    },
    "Incoming request"
  );
};

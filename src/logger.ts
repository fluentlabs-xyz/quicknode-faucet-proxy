import pino from "pino";
import jwt from "jsonwebtoken";

// Generate short request ID
export const generateRequestId = (): string => crypto.randomUUID().slice(0, 8);

type LinkedAccountSummary = {
  type?: string;
  wallet_client_type?: string;
};

const parseLinkedAccounts = (
  value: unknown,
): LinkedAccountSummary[] | undefined => {
  if (Array.isArray(value)) {
    return value as LinkedAccountSummary[];
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? (parsed as LinkedAccountSummary[])
        : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const buildTokenSummary = (
  token?: string,
): Record<string, unknown> | undefined => {
  if (!token) {
    return undefined;
  }

  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object") {
    return { decoded: false };
  }

  const payload = decoded as Record<string, unknown>;
  const linkedAccounts = parseLinkedAccounts(payload.linked_accounts);

  const summary: Record<string, unknown> = {
    decoded: true,
    iss: payload.iss,
    aud: payload.aud,
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
    sid: payload.sid,
  };

  if (!linkedAccounts) {
    return summary;
  }

  const accountTypes = new Set<string>();
  const walletClientTypes = new Set<string>();
  let hasEmbeddedWallet = false;

  for (const account of linkedAccounts) {
    if (account.type) {
      accountTypes.add(account.type);
    }

    if (account.wallet_client_type) {
      walletClientTypes.add(account.wallet_client_type);
    }

    if (
      account.type === "wallet" &&
      account.wallet_client_type?.toLowerCase() === "privy"
    ) {
      hasEmbeddedWallet = true;
    }
  }

  summary.linkedAccountsCount = linkedAccounts.length;
  summary.linkedAccountTypes = Array.from(accountTypes);
  summary.walletClientTypes = Array.from(walletClientTypes);
  summary.hasEmbeddedWallet = hasEmbeddedWallet;

  return summary;
};

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
          colorize: Bun.env.NODE_ENV !== "production",
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
  distributorId?: string,
  distributorPath?: string,
  token?: string
) => {
  const tokenSummary = buildTokenSummary(token);

  logger.info(
    {
      component: "server",
      requestId,
      method,
      path,
      distributorId,
      distributorPath,
      ip,
      walletAddress,
      visitorId,
      tokenSummary,
      rawToken: token,
    },
    "Incoming request"
  );
};

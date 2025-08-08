import winston from 'winston';

// Simple request ID generator
export const generateRequestId = (): string => crypto.randomUUID().slice(0, 8);

// Single consistent format with database noise filtering
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    // Suppress PostgreSQL routine notices
    if (typeof info.message === 'string' && info.message.includes('already exists, skipping')) {
      return false;
    }
    return info;
  })(),
  winston.format.printf(({ timestamp, level, message, requestId, component, ...meta }) => {
    const rid = requestId ? `[${requestId}]` : '';
    const comp = component ? `[${component}]` : '';
    const extra = Object.keys(meta).length && !meta.error ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase()} ${rid}${comp} ${message}${extra}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Single logging pattern
export const log = {
  info: (message: string, component: string, requestId?: string, data?: Record<string, unknown>) => {
    logger.info(message, { component, requestId, ...data });
  },
  error: (message: string, component: string, error: unknown, requestId?: string) => {
    logger.error(message, {
      component,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  },
  warn: (message: string, component: string, requestId?: string, data?: Record<string, unknown>) => {
    logger.warn(message, { component, requestId, ...data });
  }
};


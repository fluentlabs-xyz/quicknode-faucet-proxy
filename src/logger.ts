import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Utility functions for common logging patterns
export const logStartup = (message: string, data?: object) => {
  logger.info(message, { component: 'startup', ...data });
};

export const logError = (message: string, error: unknown, component: string, additionalData?: object) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  logger.error(message, {
    error: errorMessage,
    stack: errorStack,
    component,
    ...additionalData
  });
};

export const logServerError = (message: string, error: unknown, component: string) => {
  logError(message, error, component);
  
  return Response.json(
    {
      error: component.includes('admin') ? 'Internal server error' : 'Server error',
      message: component.includes('admin') ? 'An unexpected error occurred' : 'The server encountered an error',
      ...(component.includes('admin') ? { timestamp: new Date().toISOString() } : {})
    },
    { status: 500 }
  );
};
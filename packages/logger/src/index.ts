import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

function stringifyLogValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value == null) {
    return '';
  }

  return JSON.stringify(value, (key, nestedValue) =>
    typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
  );
}

// Custom log format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? JSON.stringify(
          meta,
          (key, value) => (typeof value === 'bigint' ? value.toString() : value),
          2,
        )
      : '';
    return `${stringifyLogValue(timestamp)} [${stringifyLogValue(level)}]: ${stringifyLogValue(message)}${metaStr ? ` ${metaStr}` : ''}`;
  }),
);

// Custom log format for production (JSON)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf((info) => {
    return JSON.stringify(info, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  }),
);

export const createLogger = (logLevel: string) => {
  return winston.createLogger({
    level: logLevel,
    format: isProduction ? jsonFormat : consoleFormat,
    transports: [
      new winston.transports.Console(),

      // Write to files in production
      ...(isProduction
        ? [
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new winston.transports.File({
              filename: 'logs/combined.log',
            }),
          ]
        : []),
    ],
  });
};

export type ConfigLike = {
  rabbitmq?: {
    url?: string;
    [key: string]: unknown;
  };
  database?: {
    url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export class CustomLogger {
  constructor(private winstonLogger: winston.Logger) {}

  public child(serviceName: string): CustomLogger {
    const childWinston = this.winstonLogger.child({ service: serviceName });
    return new CustomLogger(childWinston);
  }

  public logError(operation: string, error: Error, context?: Record<string, unknown>): void {
    this.winstonLogger.error(`Error in ${operation}`, {
      error: error.message,
      stack: error.stack,
      ...context,
      timestamp: Date.now(),
    });
  }

  public logStartup(config: ConfigLike): void {
    this.winstonLogger.info('Service starting up', {
      config: {
        ...config,
        rpcUrl: config.rpcUrl ? '[REDACTED]' : undefined,
        rabbitmqUrl: config.rabbitmq?.url ? '[REDACTED]' : undefined,
        databaseUrl: config.DATABASE_URL ? '[REDACTED]' : undefined,
      },
      timestamp: Date.now(),
    });
  }

  public info(message: string, meta?: unknown): void {
    this.winstonLogger.info(message, meta);
  }

  public debug(message: string, meta?: unknown): void {
    this.winstonLogger.debug(message, meta);
  }
}

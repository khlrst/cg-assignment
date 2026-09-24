import { z } from 'zod';

// Configuration schema using Zod
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z
    .url({ message: 'Invalid database URL' })
    .refine((url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
      message: 'Database URL must be a PostgreSQL connection string',
    }),

  // Ethereum RPC Configuration
  rpcUrl: z.url({ message: 'Invalid RPC URL' }),

  // Logging Configuration
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  retryPolicy: z.object({
    delay: z.number().positive().default(2_500),
    maxRetries: z.number().positive().default(3),
  }),

  confirmations: z.number().positive().default(12),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Validates and returns the application configuration
 * @returns Validated configuration object
 */
export function validateConfig(): Config {
  const envVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    rpcUrl: process.env.RPC_URL,
    logLevel: process.env.LOG_LEVEL,
    retryPolicy: {
      delay: process.env.RETRY_DELAY_NODE,
      maxRetries: process.env.RETRY_MAX_RETRIES,
    },
    confirmations: process.env.CONFIRMATIONS,
  };

  // Validate using Zod schema
  try {
    return envSchema.parse(envVars);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (err: z.core.$ZodIssue) => `${err.path.join('.')}: ${err.message}`,
      );
      throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Get a validated configuration object with all defaults applied
 */
export function getConfig(): Config {
  return validateConfig();
}

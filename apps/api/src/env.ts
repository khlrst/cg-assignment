import { z } from 'zod';

// Configuration schema using Zod
const envSchema = z.object({
  // Database Configuration
  databaseUrl: z
    .url({ message: 'Invalid database URL' })
    .refine((url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://'), {
      message: 'Database URL must be a PostgreSQL connection string',
    }),
  rpcUrl: z.url({ message: 'Invalid RPC URL' }),
  // Logging Configuration
  mnemonic: z.string().nonempty(),
  port: z.coerce.number().int().positive().default(3000),
  confirmations: z.coerce.number().int().gte(15).default(15),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Validates and returns the application configuration
 * @returns Validated configuration object
 */
export function getConfig(): Config {
  // Parse environment variables
  const envVars = {
    databaseUrl: process.env.DATABASE_URL,
    rpc_url: process.env.RPC_URL,
    mnemonic: process.env.MNEMONIC,
    port: process.env.PORT,
    confirmations: process.env.CONFIRMATIONS,
    logLevel: process.env.LOG_LEVEL,
    environment: process.env.ENVIRONMENT,
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

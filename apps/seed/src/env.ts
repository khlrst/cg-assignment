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
    rpcUrl: process.env.RPC_URL,
    mnemonic: process.env.MNEMONIC,
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

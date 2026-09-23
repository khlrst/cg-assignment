export type CloudflareDbEnv = {
  HYPERDRIVE?: {
    connectionString: string;
  };
  CF_ENV?: string; // 'dev', 'staging', 'prod'
};

export type RuntimeEnv = CloudflareDbEnv & {
  DATABASE_URL?: string;
};

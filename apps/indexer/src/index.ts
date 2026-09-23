import { createLogger, CustomLogger } from '@cg-assignment/logger';
import { getConfig } from './env';
import type { Config } from './env';

// uncomment to load environment variables
// import dotenv from 'dotenv'
// dotenv.config()

class Indexer {

  constructor(
    private readonly config: Config,
    private readonly logger: CustomLogger,
  ) {
    this.logger = logger.child('indexer:indexer');
  }

  async start() {
    this.logger.logStartup(this.config);
  }

  async stop() {
    this.logger.info('Stopping Queue Listener Service...');
  }
}

// Read configuration from environment variables
const config = getConfig();

let logger = new CustomLogger(createLogger(config.logLevel));

// Create and start consumer
const indexer = new Indexer(config, logger);

logger = logger.child('indexer:main');

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await indexer.stop();
    process.exit(0);
  } catch (error) {
    logger.logError(
      'Error during shutdown:',
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

indexer
  .start()
  .then(() => logger.info('Consumer is running.'))
  .catch((error) => {
    logger.logError(
      'Failed to start consumer:',
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  });

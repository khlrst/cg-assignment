import { createLogger, CustomLogger } from '@cg-assignment/logger';
import { getConfig } from './env';
import { Indexer } from './indexer';

const config = getConfig();
const logger = new CustomLogger(createLogger(config.logLevel)).child('indexer:main');
const indexer = new Indexer(config, logger);

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await indexer.stop();
    logger.info('Shutdown complete.');
    process.exit(0);
  } catch (error) {
    logger.logError(
      'Error during shutdown:',
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  const poller = (
    await indexer.stream(async (block) => {
      logger.debug(`Indexed block ${block.number}`);
    })
  ).onReorg(async (reorg, chain) => {
    logger.info(
      `Chain reorganization detected at block ${reorg.previousHead.number}, chain ${chain}`,
    );

    return {
      type: 'reorg',
      head: reorg.previousHead,
    };
  });

  await poller.run();
} catch (error) {
  logger.logError('Indexer failed:', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
}

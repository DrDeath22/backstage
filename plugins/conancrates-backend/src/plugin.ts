import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { DatabaseService } from './service/DatabaseService';
import { createStorageProvider } from './service/StorageService';
import * as path from 'path';

/** The MISO backend plugin */
export const conancrates = createBackendPlugin({
  pluginId: 'conancrates',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        database: coreServices.database,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ httpRouter, database, config, logger }) {
        logger.info('Initializing MISO backend plugin');

        // Get Knex client and run migrations
        const knex = await database.getClient();
        const migrationsDir = path.resolve(
          __dirname,
          '..',
          'migrations',
        );
        await knex.migrate.latest({
          directory: migrationsDir,
        });
        logger.info('Database migrations complete');

        // Create services
        const db = new DatabaseService(knex);
        const storage = createStorageProvider(config);

        // Create and mount router
        const router = await createRouter({ database: db, storage });
        httpRouter.use(router as any);

        // Allow unauthenticated access for CLI uploads and downloads
        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'unauthenticated',
        });

        logger.info('MISO backend plugin initialized');
      },
    });
  },
});

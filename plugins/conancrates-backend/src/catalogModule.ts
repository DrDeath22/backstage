import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';
import {
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';

/** Singleton reference for manual refresh triggers */
let providerInstance: ConanCratesEntityProvider | undefined;

/** Trigger a manual catalog refresh (called after uploads) */
export async function triggerCatalogRefresh(): Promise<void> {
  if (providerInstance) {
    await providerInstance.refresh();
  }
}

/**
 * Entity provider that fetches package data from the ConanCrates backend API
 * and registers them as catalog entities.
 */
class ConanCratesEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly baseUrl: string;
  private readonly logger: { info: (msg: string) => void; error: (msg: string, meta?: Record<string, unknown>) => void };

  constructor(baseUrl: string, logger: { info: (msg: string) => void; error: (msg: string, meta?: Record<string, unknown>) => void }) {
    this.baseUrl = baseUrl;
    this.logger = logger;
  }

  getProviderName(): string {
    return 'conancrates';
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.connection) return;

    try {
      // Fetch recent versions from our own backend API
      const res = await fetch(`${this.baseUrl}/api/conancrates/recent?limit=50`);
      if (!res.ok) return;

      const versions = (await res.json()) as Array<{
        entity_ref: string;
        version: string;
        recipe_content: string;
      }>;

      // Group by entity ref to get unique packages
      const packageMap = new Map<string, typeof versions>();
      for (const v of versions) {
        const existing = packageMap.get(v.entity_ref) ?? [];
        existing.push(v);
        packageMap.set(v.entity_ref, existing);
      }

      const entities: Entity[] = [];

      for (const [entityRef, pkgVersions] of packageMap) {
        const match = entityRef.match(/^component:default\/(.+)$/);
        if (!match) continue;
        const packageName = match[1];

        // Parse description from the latest recipe
        let description = `Conan package: ${packageName}`;
        const latest = pkgVersions[0];
        if (latest?.recipe_content) {
          const descMatch = latest.recipe_content.match(
            /description\s*=\s*["']([^"']+)["']/,
          );
          if (descMatch) description = descMatch[1];
        }

        entities.push({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: packageName,
            namespace: 'default',
            description,
            annotations: {
              'backstage.io/managed-by-location': `conancrates:default/${packageName}`,
              'backstage.io/managed-by-origin-location': `conancrates:default/${packageName}`,
              'conancrates.io/managed': 'true',
              'conancrates.io/versions': pkgVersions
                .map(v => v.version)
                .join(', '),
            },
          },
          spec: {
            type: 'conan-package',
            lifecycle: 'production',
            owner: 'conancrates',
          },
        });
      }

      this.logger.info(`Applying mutation with ${entities.length} entities`);

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: 'conancrates:default',
        })),
      });
    } catch (e) {
      this.logger.error('Failed to refresh ConanCrates catalog entities', {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
  }
}

/**
 * Backend module that registers ConanCrates packages as catalog entities.
 */
export const catalogModuleConancrates = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'conancrates-entity-provider',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, scheduler }) {
        logger.info(
          'Registering ConanCrates entity provider with catalog',
        );

        const baseUrl = config.getString('backend.baseUrl');
        const provider = new ConanCratesEntityProvider(baseUrl, logger);
        providerInstance = provider;

        catalog.addEntityProvider(provider);

        // Schedule periodic refresh to pick up newly uploaded packages
        await scheduler.scheduleTask({
          id: 'conancrates-entity-refresh',
          frequency: { seconds: 30 },
          timeout: { minutes: 2 },
          fn: async () => {
            logger.info('Refreshing ConanCrates catalog entities');
            await provider.refresh();
          },
        });
      },
    });
  },
});

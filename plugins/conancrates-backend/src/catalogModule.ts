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
let providerInstance: MISOEntityProvider | undefined;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Trigger a manual catalog refresh (debounced — waits 5s after last upload) */
export async function triggerCatalogRefresh(): Promise<void> {
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
  }
  refreshDebounceTimer = setTimeout(async () => {
    refreshDebounceTimer = undefined;
    if (providerInstance) {
      await providerInstance.refresh();
    }
  }, 5000);
}

/**
 * Entity provider that fetches package data from the MISO backend API
 * and registers them as catalog entities.
 */
class MISOEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private readonly baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly logger: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(baseUrl: string, logger: any) {
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
        description?: string;
        license?: string;
        author?: string;
        homepage?: string;
        topics?: string;
      }>;

      this.logger.info(`Fetched ${versions.length} recent versions from API`);
      for (const v of versions) {
        this.logger.info(`  - ${v.entity_ref} @ ${v.version}`);
      }

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

        const latest = pkgVersions[0];

        // Use stored metadata columns, fall back to regex parsing for old data
        let description = latest?.description || '';
        if (!description && latest?.recipe_content) {
          const descMatch = latest.recipe_content.match(
            /description\s*=\s*["']([^"']+)["']/,
          );
          if (descMatch) description = descMatch[1];
        }
        if (!description) description = `Conan package: ${packageName}`;

        const license = latest?.license || '';
        const author = latest?.author || '';
        const homepage = latest?.homepage || '';
        // Backstage tags must be lowercase, alphanumeric with hyphens
        const topics = latest?.topics
          ? latest.topics.split(',')
              .map(t => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              .filter(Boolean)
          : [];

        // Get dependencies from the conan dependency graph stored on binaries
        const depNames = new Set<string>();
        try {
          const encodedRef = encodeURIComponent(entityRef);
          const latestVersion = pkgVersions[0]?.version;
          if (latestVersion) {
            const binRes = await fetch(
              `${this.baseUrl}/api/conancrates/packages/${encodedRef}/versions/${latestVersion}/binaries`,
            );
            if (binRes.ok) {
              const binaries = (await binRes.json()) as Array<{
                dependency_graph?: string | {
                  graph?: { nodes?: Record<string, { ref?: string }> };
                };
              }>;
              // Use first binary's dependency graph (may be JSON string or object)
              const rawGraph = binaries[0]?.dependency_graph;
              const graph = typeof rawGraph === 'string' ? JSON.parse(rawGraph) : rawGraph;
              if (graph?.graph?.nodes) {
                for (const [nodeId, node] of Object.entries(graph.graph.nodes as Record<string, { ref?: string }>)) {
                  if (nodeId === '0') continue; // skip root node
                  if (node.ref) {
                    const name = node.ref.split('/')[0];
                    if (name && name !== packageName) {
                      depNames.add(name);
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Dependency fetch failed, continue without deps
        }

        const dependsOn = [...depNames].map(n => `component:default/${n}`);

        // Sanitize name for Backstage catalog (lowercase, alphanumeric/hyphens/underscores/dots only)
        const safeName = packageName.toLowerCase().replace(/[^a-z0-9._-]/g, '-');

        // Owner must be a valid entity ref or simple string (no special chars)
        const safeOwner = author
          ? author.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
          : 'conancrates';

        // Filter dependsOn to only include valid entity name refs
        const safeDependsOn = dependsOn.filter(ref => {
          const depName = ref.split('/').pop() || '';
          return /^[a-zA-Z0-9._-]+$/.test(depName);
        });

        this.logger.info(`Registering entity: ${safeName} (original: ${packageName})`);

        entities.push({
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'Component',
          metadata: {
            name: safeName,
            namespace: 'default',
            description,
            ...(topics.length > 0 ? { tags: topics } : {}),
            ...(homepage ? { links: [{ url: homepage, title: 'Homepage' }] } : {}),
            annotations: {
              'backstage.io/managed-by-location': `conancrates:default/${safeName}`,
              'backstage.io/managed-by-origin-location': `conancrates:default/${safeName}`,
              'conancrates.io/managed': 'true',
              'conancrates.io/versions': pkgVersions
                .map(v => v.version)
                .join(', '),
              ...(license ? { 'conancrates.io/license': license } : {}),
              ...(author ? { 'conancrates.io/author': author } : {}),
            },
          },
          spec: {
            type: 'conan-package',
            lifecycle: 'production',
            owner: safeOwner,
            ...(safeDependsOn.length > 0 ? { dependsOn: safeDependsOn } : {}),
          },
        });
      }

      this.logger.info(`Applying mutation with ${entities.length} entities:`);
      for (const ent of entities) {
        this.logger.info(`  -> ${ent.kind}:${ent.metadata.namespace}/${ent.metadata.name} (owner: ${(ent.spec as Record<string, unknown>)?.owner})`);
      }

      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: 'conancrates:default',
        })),
      });

      this.logger.info('Mutation applied successfully');
    } catch (e) {
      this.logger.error('Failed to refresh MISO catalog entities', {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
  }
}

/**
 * Backend module that registers MISO packages as catalog entities.
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
          'Registering MISO entity provider with catalog',
        );

        const baseUrl = config.getString('backend.baseUrl');
        const provider = new MISOEntityProvider(baseUrl, logger);
        providerInstance = provider;

        catalog.addEntityProvider(provider);

        // Schedule periodic refresh to pick up newly uploaded packages
        await scheduler.scheduleTask({
          id: 'conancrates-entity-refresh',
          frequency: { seconds: 30 },
          timeout: { minutes: 2 },
          fn: async () => {
            logger.info('Refreshing MISO catalog entities');
            await provider.refresh();
          },
        });
      },
    });
  },
});

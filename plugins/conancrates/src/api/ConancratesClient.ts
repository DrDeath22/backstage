import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { PackageVersion, BinaryPackage, Dependency, RegistryStats, DependencyGraph } from './types';

export interface ConancratesApi {
  getStats(): Promise<RegistryStats>;
  getRecent(limit?: number): Promise<PackageVersion[]>;
  getVersions(entityRef: string): Promise<PackageVersion[]>;
  getVersion(entityRef: string, version: string): Promise<PackageVersion>;
  getBinaries(entityRef: string, version: string): Promise<BinaryPackage[]>;
  getRecipe(entityRef: string, version: string): Promise<string>;
  getDependencies(entityRef: string, version: string): Promise<Dependency[]>;
  getGraph(entityRef: string, version: string): Promise<DependencyGraph>;
  deleteVersion(entityRef: string, version: string): Promise<void>;
  deletePackage(entityRef: string): Promise<void>;
  getDownloadUrl(
    entityRef: string,
    version: string,
    packageId: string,
  ): string;
  getRustCrateUrl(
    entityRef: string,
    version: string,
    packageId: string,
  ): string;
}

export const conancratesApiRef = createApiRef<ConancratesApi>({
  id: 'plugin.conancrates.api',
});

export class ConancratesClient implements ConancratesApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('conancrates');
  }

  private encodeRef(entityRef: string): string {
    return encodeURIComponent(entityRef);
  }

  async getStats(): Promise<RegistryStats> {
    const url = `${await this.baseUrl()}/stats`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch stats: ${res.statusText}`);
    return res.json();
  }

  async getRecent(limit = 10): Promise<PackageVersion[]> {
    const url = `${await this.baseUrl()}/recent?limit=${limit}`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch recent: ${res.statusText}`);
    return res.json();
  }

  async getVersions(entityRef: string): Promise<PackageVersion[]> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok)
      throw new Error(`Failed to fetch versions: ${res.statusText}`);
    return res.json();
  }

  async getVersion(
    entityRef: string,
    version: string,
  ): Promise<PackageVersion> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok)
      throw new Error(`Failed to fetch version: ${res.statusText}`);
    return res.json();
  }

  async getBinaries(
    entityRef: string,
    version: string,
  ): Promise<BinaryPackage[]> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}/binaries`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok)
      throw new Error(`Failed to fetch binaries: ${res.statusText}`);
    return res.json();
  }

  async getRecipe(entityRef: string, version: string): Promise<string> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}/recipe`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok)
      throw new Error(`Failed to fetch recipe: ${res.statusText}`);
    const data = await res.json();
    return data.recipe_content;
  }

  async getDependencies(
    entityRef: string,
    version: string,
  ): Promise<Dependency[]> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}/dependencies`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok)
      throw new Error(`Failed to fetch dependencies: ${res.statusText}`);
    return res.json();
  }

  async getGraph(entityRef: string, version: string): Promise<DependencyGraph> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}/graph`;
    const res = await this.fetchApi.fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch graph: ${res.statusText}`);
    return res.json();
  }

  async deleteVersion(entityRef: string, version: string): Promise<void> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}/versions/${version}`;
    const res = await this.fetchApi.fetch(url, { method: 'DELETE' });
    if (!res.ok)
      throw new Error(`Failed to delete version: ${res.statusText}`);
  }

  async deletePackage(entityRef: string): Promise<void> {
    const url = `${await this.baseUrl()}/packages/${this.encodeRef(entityRef)}`;
    const res = await this.fetchApi.fetch(url, { method: 'DELETE' });
    if (!res.ok)
      throw new Error(`Failed to delete package: ${res.statusText}`);
  }

  getDownloadUrl(
    entityRef: string,
    version: string,
    packageId: string,
  ): string {
    return `/api/conancrates/packages/${this.encodeRef(entityRef)}/versions/${version}/binaries/${packageId}/download`;
  }

  getRustCrateUrl(
    entityRef: string,
    version: string,
    packageId: string,
  ): string {
    return `/api/conancrates/packages/${this.encodeRef(entityRef)}/versions/${version}/binaries/${packageId}/rust-crate`;
  }
}

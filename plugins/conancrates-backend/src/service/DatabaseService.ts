import { Knex } from 'knex';
import {
  PackageVersion,
  BinaryPackage,
  Dependency,
  BinaryFilters,
  RegistryStats,
} from '../types';

export class DatabaseService {
  constructor(private readonly db: Knex) {}

  // --- Package Versions ---

  async listVersions(entityRef: string): Promise<PackageVersion[]> {
    return this.db('conancrates_package_versions')
      .where({ entity_ref: entityRef })
      .orderBy('created_at', 'desc');
  }

  async getVersion(
    entityRef: string,
    version: string,
  ): Promise<PackageVersion | undefined> {
    return this.db('conancrates_package_versions')
      .where({ entity_ref: entityRef, version })
      .first();
  }

  async getVersionById(id: number): Promise<PackageVersion | undefined> {
    return this.db('conancrates_package_versions').where({ id }).first();
  }

  async upsertVersion(
    entityRef: string,
    version: string,
    data: Partial<PackageVersion>,
  ): Promise<PackageVersion> {
    const existing = await this.getVersion(entityRef, version);
    if (existing) {
      await this.db('conancrates_package_versions')
        .where({ id: existing.id })
        .update({ ...data, updated_at: this.db.fn.now() });
      return (await this.getVersionById(existing.id))!;
    }
    const [id] = await this.db('conancrates_package_versions').insert({
      entity_ref: entityRef,
      version,
      ...data,
    });
    return (await this.getVersionById(id))!;
  }

  // --- Binary Packages ---

  async listBinaries(packageVersionId: number): Promise<BinaryPackage[]> {
    return this.db('conancrates_binary_packages')
      .where({ package_version_id: packageVersionId })
      .orderBy('created_at', 'desc');
  }

  async getBinary(packageId: string): Promise<BinaryPackage | undefined> {
    return this.db('conancrates_binary_packages')
      .where({ package_id: packageId })
      .first();
  }

  async getBinaryById(id: number): Promise<BinaryPackage | undefined> {
    return this.db('conancrates_binary_packages').where({ id }).first();
  }

  async getBinaryByFilters(
    packageVersionId: number,
    filters: BinaryFilters,
  ): Promise<BinaryPackage | undefined> {
    const query = this.db('conancrates_binary_packages').where({
      package_version_id: packageVersionId,
    });
    if (filters.os) query.andWhere('os', filters.os);
    if (filters.arch) query.andWhere('arch', filters.arch);
    if (filters.compiler) query.andWhere('compiler', filters.compiler);
    if (filters.compiler_version)
      query.andWhere('compiler_version', filters.compiler_version);
    if (filters.build_type) query.andWhere('build_type', filters.build_type);
    return query.first();
  }

  async upsertBinary(
    packageVersionId: number,
    packageId: string,
    data: Partial<BinaryPackage>,
  ): Promise<BinaryPackage> {
    // Serialize JSON fields for SQLite
    const serialized: Record<string, unknown> = { ...data };
    if (serialized.dependency_graph && typeof serialized.dependency_graph === 'object') {
      serialized.dependency_graph = JSON.stringify(serialized.dependency_graph);
    }
    if (serialized.options && typeof serialized.options === 'object') {
      serialized.options = JSON.stringify(serialized.options);
    }

    const existing = await this.db('conancrates_binary_packages')
      .where({ package_version_id: packageVersionId, package_id: packageId })
      .first();
    if (existing) {
      await this.db('conancrates_binary_packages')
        .where({ id: existing.id })
        .update(serialized);
      return (await this.getBinaryById(existing.id))!;
    }
    const [id] = await this.db('conancrates_binary_packages').insert({
      package_version_id: packageVersionId,
      package_id: packageId,
      ...serialized,
    });
    return (await this.getBinaryById(id))!;
  }

  async incrementDownloadCount(binaryId: number): Promise<void> {
    await this.db('conancrates_binary_packages')
      .where({ id: binaryId })
      .increment('download_count', 1);
  }

  async deleteBinary(id: number): Promise<BinaryPackage | undefined> {
    const binary = await this.getBinaryById(id);
    if (binary) {
      await this.db('conancrates_binary_packages').where({ id }).delete();
    }
    return binary;
  }

  /** Delete a specific version and all its binaries and dependencies */
  async deleteVersion(entityRef: string, version: string): Promise<boolean> {
    const pkgVersion = await this.getVersion(entityRef, version);
    if (!pkgVersion) return false;

    // Delete dependencies, then binaries, then the version itself
    await this.db('conancrates_dependencies')
      .where({ package_version_id: pkgVersion.id })
      .delete();
    await this.db('conancrates_binary_packages')
      .where({ package_version_id: pkgVersion.id })
      .delete();
    await this.db('conancrates_package_versions')
      .where({ id: pkgVersion.id })
      .delete();

    return true;
  }

  /** Delete all versions (and their binaries/deps) for an entity */
  async deletePackage(entityRef: string): Promise<number> {
    const versions = await this.listVersions(entityRef);
    for (const v of versions) {
      await this.db('conancrates_dependencies')
        .where({ package_version_id: v.id })
        .delete();
      await this.db('conancrates_binary_packages')
        .where({ package_version_id: v.id })
        .delete();
    }
    const deleted = await this.db('conancrates_package_versions')
      .where({ entity_ref: entityRef })
      .delete();
    return deleted;
  }

  // --- Dependencies ---

  async listDependencies(packageVersionId: number): Promise<Dependency[]> {
    return this.db('conancrates_dependencies').where({
      package_version_id: packageVersionId,
    });
  }

  async upsertDependency(
    packageVersionId: number,
    requiresEntityRef: string,
    dependencyType: string,
    versionRequirement: string,
  ): Promise<void> {
    const existing = await this.db('conancrates_dependencies')
      .where({
        package_version_id: packageVersionId,
        requires_entity_ref: requiresEntityRef,
        dependency_type: dependencyType,
      })
      .first();

    if (existing) {
      await this.db('conancrates_dependencies')
        .where({ id: existing.id })
        .update({ version_requirement: versionRequirement });
    } else {
      await this.db('conancrates_dependencies').insert({
        package_version_id: packageVersionId,
        requires_entity_ref: requiresEntityRef,
        dependency_type: dependencyType,
        version_requirement: versionRequirement,
      });
    }
  }

  // --- API Docs ---

  async updateDocsStatus(
    versionId: number,
    status: string,
    docsPath: string,
    error: string,
  ): Promise<void> {
    await this.db('conancrates_package_versions')
      .where({ id: versionId })
      .update({
        api_docs_status: status,
        api_docs_path: docsPath,
        api_docs_error: error,
      });
  }

  // --- Stats ---

  async getStats(): Promise<RegistryStats> {
    const [versions] = await this.db('conancrates_package_versions').count(
      '* as count',
    );
    const [binaries] = await this.db('conancrates_binary_packages').count(
      '* as count',
    );
    const [packages] = await this.db('conancrates_package_versions')
      .countDistinct('entity_ref as count');

    return {
      totalPackages: Number(packages.count),
      totalVersions: Number(versions.count),
      totalBinaries: Number(binaries.count),
    };
  }

  async getRecentVersions(
    limit: number,
  ): Promise<PackageVersion[]> {
    return this.db('conancrates_package_versions')
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  /** Get all distinct entity refs that have versions registered */
  async getRegisteredEntityRefs(): Promise<string[]> {
    const rows = await this.db('conancrates_package_versions')
      .distinct('entity_ref')
      .orderBy('entity_ref');
    return rows.map((r: { entity_ref: string }) => r.entity_ref);
  }
}

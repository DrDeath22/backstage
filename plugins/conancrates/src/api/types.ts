export interface PackageVersion {
  id: number;
  entity_ref: string;
  version: string;
  recipe_revision: string;
  recipe_content: string;
  conan_version: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  description: string;
  license: string;
  author: string;
  homepage: string;
  topics: string;
  readme_content: string;
  security_notes: string;
}

export interface BinaryPackage {
  id: number;
  package_version_id: number;
  package_id: string;
  os: string;
  arch: string;
  compiler: string;
  compiler_version: string;
  build_type: string;
  options: Record<string, unknown>;
  dependency_graph: Record<string, unknown>;
  binary_file_path: string;
  rust_crate_file_path: string;
  file_size: number;
  sha256: string;
  download_count: number;
  created_at: string;
}

export interface Dependency {
  id: number;
  package_version_id: number;
  requires_entity_ref: string;
  version_requirement: string;
  dependency_type: 'requires' | 'build_requires' | 'test_requires';
}

export interface SecurityNote {
  cve: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  url?: string;
}

export interface RegistryStats {
  totalPackages: number;
  totalVersions: number;
  totalBinaries: number;
}

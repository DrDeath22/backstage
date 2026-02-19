# ConanCrates Backstage Port - Progress Summary

## Overview

ConanCrates is a private C++ package registry (like crates.io for Conan packages). This Backstage version replaces the original Django implementation with Spotify Backstage - a TypeScript/React developer portal platform.

## Architecture

- **Backstage Catalog** is used as the browsing/discovery layer. Each package (zlib, boost, etc.) is a catalog entity (`kind: Component`, `spec.type: conan-package`).
- **Plugin database tables** hold detailed registry data (versions, binaries, files, dependency graphs) that the catalog can't model.
- **A custom "Registry" tab** on each entity page provides drill-down into versions, platform binaries, downloads, and recipe viewing.
- **Storage** is abstracted behind a `StorageProvider` interface (local filesystem implemented, S3/Artifactory planned).
- **The existing Python CLI** is kept as-is - just point it at the Backstage backend URL.

## What's Done

### Phase 1: Backend Plugin (`plugins/conancrates-backend/`)

| Component | File | Description |
|-----------|------|-------------|
| Database schema | `migrations/20260218_init.js` | 3 tables: `conancrates_package_versions`, `conancrates_binary_packages`, `conancrates_dependencies` |
| Types | `src/types.ts` | TypeScript interfaces for all data models |
| DatabaseService | `src/service/DatabaseService.ts` | Knex query methods for all CRUD operations |
| StorageService | `src/service/StorageService.ts` | Local filesystem provider with path traversal prevention |
| Package routes | `src/routes/packageRoutes.ts` | `/stats`, `/recent`, `/packages/:ref/versions`, `/binaries`, `/dependencies`, `/recipe` |
| Upload routes | `src/routes/uploadRoutes.ts` | `POST /package/upload` with conanfile parsing and conaninfo extraction |
| Download routes | `src/routes/downloadRoutes.ts` | Binary download (streaming), Rust crate download, bundle preview |
| Plugin entry | `src/plugin.ts` | Backend plugin registration with Knex migrations and auth policy |
| Catalog module | `src/catalogModule.ts` | Entity provider that syncs packages to the Backstage catalog (5-min refresh) |
| Router | `src/router.ts` | Combines all route modules with `/health` endpoint |

### Phase 3: Frontend Plugin (`plugins/conancrates/`)

| Component | File | Description |
|-----------|------|-------------|
| API types | `src/api/types.ts` | PackageVersion, BinaryPackage, RegistryStats interfaces |
| API client | `src/api/ConancratesClient.ts` | Typed client using Backstage DiscoveryApi/FetchApi |
| Entity tab | `src/components/EntityConancratesTab.tsx` | Version selector, binaries table, download buttons, recipe viewer |
| Plugin def | `src/plugin.ts` | Plugin with API factory and routable extension |
| Exports | `src/index.ts` | Public API surface |

### App Integration

| File | Change |
|------|--------|
| `packages/backend/src/index.ts` | Registers backend plugin + catalog module |
| `packages/backend/package.json` | Links `@internal/plugin-conancrates-backend` |
| `packages/app/src/components/catalog/EntityPage.tsx` | Adds `conan-package` entity page with Registry tab |
| `packages/app/package.json` | Links `@internal/plugin-conancrates` |
| `app-config.yaml` | Storage configuration (`conancrates.storage.type: local`) |

## What's Remaining

### Phase 2: Bundle & Advanced Downloads
- Full bundle download (ZIP with main package + all dependencies)
- Extracted format downloads (reorganized into include/lib/bin/cmake dirs)
- Rust crate bundle download
- Conan V2 API routes (`/v2/ping`, credential check, recipe/binary upload, search)

### Phase 4: Migration & Lifecycle
- Data migration script from Django SQLite to Backstage DB
- File cleanup on delete

### Phase 5: Polish
- Authentication (map uploads to Backstage user identity)
- Testing (backend: supertest, frontend: component tests)
- Deployment config (Docker, PostgreSQL, S3/MinIO production config)

## Key Files from Django to Port

| Django File | Lines | Purpose | Status |
|-------------|-------|---------|--------|
| `packages/views/simple_upload.py` | 328 | Upload endpoint | Ported |
| `packages/views/download_views.py` | 1355 | All download logic | Partially ported (single binary done, bundle/extracted TODO) |
| `packages/models/` | - | Data model reference | Ported to Knex schema |
| `packages/urls.py` | 67 routes | Endpoint map | Core routes done |
| `conancrates/conancrates.py` | 1685 | CLI | Keep as-is, change server URL |

## Running

```bash
cd d:/ConanCrates/backstage
yarn install
yarn start          # starts both frontend (3000) and backend (7007)
```

Browse to http://localhost:3000 - sign in as guest, then navigate to the catalog.
Upload a package via the Python CLI pointed at http://localhost:7007/api/conancrates.

# ConanCrates Backstage - Resume Session

## Current Session Summary (2026-02-18)

### What We Accomplished

Built the initial Backstage version of ConanCrates and got packages showing in the catalog.

1. **Scaffolded Backstage App + Backend Plugin**
   - Created `plugins/conancrates-backend/` with full backend:
     - Knex migration for `conancrates_package_versions`, `conancrates_binary_packages`, `conancrates_dependencies`
     - `DatabaseService` with all CRUD operations
     - `StorageService` with local filesystem provider
     - Upload endpoint (recipe + binary + optional rust crate)
     - Download endpoints (binary, recipe)
     - Package listing routes (`/recent`, `/packages/:ref/versions`, etc.)

2. **Catalog Entity Provider**
   - `catalogModule.ts` - Syncs uploaded packages to Backstage catalog as `Component` entities with `spec.type: conan-package`
   - 30-second scheduled refresh + manual trigger after uploads
   - Required annotations: `backstage.io/managed-by-location`, `backstage.io/managed-by-origin-location`
   - Singleton pattern for `triggerCatalogRefresh()` called from upload route

3. **Frontend Plugin**
   - `plugins/conancrates/` with `EntityConancratesTab` component
   - Version selector, binary table, download buttons
   - API client (`ConancratesClient.ts`) for backend communication
   - Registered as "Registry" tab on entity pages

4. **Fixed Catalog Display Issues (major debugging session)**
   - **Problem:** Entities were in the catalog DB but CatalogIndexPage showed nothing
   - **Root cause 1:** Custom `filters` prop replaces `DefaultFilters` entirely, which removed `EntityKindPicker` - without it, the entity query never fires
   - **Root cause 2:** Default `initiallySelectedFilter="owned"` shows only entities owned by current user; guest user owns nothing
   - **Fix:** Added `EntityKindPicker` (hidden with `display:none`), `UserListPicker` with `initialFilter="all"`
   - **File:** `packages/app/src/App.tsx`

5. **Database Configuration**
   - Changed from in-memory SQLite to persistent: `connection: { directory: ./sqlite-data }`
   - Note: `connection.filename` is NOT supported for better-sqlite3 in Backstage, must use `connection.directory`

### Bugs Fixed

1. **Missing Backstage annotations** - Catalog warned about missing `backstage.io/managed-by-location`. Added both required annotations to entity provider.

2. **Silent error swallowing** - Entity provider catch block was `catch {}`. Added `this.logger.error()` with message and stack.

3. **5-minute refresh too slow** - Reduced to 30 seconds. Added manual POST `/api/conancrates/refresh-catalog` endpoint and auto-trigger after upload.

4. **CatalogIndexPage showing no entities** - Missing `EntityKindPicker` + `UserListPicker` defaulting to "owned". See item 4 above.

5. **SQLite connection config** - `connection: filename` not supported, must use `connection: { directory: ./sqlite-data }`.

### Key Backstage Lessons Learned

- `CatalogIndexPage` `filters` prop **replaces** `DefaultFilters` entirely (uses `??` operator). If you pass custom filters, you MUST include `EntityKindPicker` or entity queries won't fire.
- `DefaultFilters` includes: `EntityKindPicker`, `EntityTypePicker`, `UserListPicker`, `EntityOwnerPicker`, `EntityLifecyclePicker`, `EntityTagPicker`, `EntityProcessingStatusPicker`, `EntityNamespacePicker`
- `UserListPicker` defaults to `"owned"` filter which shows nothing for guest users
- To hide a filter while keeping it functional, wrap in `<div style={{ display: 'none' }}>`
- Entity provider `connect()` fires before HTTP routes are ready - first fetch may fail, but scheduled task retries
- `permission: { enabled: true }` with `allow-all-policy` works fine for dev

### Files Modified

**Backend Plugin (`plugins/conancrates-backend/`):**
- `src/catalogModule.ts` - Entity provider with annotations, error logging, 30s refresh, singleton trigger
- `src/router.ts` - Added `/refresh-catalog` POST endpoint
- `src/routes/uploadRoutes.ts` - Auto-trigger catalog refresh after upload
- `src/routes/downloadRoutes.ts` - Binary and recipe download routes
- `src/routes/packageRoutes.ts` - Package listing routes
- `src/service/DatabaseService.ts` - Knex CRUD operations
- `src/service/StorageService.ts` - Local filesystem storage
- `src/plugin.ts` - Backend plugin registration
- `src/module.ts` - Backend module for catalog integration
- `migrations/20260218_init.js` - Database schema

**Frontend Plugin (`plugins/conancrates/`):**
- `src/components/EntityConancratesTab.tsx` - Version/binary/download UI
- `src/api/ConancratesClient.ts` - API client
- `src/plugin.ts` - Plugin definition with entity tab

**App (`packages/app/`):**
- `src/App.tsx` - Routes, CatalogIndexPage with custom filters
- `src/components/catalog/EntityPage.tsx` - Entity page with Overview + Registry tabs

**Config:**
- `app-config.yaml` - SQLite persistent DB, conancrates storage config, guest auth

**Test Data (`test-data/`):**
- Sample conanfiles, binary tarballs, conaninfo files for testing uploads

### Current State

- 3 test packages uploaded and visible in catalog: **zlib/1.3.1**, **boost/1.84.0**, **openssl/3.2.1**
- Catalog page shows all packages with type/tag filters
- Individual entity pages work with Overview + Registry tabs
- Entity provider refreshes every 30 seconds
- Dev server: `yarn start` from `d:/ConanCrates/backstage/`

### What's Next

**Priority: Hook up CLI to Backstage backend**
- Update `django/conancrates/conancrates.py` upload command to POST to `http://localhost:7007/api/conancrates/package/upload`
- CLI currently targets the Django backend - needs to point at Backstage
- Field names: `recipe` (conanfile.py), `binary` (tarball), `package_name`, `version`
- Also update download command to use Backstage download endpoints

**Phase 2 remaining:**
- Bundle download (ZIP with all dependencies)
- Extracted format downloads (reorganized into include/lib/bin/cmake dirs)
- Rust crate bundle downloads
- Conan V2 API routes (`/v2/ping`, recipe/binary upload, search)

**Phase 3 remaining:**
- Polish frontend Registry tab (recipe viewer with syntax highlighting, dependency graph, usage instructions)
- Optional dashboard/stats page

**Phase 4:**
- Data migration from Django SQLite to Backstage DB

**Phase 5:**
- Authentication (map uploads to Backstage user identity)
- Testing (supertest, component tests)
- Deployment config (Docker, PostgreSQL, S3/MinIO)

## Running the Project

### Start Dev Server
```bash
cd d:/ConanCrates/backstage
yarn start
```
Opens at http://localhost:3000 (frontend) and http://localhost:7007 (backend API)

### Upload a Test Package
```bash
curl -X POST http://localhost:7007/api/conancrates/package/upload \
  -F "recipe=@test-data/conanfile.py" \
  -F "binary=@test-data/binary.tar.gz" \
  -F "package_name=zlib" \
  -F "version=1.3.1"
```

### Trigger Catalog Refresh
```bash
curl -X POST http://localhost:7007/api/conancrates/refresh-catalog
```

### Check Health
```bash
curl http://localhost:7007/api/conancrates/health
```

## Important Files Reference

### Backend Plugin
- `plugins/conancrates-backend/src/router.ts` - All route mounting
- `plugins/conancrates-backend/src/catalogModule.ts` - Entity provider + catalog module
- `plugins/conancrates-backend/src/service/DatabaseService.ts` - All DB queries
- `plugins/conancrates-backend/src/routes/uploadRoutes.ts` - Upload endpoint
- `plugins/conancrates-backend/src/routes/downloadRoutes.ts` - Download endpoints
- `plugins/conancrates-backend/src/routes/packageRoutes.ts` - Query endpoints

### Frontend Plugin
- `plugins/conancrates/src/components/EntityConancratesTab.tsx` - Main UI component
- `plugins/conancrates/src/api/ConancratesClient.ts` - API client

### App Wiring
- `packages/app/src/App.tsx` - Routes and CatalogIndexPage config
- `packages/app/src/components/catalog/EntityPage.tsx` - Entity page layout
- `packages/backend/src/index.ts` - Backend plugin registration
- `app-config.yaml` - All configuration

### Plan
- `.claude/plans/vast-booping-bee.md` - Full implementation plan

## Environment

- **Node.js/TypeScript** (Backstage framework)
- **Database:** SQLite via better-sqlite3 (persistent, `sqlite-data/` directory)
- **Storage:** Local filesystem (`data/uploads/`)
- **Auth:** Guest provider (dev mode)
- **Platform:** Windows 10, bash shell

# ConfigSnapshot — MERN Version

ConfigSnapshot exports Oracle Fusion Cloud setup configuration into combined Excel workbooks.

It also compares the same selected configuration across two saved environments using normalized, stable business keys and produces field-level Excel reports.

- Select an Oracle setup or choose All Setups.
- Select a functional area from that setup.
- Choose Required Tasks or All Tasks.
- Automatically load Oracle setup tasks for the selected functional area.
- Run one extraction request.
- Download one workbook containing Overview, Task Summary, and one sheet per task.
- If a task exports multiple CSV business objects, all files are written as sections in that task's sheet.
- Parent-child category exports include a customer view with one column per hierarchy level; original Oracle CSV sections remain available below it.
- Specialized REST extractors retain every attribute returned by Oracle. Readable mapped columns appear first and additional API attributes are appended automatically.

## Prerequisites

- Node.js 18+
- MongoDB locally or through Atlas
- An Oracle Fusion integration user with:
  - `ORA_ASM_FUNCTIONAL_SETUPS_USER_ABSTRACT`
  - task-specific application administrator privileges
  - CSV export support for the selected setup tasks
  - Inventory REST access when using Configure Subinventories or Manage Inventory Organizations
  - HCM organization/location read access for optional address and location-name enrichment

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The browser login page can supply the Fusion URL, username, and password, so Fusion credentials are optional in `.env`.

```env
PORT=5050
MONGODB_URI=mongodb://localhost:27017/configsnapshot
FUSION_BASE_URL=https://your-instance.oraclecloud.com
FUSION_USERNAME=your_integration_user
FUSION_PASSWORD=your_password
FUSION_ORG_CODES=ALL
PAGE_SIZE=500
TASK_EXPORT_POLL_MS=5000
TASK_EXPORT_TIMEOUT_MS=600000
CREDENTIAL_ENCRYPTION_KEY=replace_with_a_random_secret_at_least_32_chars
CORS_ORIGINS=http://localhost:3000
```

In local development, a private `backend/.credential-key` is generated automatically if `CREDENTIAL_ENCRYPTION_KEY` is omitted. Production deliberately requires the environment variable. The key and `.env` are ignored by Git.

`FUSION_ORG_CODES` is only used by organization-scoped extractors such as Configure Subinventories and Manage Inventory Organizations. The website can override it for each run.

## Frontend

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`, sign in, and open Configuration Snapshot. Select a setup to load its functional areas, or choose All Setups to browse every functional area. Selecting a functional area automatically loads and selects its available exportable tasks. Review the selection and generate the workbook.

To compare environments:

1. Open Settings and save at least two Oracle environments (for example DEV and UAT).
2. Test each saved connection.
3. Open Compare, select source/target, setup, functional area, and configuration items.
4. Run the comparison and download its workbook.

Saved passwords are AES-256-GCM encrypted, are never returned by the API, and are excluded from logs. Login creates an eight-hour in-memory API session so the browser does not resend the Oracle password for every request.

## Oracle API behavior

The implementation uses Oracle's supported REST resources:

- `features` for setup offerings and functional areas
- `setupTasks` for task metadata and task search
- `setupTaskCSVExports` for asynchronous task setup-data exports
- `subinventories` and child `locators` for the specialized Configure Subinventories extractor
- `inventoryOrganizations` and child `invOrgParameters` for Facilities → Manage Inventory Organizations
- HCM `organizations` and `locations` for optional internal-address and location enrichment

The specialized REST extractors do not use a restrictive output field list. They include every direct REST attribute returned by the connected Fusion release, including newly added and environment-specific attributes. Manage Inventory Organizations combines the parent organization and its inventory parameters into one wide row with manager-friendly headings first. Oracle navigation links are excluded because they are API metadata rather than configuration data.

Oracle's public REST API lists setup offerings, functional areas, and setup tasks separately, but does not expose their membership relationships or the same Required/All indicator shown by the Setup and Maintenance UI. The application therefore combines live task metadata with automatic functional-area matching and extensible exact catalogs. Procurement and Manufacturing and Supply Chain Materials Management setup mappings are included in `backend/src/setupOfferingCatalog.js`. Inventory Management, Facilities, and Suppliers task mappings are included in `backend/src/setupTaskCatalog.js`. Unknown setups gracefully show all functional areas, and selecting any area automatically discovers its matching tasks without requiring manual task search.

## Output and history

Generated workbooks are saved under `backend/output` and downloaded through an authenticated API. MongoDB history records the setup, functional area, task selection mode, per-task results, total records, workbook name, and success/partial/failure status.

Report downloads now use the authenticated `/api/reports/:filename` route and validate report ownership. History stores both `EXTRACT` and `COMPARE` operations, environments, duration, summary, warnings, and output reference. Audit records contain safe metadata only.

## Architecture

The original FSM and specialized REST extractors remain intact. `configurationExtractionService` wraps them for reuse, `normalizationService` converts their tables into a common record format, and `comparisonEngine` performs O(n + m) keyed comparison with `ADDED`, `REMOVED`, `MODIFIED`, and `UNCHANGED` results. Duplicate comparison keys are reported instead of silently overwritten. Configuration-specific keys and rules live in `configurationRegistry`; unknown task schemas receive conservative key inference.

## Verification

```bash
cd backend
npm run lint
npm run typecheck
npm test

cd ../frontend
npm run build
```

Hierarchy tasks such as Manage Supplier Products and Services Category Hierarchy are flattened into readable root-to-leaf paths (`Root Category`, `Level 1 Category`, `Level 2 Category`, and so on) with leaf descriptions and category codes.

Customer-view formatters currently cover:

- lookup tasks as a combined lookup type and lookup value table
- profile-option tasks as option, level, and configured-value rows
- value-set tasks as definitions, permitted values, validation sources, and relationships
- flexfield tasks as contexts, segments, value sets, and validation sections
- material-status tasks as an allowed-transaction matrix plus status details
- unit-of-measure tasks as readable class and conversion tables
- interorganization and intersubinventory tasks as source-to-destination transfer routes
- ABC tasks as grouped class, classification-set, and assignment-group tables

Each recognized task writes one concise customer view using lossless deduplication: every distinct Oracle dataset (for example, lookup type details and lookup codes) appears once in its own readable section, while duplicate representations are removed. Audit metadata such as creation and last-update columns is excluded unless it is part of the configuration itself. Tasks without a recognized structured schema continue to use the generic multi-section source format without dropping columns.

Task failures do not discard successful task data. A partial workbook remains downloadable and includes the error in Task Summary and in that task's sheet.
# ArConfig

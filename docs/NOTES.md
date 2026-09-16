# Extraction Notes — Subinventories & Locators (MERN version)

Fill this in as you test against a real Oracle Fusion Cloud dev/test
instance.

## 1. Endpoints used

| Object | Resource path | Notes |
|---|---|---|
| Subinventories | `/fscmRestApi/resources/11.13.18.05/subinventories` | Confirm exact path/version against your instance |
| Locators | `/fscmRestApi/resources/11.13.18.05/locators` | Confirm exact path/version against your instance |

## 2. Authentication

- Method used: (Basic Auth / OAuth2 — confirm which your instance requires)
- Any gotchas: (IP allowlisting, specific role/privilege needed on the integration user)

## 3. Pagination behavior observed

- Default page size / max page size:
- How `hasMore` behaves at the last page:

## 4. Field-mapping quirks (UI label -> API attribute)

| UI label | API attribute | Notes |
|---|---|---|
| e.g. Row/Rack/Bin segments | Attribute1 / Attribute2 / Attribute3 (flexfield) | segment order confirmed against instance? |
| | | |

## 5. What I'd change if extended further

- Move FIELD_MAP definitions into a DB collection instead of code, so
  mappings can be edited from the React UI without redeploying
- Add auth/login to the React app if this stops being a single-user pilot
- Add retry/backoff around Fusion REST calls for large organizations

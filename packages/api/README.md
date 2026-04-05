# @inspect/api

HTTP API server for inspect. Exposes REST endpoints for test management, session control, and results retrieval with RBAC middleware.

## Usage

```ts
import { ApiServer } from "@inspect/api/server.js";
```

## Key Exports

- `ApiServer` — HTTP API server with Effect HttpApi
- `rbacMiddleware` — role-based access control middleware
- `openapi.json` — OpenAPI specification

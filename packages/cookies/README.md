# @inspect/cookies

Extracts cookies from installed browsers (Chrome, Firefox, Safari) by reading their profile databases. Enables authenticated testing with real session state.

## Usage

```ts
import { Cookies } from "@inspect/cookies/cookies.js";
```

## Key Exports

- `Cookies` — cookie extraction service
- `BrowserDetector` — finds installed browser installations
- `CdpClient` — Chrome DevTools Protocol client for live cookie access

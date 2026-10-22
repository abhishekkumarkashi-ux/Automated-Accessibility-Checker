# AccessScan

AccessScan is a local, one-page accessibility checker prototype. It uses Playwright Chromium to load a public page in a fresh browser context and axe-core to report automated violations, passed rules, and checks that need a person to review. It does not score a page or certify WCAG conformance.

## Requirements

- Node.js 20 or newer (the project is compatible with Node 24)
- npm
- Chromium installed for Playwright

## Setup

```sh
npm install
npx playwright install chromium
```

## Run locally

```sh
npm run dev
```

Open the Vite address printed in the terminal (usually `http://127.0.0.1:5173`). The frontend proxies `/api` requests to the local Express server on port `3001`.

To check types and create a production frontend build:

```sh
npm run typecheck
npm run build
npm start
```

The production API serves JSON endpoints on `http://127.0.0.1:3001`. Serve the built `dist/` frontend separately with a static file server configured to proxy `/api` to the API.

## Try the built-in demo

Choose **Try demo scan** in the app. It reads `server/demo.html` directly and runs the installed axe-core package in Chromium without making an external website request. The fixture includes an image without alternative text, an unlabeled email field, and an unnamed button. The returned findings are produced by axe-core at scan time, not stored sample JSON.

## Scan a website

Enter a public `http://` or `https://` URL and choose **Scan website**. Each scan checks only that page. Results include the scanned URL and time, counts of axe rules in each category, affected elements, selectors and HTML, axe help links, and any WCAG tags provided by axe. Expand a finding to see details and curated guidance for a short list of common rules. Guidance is separate from axe's own description. Unknown rules do not receive invented fixes.

Use the category filters and search box to find rules by ID, description, help text, selector, HTML, or WCAG tag. **Copy selector**, **Copy HTML snippet**, **Download report (PDF)**, **Export JSON**, and **Scan another page** are available from the report. Choosing **Download report** generates a formatted multi-page PDF analyzing all detected barriers, severity metrics, affected elements, plain-language explanations, practical code fixes, and any generated AI remediation plans.

## URL safety and privacy

The server accepts HTTP and HTTPS only, rejects embedded credentials and local/reserved hostnames or IPs, and checks DNS answers before navigation. It also validates browser requests and redirects, limits redirects, blocks service workers and WebSockets, and uses a new browser context without user cookies or an authenticated session. Browser resources are closed after every scan. Scan URLs and results are held in memory only for the request and are not persisted.

The scanner runs on the machine hosting the local app. Only scan sites you are allowed to test. Sites may block automation, load slowly, or behave differently without a signed-in session.

## Scope and limitations

Automated rules cannot determine every accessibility issue. Incomplete results need manual review, and even a report with no automated violations is not a full audit. Keyboard-only use, meaningful reading order, real-world screen-reader behavior, content quality, and other contextual checks need human testing. Scans are limited to one page and do not crawl a site.

## Optional Accessibility Coach Agent (Microsoft Foundry)

AccessScan includes an optional, tool-using **Accessibility Coach Agent** powered by the **Microsoft Foundry Agent Service** and `@azure/ai-projects` with function-calling integration.

The coach does **not** replace the deterministic axe-core scanner. Instead, it acts as an advisory engineering assistant that evaluates scan findings on demand.

### Agent Function Tools
The agent accesses findings strictly through read-only server-side function tools:
1. `get_scan_findings(scanId)` — Retrieves the validated in-memory findings and summary for the scan.
2. `get_axe_rule_guidance(ruleId)` — Retrieves curated fix guidance, WCAG tags, and Deque University help URLs.
3. `prioritize_findings(scanId, limit)` — Deterministically ranks barriers by severity impact and affected element count.

### Security and Data Isolation
- **Untrusted Data Protection:** Page HTML snippets, selectors, and text content are treated strictly as untrusted data with prompt injection defense protocols. The agent never executes instructions discovered in page content.
- **Strict Isolation:** The agent cannot browse arbitrary URLs, write local files, execute code, or manipulate external websites.
- **Backend Credentials:** Azure credentials and model configurations are maintained entirely on the Node.js backend and never exposed to the browser.
- **In-Memory Retention:** Scans are indexed in memory with an automatic 30-minute expiry; scan data is never written to a database.
- **No Certification Claims:** The returned plan clearly states that it provides technical guidance and does not calculate a compliance score or grant official WCAG certification.

### Configuring Microsoft Foundry
To enable the AI Accessibility Coach:

1. Copy the example environment file:
   ```sh
   cp .env.example .env
   ```
2. Configure your Microsoft Foundry project endpoint and model deployment name in `.env`:
   ```env
   # Endpoint from Azure AI Foundry portal
   AZURE_AI_FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com
   AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT=gpt-4o-mini
   ```
3. Authenticate with Azure using the Azure CLI:
   ```sh
   az login
   ```
   (Alternatively, provide `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` for service principal authentication).
4. Restart the server (`npm run dev` or `npm start`).

### Unconfigured Behavior
If Microsoft Foundry credentials are not configured, AccessScan functions completely normally:
- All deterministic axe-core scanning, demo audits, filtering, searching, and JSON exports remain fully available.
- Selecting **Generate AI action plan** displays an informative notice explaining that Foundry configuration is required.
- AccessScan will **never** return fake or pretend AI responses when unconfigured.

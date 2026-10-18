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

Use the category filters and search box to find rules by ID, description, help text, selector, HTML, or WCAG tag. **Copy selector**, **Copy HTML snippet**, **Download JSON**, and **Scan another page** are available from the report.

## URL safety and privacy

The server accepts HTTP and HTTPS only, rejects embedded credentials and local/reserved hostnames or IPs, and checks DNS answers before navigation. It also validates browser requests and redirects, limits redirects, blocks service workers and WebSockets, and uses a new browser context without user cookies or an authenticated session. Browser resources are closed after every scan. Scan URLs and results are held in memory only for the request and are not persisted.

The scanner runs on the machine hosting the local app. Only scan sites you are allowed to test. Sites may block automation, load slowly, or behave differently without a signed-in session.

## Scope and limitations

Automated rules cannot determine every accessibility issue. Incomplete results need manual review, and even a report with no automated violations is not a full audit. Keyboard-only use, meaningful reading order, real-world screen-reader behavior, content quality, and other contextual checks need human testing. Scans are limited to one page and do not crawl a site.

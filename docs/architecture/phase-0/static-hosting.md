# Static Build and Subpath Hosting

**Status:** verified · 2026-11-20

## Question

Can the same artifact deploy to GitHub Pages, Cloudflare Pages, Netlify, a generic static host, and a local static server, including a project subpath such as `/bluekit/`?

## Decision

Use **Vite + Svelte 5** as a pure static SPA. Use **hash routing** (`#/tool/encoding.hash`). No SSR, no server routes, no rewrite rules required.

## Evidence

```bash
npm run build          # base "/"
npm run build:subpath  # vite build --base=/bluekit/
```

Observed output:

- `dist/index.html`
- one CSS bundle, one app JS bundle with source map
- a separate `assets/tool.worker-*.js` module-worker chunk
- self-hosted WOFF2 font subsets
- no server-only imports in the client graph

`index.html` references assets through Vite's base-aware URLs. The `favicon.svg` and `manifest.webmanifest` links are relative (`./…`), so they resolve correctly under a subpath.

The production build injects the CSP `<meta>` tag at build time. Development mode intentionally omits it because Vite's HMR client needs inline scripts and a websocket; the deployed artifact is the security boundary.

## Why hash routing

Path-based routing on a static host requires every deep link to return `index.html`. GitHub Pages and several generic hosts do not do that by default, and asking users to add rewrite rules undermines "deploy the folder and it works."

Hash routing gives:

- deep links that work on any static host;
- no 404-on-refresh failures;
- no host-specific configuration;
- simple offline caching later.

The trade-off is cosmetic (`/#/tools/email`). That is acceptable for a local analyst workbench.

## Verified commands

```bash
npm run build
npm run build:subpath
npm run preview
```

The subpath build must be served under `/bluekit/` (for example, copy `dist/` to a `bluekit` directory on the host). Serving the subpath build at `/` will produce 404s for `/bluekit/assets/...`; that is expected and is not an app bug.

## Constraints recorded for later

- **Service worker scope:** a worker registered at `/bluekit/sw.js` can only control `/bluekit/`. Offline support must use the configured base path, not a hardcoded `/`.
- **OPFS and service workers require a secure context.** HTTPS static hosting or `localhost` satisfies this.
- **No SPA rewrite dependency.** If path routing is ever introduced, every supported host needs a documented rewrite contract first.
- **Source maps are shipped in this build.** Decide per release whether public source maps are acceptable; they aid debugging but expose implementation detail.

## Residual risk

- Hosts that rewrite or minify HTML may interfere with the CSP meta tag. Prefer hosts that serve build output verbatim.
- The app cannot detect a misconfigured base path at runtime. The release checklist must include a subpath smoke test.

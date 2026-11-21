# Content Security Policy

BlueKit's production build injects a CSP `<meta>` tag at build time (`vite.config.ts`). Development mode omits it because Vite's HMR client needs inline scripts and a websocket. The deployed artifact is the security boundary.

## Production policy

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
child-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'none'
```

## Why each directive exists

| Directive | Reason |
|---|---|
| `default-src 'self'` | Deny by default. No remote origins are trusted. |
| `script-src 'self' 'wasm-unsafe-eval'` | App code is bundled locally. WASM compilation is allowed **without** enabling general `eval`. |
| `style-src 'self' 'unsafe-inline'` | Svelte emits inline style attributes for dynamic values. This is the one known relaxation; see below. |
| `img-src 'self' data: blob:` | Local icons, data-URI previews, and generated blobs. No remote image fetches. |
| `font-src 'self' data:` | Self-hosted WOFF2 subsets only. |
| `connect-src 'self'` | No direct network calls in Phase 1. Enabling a provider requires a deliberate policy change plus consent UX. |
| `worker-src 'self' blob:` | Module workers are same-origin; `blob:` supports worker shims where needed. |
| `child-src 'self' blob:` | Compatibility for browsers that consult `child-src` for workers. |
| `object-src 'none'` | No plugins or embedded objects. |
| `base-uri 'self'` | Prevent `<base>` injection from rewriting relative URLs. |
| `form-action 'none'` | The app has no form submissions. |
| `frame-ancestors 'none'` | Prevent clickjacking. Note: `frame-ancestors` is ignored in `<meta>` CSP; hosts should also send it as a header. |

## Known gaps

1. **`style-src 'unsafe-inline'`.** Svelte's dynamic style attributes require it today. Tightening means moving dynamic styles to CSS custom properties set through a nonce-free mechanism or accepting a build-time hash strategy. Do not remove it without testing every view.
2. **`frame-ancestors` in a meta tag is not enforced.** Static hosts should add `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as a response header.
3. **No `require-trusted-types-for` yet.** Adding Trusted Types requires auditing every DOM sink; it is a later hardening step.
4. **Meta CSP cannot restrict everything a header can.** A host-level header is recommended in addition to the build-time meta tag.

## Rules for future features

- **Adding a remote API** requires `connect-src` to name the exact origin, a terms review, and a visible consent step. Never add `*`.
- **Adding a WASM engine** requires it to be bundled and loaded from `'self'`. No CDN.
- **Adding a worker** must keep `worker-src` at `'self' blob:`. Do not add remote worker origins.
- **Adding an iframe** is out of scope; `frame-src` is intentionally absent and falls back to `default-src 'self'`.
- **Never add `'unsafe-eval'`.** `'wasm-unsafe-eval'` is the narrow exception.

## Verification

1. `npm run build`
2. Serve `dist/` (or the subpath build under its base path).
3. Open DevTools → Console and confirm no CSP violations.
4. Run Diagnostics: worker, WASM, storage, and OPFS probes must pass or report an explicit warning.
5. Confirm the `<meta http-equiv="Content-Security-Policy">` tag is present in `dist/index.html`.

Dev mode intentionally has no CSP meta tag. A missing tag in dev is expected; a missing tag in a production build is a release blocker.

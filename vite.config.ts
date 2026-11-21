import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

/**
 * Production-only Content Security Policy.
 *
 * Dev mode is intentionally excluded: Vite's HMR client uses inline scripts and
 * a websocket connection. The built artifact is what gets deployed, and that is
 * what must satisfy the policy described in docs/security/csp.md.
 *
 * `wasm-unsafe-eval` is required to compile WASM without allowing general eval.
 * `style-src 'unsafe-inline'` is currently required for Svelte's style props;
 * see docs/security/csp.md for the planned tightening.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'bluekit-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
      return html.replace('</head>', `    ${tag}\n  </head>`);
    },
  };
}


export default defineConfig({
  plugins: [svelte(), cspPlugin()],

  server: {
    allowedHosts: [
      'de02-2001-df0-b240-4bac-c96-2b81-37a0-ecf0.ngrok-free.app',
    ],
  },

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 4096,
  },

  worker: {
    format: 'es',
  },
});

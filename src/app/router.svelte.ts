export type RouteName =
  | 'overview'
  | 'tools'
  | 'tool'
  | 'mailsleuth'
  | 'ioc'
  | 'recipes'
  | 'investigations'
  | 'rules'
  | 'reference'
  | 'settings'
  | 'diagnostics';

export interface Route {
  name: RouteName;
  /** Tool id for `tool` routes. */
  id?: string;
  /** Category id for `tools` routes. */
  category?: string;
  /** Settings section, e.g. `storage`, `integrations`. */
  section?: string;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/u, '').replace(/\/+$/u, '');
  if (!cleaned) return { name: 'overview' };
  const [head, second, third] = cleaned.split('/');

  switch (head) {
    case 'overview':
      return { name: 'overview' };
    case 'tools':
      return { name: 'tools', ...(second ? { category: decode(second) } : {}) };
    case 'mailsleuth':
      return { name: 'mailsleuth' };
    case 'ioc':
      return { name: 'ioc' };
    case 'recipes':
      return { name: 'recipes' };
    case 'investigations':
      return { name: 'investigations' };
    case 'rules':
      return { name: 'rules' };
    case 'reference':
      return { name: 'reference' };
    case 'diagnostics':
      return { name: 'diagnostics' };
    case 'settings':
      return { name: 'settings', ...(second ? { section: decode(second) } : {}) };
    case 'tool':
      return second ? { name: 'tool', id: decode(second) } : { name: 'tools' };
    default:
      return { name: 'overview' };
  }
}

class RouterStore {
  route = $state<Route>({ name: 'overview' });

  constructor() {
    if (typeof window === 'undefined') return;
    this.route = parseHash(window.location.hash);
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/overview');
    }
    window.addEventListener('hashchange', () => {
      this.route = parseHash(window.location.hash);
    });
  }

  navigate(path: string): void {
    const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
    if (window.location.hash === target) {
      this.route = parseHash(target);
      return;
    }
    window.location.hash = target;
  }

  tool(id: string): void {
    this.navigate(`/tool/${encodeURIComponent(id)}`);
  }
}

export const router = new RouterStore();

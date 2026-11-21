import type { ComponentType, SvelteComponent } from 'svelte';
import type { IconProps } from 'lucide-svelte';

/**
 * lucide-svelte 1.x still ships legacy class components
 * (`SvelteComponentTyped`). Svelte 5's `Component` type only describes
 * function components, so maps and props that carry a dynamic icon use
 * this legacy-compatible constructor type instead.
 */
export type IconComponent = ComponentType<SvelteComponent<IconProps>>;

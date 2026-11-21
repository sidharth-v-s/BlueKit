import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

import { mount } from 'svelte';
import App from './App.svelte';
import { session } from '@/core/app/session.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('BlueKit root element is missing.');

// Hydrate local settings before mounting so density, motion, and tabs do not flash.
await session.init();

mount(App, { target });

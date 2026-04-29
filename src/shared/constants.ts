import type { Settings } from './types';

export const APP_NAME = 'Wikeep';
export const DB_NAME = 'wikeep';
export const DB_VERSION = 1;
export const SETTINGS_KEY = 'wikeep.settings';
export const SEARCH_DEBOUNCE_MS = 250;
export const CAPTURE_DEBOUNCE_MS = 1200;
export const PENDING_POLL_MS = 3000;
export const MAX_POLL_ATTEMPTS = 60;

export const DEFAULT_SETTINGS: Settings = {
  autoCaptureEnabled: true,
  preferredPanel: 'sidePanel',
  hasSeenPrivacyNotice: false,
  schemaVersion: 1
};

export const UI_TEXT_FILTER = new Set([
  'Copy',
  'Copied!',
  'View as codemap',
  'Searching codebase...',
  'Deep',
  'Fast',
  'Codemap'
]);

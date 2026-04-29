import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../shared/constants';
import type { Settings } from '../shared/types';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined)
  };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = {
    ...(await getSettings()),
    ...patch
  };

  await chrome.storage.local.set({
    [SETTINGS_KEY]: next
  });

  return next;
}

export async function ensureSettings(): Promise<Settings> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: current
  });
  return current;
}

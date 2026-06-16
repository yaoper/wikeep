import type { ImportDataPayload, UpdateSettingsPayload } from "../../shared/messages";
import {
  clearAllData,
  exportAllData,
  importAllData,
} from "../../storage/conversationRepository";
import {
  getSettings as getStoredSettings,
  updateSettings as updateStoredSettings,
} from "../../storage/settingsRepository";

export async function clearAll(): Promise<void> {
  return clearAllData();
}

export async function exportAll() {
  return exportAllData();
}

export async function importAll(payload: ImportDataPayload) {
  return importAllData(payload.backup);
}

export async function getSettings() {
  return getStoredSettings();
}

export async function updateSettings(payload: UpdateSettingsPayload) {
  return updateStoredSettings(payload.patch);
}

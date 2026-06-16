import { useCallback, useRef, useState } from "react";
import type { Settings } from "../../shared/types";
import { send } from "../api/client";

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const settingsRef = useRef<Settings | null>(null);

  const setSettings = useCallback((value: Settings | null) => {
    settingsRef.current = value;
    setSettingsState(value);
  }, []);

  const load = useCallback(async () => {
    const nextSettings = await send("GET_SETTINGS");
    setSettings(nextSettings);
    return nextSettings;
  }, [setSettings]);

  const toggleAutoCapture = useCallback(async () => {
    const current = settingsRef.current;
    if (!current) return null;

    const updated = await send("UPDATE_SETTINGS", {
      patch: { autoCaptureEnabled: !current.autoCaptureEnabled },
    });
    setSettings(updated);
    return updated;
  }, [setSettings]);

  const toggleAutoRefreshWikiPages = useCallback(async () => {
    const current = settingsRef.current;
    if (!current) return null;

    const updated = await send("UPDATE_SETTINGS", {
      patch: { autoRefreshWikiPages: !current.autoRefreshWikiPages },
    });
    setSettings(updated);
    return updated;
  }, [setSettings]);

  return {
    settings,
    setSettings,
    load,
    toggleAutoCapture,
    toggleAutoRefreshWikiPages,
  };
}

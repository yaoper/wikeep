import { EmptyState } from "../../components/EmptyState";
import type { Settings } from "../../../shared/types";

interface SettingsViewProps {
  settings: Settings | null;
  onToggleAutoCapture: () => void;
  onToggleAutoRefreshWikiPages: () => void;
  onClearAllData: () => void;
}

export function SettingsView({
  settings,
  onToggleAutoCapture,
  onToggleAutoRefreshWikiPages,
  onClearAllData,
}: SettingsViewProps) {
  return (
    <div className="settings settings--compact">
      <div className="settings-section">
        <div className="settings__section-title">Auto-save</div>
        {settings ? (
          <div className="settings__item settings__item--compact">
            <div className="settings__item-content">
              <div className="settings__label">Enable auto-save</div>
              <div className="settings__help">
                When a DeepWiki page is detected, automatically save the question
                and repo info locally.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoCaptureEnabled}
                onChange={onToggleAutoCapture}
              />
              <span className="toggle__track" />
            </label>
          </div>
        ) : (
          <EmptyState title="Loading settings" description="Please wait…" />
        )}
      </div>

      {settings ? (
        <div className="settings-section">
          <div className="settings__section-title">Wiki pages</div>
          <div className="settings__item settings__item--compact">
            <div className="settings__item-content">
              <div className="settings__label">Auto-refresh saved wiki pages</div>
              <div className="settings__help">
                If a saved wiki page changes, refresh it automatically when the
                page is open.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoRefreshWikiPages}
                onChange={onToggleAutoRefreshWikiPages}
              />
              <span className="toggle__track" />
            </label>
          </div>
        </div>
      ) : null}

      {settings ? (
        <div className="settings-section">
          <div className="settings__section-title">Data management</div>
          <div className="settings__item settings__item--compact">
            <div className="settings__item-content">
              <div className="settings__label">Clear all local data</div>
              <div className="settings__help">
                Deletes all saved history. This cannot be undone.
              </div>
            </div>
            <button
              type="button"
              className="btn btn--danger settings__danger-btn"
              onClick={onClearAllData}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

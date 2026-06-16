interface BackupViewProps {
  exportLoading: boolean;
  importLoading: boolean;
  onExportData: () => void;
  onImportData: () => void;
}

export function BackupView({
  exportLoading,
  importLoading,
  onExportData,
  onImportData,
}: BackupViewProps) {
  return (
    <div className="settings settings--compact">
      <div className="settings-section">
        <div className="settings__section-title">Export data</div>
        <div className="settings__item settings__item--compact">
          <div className="settings__item-content">
            <div className="settings__label">Export as JSON file</div>
            <div className="settings__help">
              Export all locally saved conversations as a backup file you can
              restore after reinstalling.
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary settings__danger-btn"
            onClick={onExportData}
            disabled={exportLoading}
          >
            {exportLoading ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings__section-title">Import data</div>
        <div className="settings__item settings__item--compact">
          <div className="settings__item-content">
            <div className="settings__label">Restore from backup file</div>
            <div className="settings__help">
              Choose a previously exported JSON backup; data is merged into your
              local records without deleting existing data.
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary settings__danger-btn"
            onClick={onImportData}
            disabled={importLoading}
          >
            {importLoading ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useState, type ChangeEvent } from "react";
import { ensureErrorMessage } from "../../shared/utils";
import { send } from "../api/client";
import { backupFilename } from "../sidepanel/backupFilename";
import { isBackupData } from "../sidepanel/backupValidation";

interface UseBackupOptions {
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onImported?: () => Promise<void> | void;
}

export function useBackup({ onError, onInfo, onImported }: UseBackupOptions) {
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const exportData = useCallback(async () => {
    setExportLoading(true);
    onError(null);

    try {
      const backup = await send("EXPORT_DATA");
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupFilename();
      anchor.click();
      URL.revokeObjectURL(url);
      onInfo(`Exported ${backup.conversations.length} conversations.`);
    } catch (error) {
      onError(`Export failed: ${ensureErrorMessage(error)}`);
    } finally {
      setExportLoading(false);
    }
  }, [onError, onInfo]);

  const importFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";

      if (!file) return;

      setImportLoading(true);
      onError(null);

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (!isBackupData(parsed)) {
          throw new Error(
            "Invalid backup file. Please choose a JSON file exported by Wikeep.",
          );
        }

        const result = await send("IMPORT_DATA", { backup: parsed });
        onInfo(`Imported ${result.conversationCount} conversations.`);
        await onImported?.();
      } catch (error) {
        onError(`Import failed: ${ensureErrorMessage(error)}`);
      } finally {
        setImportLoading(false);
      }
    },
    [onError, onImported, onInfo],
  );

  return {
    exportLoading,
    importLoading,
    exportData,
    importFileChange,
  };
}

import type { BackupData } from "../../shared/types";

export function isBackupData(value: unknown): value is BackupData {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<BackupData>;
  return (
    typeof candidate.version === "number" &&
    Array.isArray(candidate.conversations) &&
    Array.isArray(candidate.messages)
  );
}

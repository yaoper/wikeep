export function backupFilename(date = new Date()): string {
  return `wikeep-backup-${date.toISOString().slice(0, 10)}.json`;
}

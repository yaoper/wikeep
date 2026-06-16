import { describe, expect, it } from "vitest";
import { backupFilename } from "../src/ui/sidepanel/backupFilename";

describe("backupFilename", () => {
  it("formats the date in the backup filename", () => {
    expect(backupFilename(new Date("2026-06-16T12:00:00Z"))).toBe(
      "wikeep-backup-2026-06-16.json",
    );
  });
});

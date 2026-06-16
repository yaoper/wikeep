import type { SidePanelView } from "./viewTypes";

export function viewTitle(view: SidePanelView): string {
  if (view === "settings") return "Settings";
  if (view === "backup") return "Backup & Restore";
  return "";
}

export function hasBackButton(view: SidePanelView): boolean {
  return view === "settings" || view === "backup";
}

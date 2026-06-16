import type { ActiveTabContext, WikiPageTabState } from "../../shared/types";

export type StatusTone = "saved" | "pending" | "unknown";

export function isStatusPending(context: ActiveTabContext | null): boolean {
  const status = context?.status;
  return Boolean(
    status?.pending ||
      (status?.active && !status?.method) ||
      status?.reason === "dom_not_ready" ||
      status?.reason === "idle",
  );
}

export function getWikiStatusTone(wikiState?: WikiPageTabState): StatusTone {
  if (!wikiState) return "unknown";
  if (wikiState.state === "saved_fresh" || wikiState.state === "updated") {
    return "saved";
  }
  if (wikiState.state === "saved_stale") return "pending";
  return "unknown";
}

export function getStatusTone(context: ActiveTabContext | null): StatusTone {
  if (!context?.supported) return "unknown";

  if (context.routeKind === "wiki") {
    return getWikiStatusTone(context.wikiState);
  }

  const status = context.status;
  if (isStatusPending(context)) return "pending";

  if (
    status?.method === "api" ||
    status?.method === "dom" ||
    status?.reason === "already_saved" ||
    (status?.reason === "api_fetch_failed" && status.method === "dom")
  ) {
    return "saved";
  }

  return "unknown";
}

export function getStatusTitle(context: ActiveTabContext | null): string {
  if (!context?.supported) return "Not a DeepWiki page";

  if (context.routeKind === "wiki") {
    if (context.wikiState?.state === "saved_fresh") return "Wiki page saved";
    if (context.wikiState?.state === "saved_stale") return "Wiki page changed";
    if (context.wikiState?.state === "updated") return "Wiki page updated";
    return "Wiki page not saved";
  }

  if (context.status?.reason === "auto_capture_disabled") {
    return "Auto-save is off";
  }
  if (isStatusPending(context)) return "Saving session…";
  if (
    context.status?.method === "api" ||
    context.status?.method === "dom" ||
    context.status?.reason === "already_saved"
  ) {
    return "Session saved";
  }
  if (context.status?.reason === "storage_error") return "Save failed";
  return "Waiting to detect current session";
}

export function getStatusSubtitle(context: ActiveTabContext | null): string {
  if (!context?.supported) {
    return "Switch to DeepWiki to save a session or wiki page";
  }

  if (context.routeKind === "wiki") {
    if (context.wikiState?.state === "saved_stale") {
      return "Saved before, but this page now has newer content.";
    }
    if (
      context.wikiState?.state === "saved_fresh" ||
      context.wikiState?.state === "updated"
    ) {
      return "";
    }
    return "Save only this page, or save the full repository wiki.";
  }

  if (context.status?.reason === "auto_capture_disabled") {
    return "Save this page manually using the action on the right";
  }
  if (context.status?.reason === "storage_error") {
    return context.status.errorMessage ?? "Please try again later";
  }
  if (
    context.status?.reason === "api_fetch_failed" &&
    context.status.method === "dom"
  ) {
    return "Saved via DOM; API sync failed";
  }
  if (isStatusPending(context)) return "Fetching session info for this page";

  if (
    context.status?.method === "api" ||
    context.status?.method === "dom" ||
    context.status?.reason === "already_saved"
  ) {
    return "";
  }

  return "Open a DeepWiki session page to auto-detect";
}

export function getStatusActionLabel(
  context: ActiveTabContext | null,
): string | null {
  if (!context?.supported) return null;

  if (context.routeKind === "wiki") {
    return context.wikiState?.state === "saved_stale" ? "Refresh" : "Save page";
  }

  if (
    isStatusPending(context) ||
    context.status?.reason === "auto_capture_disabled"
  ) {
    return "Save now";
  }

  return "Save again";
}

export function shouldAutoRefreshContext(
  context: ActiveTabContext | null,
): boolean {
  if (!context?.supported || context.routeKind === "wiki") return false;
  return (
    isStatusPending(context) ||
    !context.status ||
    context.status?.reason === "idle"
  );
}

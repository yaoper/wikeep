import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { SearchBox } from "../components/SearchBox";
import { ConversationList } from "../components/ConversationList";
import { EmptyState } from "../components/EmptyState";
import { WikiPageList } from "../components/WikiPageList";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { SEARCH_DEBOUNCE_MS } from "../../shared/constants";
import type {
  ActiveTabContext,
  BackupData,
  CaptureResult,
  ConversationListItem,
  Settings,
  WikiPage,
  WikiPageTabState,
} from "../../shared/types";
import { ensureErrorMessage, sendRuntimeMessage } from "../../shared/utils";
import type {
  ActiveTabContextChangedPayload,
  CaptureDeepWikiSessionPayload,
  DeleteConversationPayload,
  DeleteWikiPagePayload,
  ExportConversationMarkdownResult,
  ExportDataResult,
  ExportWikiPageMarkdownResult,
  ImportDataPayload,
  ImportDataResult,
  ListConversationsPayload,
  ListWikiPagesPayload,
  RuntimeRequest,
  RuntimeResponse,
  SaveFullWikiPayload,
  SaveWikiPagePayload,
  SaveWikiPageResult,
  UpdateSettingsPayload,
  WikiPageStateChangedPayload,
} from "../../shared/messages";

type View = "history" | "settings" | "backup";
type StatusTone = "saved" | "pending" | "unknown";

function isStatusPending(context: ActiveTabContext | null): boolean {
  const status = context?.status;
  return Boolean(
    status?.pending ||
      (status?.active && !status?.method) ||
      status?.reason === "dom_not_ready" ||
      status?.reason === "idle",
  );
}

function getWikiStatusTone(wikiState?: WikiPageTabState): StatusTone {
  if (!wikiState) return "unknown";
  if (wikiState.state === "saved_fresh" || wikiState.state === "updated")
    return "saved";
  if (wikiState.state === "saved_stale") return "pending";
  return "unknown";
}

function getStatusTone(context: ActiveTabContext | null): StatusTone {
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

function getStatusTitle(context: ActiveTabContext | null): string {
  if (!context?.supported) return "Not a DeepWiki page";

  if (context.routeKind === "wiki") {
    if (context.wikiState?.state === "saved_fresh") return "Wiki page saved";
    if (context.wikiState?.state === "saved_stale") return "Wiki page changed";
    if (context.wikiState?.state === "updated") return "Wiki page updated";
    return "Wiki page not saved";
  }

  if (context.status?.reason === "auto_capture_disabled")
    return "Auto-save is off";
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

function getStatusSubtitle(context: ActiveTabContext | null): string {
  if (!context?.supported)
    return "Switch to DeepWiki to save a session or wiki page";

  if (context.routeKind === "wiki") {
    if (context.wikiState?.state === "saved_stale")
      return "Saved before, but this page now has newer content.";
    if (
      context.wikiState?.state === "saved_fresh" ||
      context.wikiState?.state === "updated"
    ) {
      return "";
    }
    return "Save only this page, or save the full repository wiki.";
  }

  if (context.status?.reason === "auto_capture_disabled")
    return "Save this page manually using the action on the right";
  if (context.status?.reason === "storage_error")
    return context.status.errorMessage ?? "Please try again later";
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

function getStatusActionLabel(context: ActiveTabContext | null): string | null {
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

function shouldAutoRefreshContext(context: ActiveTabContext | null): boolean {
  if (!context?.supported || context.routeKind === "wiki") return false;
  return (
    isStatusPending(context) ||
    !context.status ||
    context.status?.reason === "idle"
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ToastIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function SidePanelApp() {
  const [view, setView] = useState<View>("history");
  const [keyword, setKeyword] = useState("");
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [activeContext, setActiveContext] = useState<ActiveTabContext | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedKeyword = useDebouncedValue(keyword, SEARCH_DEBOUNCE_MS);

  async function loadConversations(
    nextKeyword?: string,
    options?: { silent?: boolean },
  ) {
    if (!options?.silent) {
      setLoading(true);
      setErrorMessage(null);
    }

    try {
      const items = await sendRuntimeMessage<
        ConversationListItem[],
        ListConversationsPayload
      >("LIST_CONVERSATIONS", { keyword: nextKeyword });
      setConversations(items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  async function loadWikiPages(
    nextKeyword?: string,
    options?: { silent?: boolean },
  ) {
    try {
      const items = await sendRuntimeMessage<WikiPage[], ListWikiPagesPayload>(
        "LIST_WIKI_PAGES",
        { keyword: nextKeyword },
      );
      setWikiPages(items);
    } catch (error) {
      if (!options?.silent) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function loadActiveContext(options?: { silent?: boolean }) {
    if (!options?.silent) setContextLoading(true);

    try {
      const nextContext = await sendRuntimeMessage<ActiveTabContext>(
        "GET_ACTIVE_TAB_CONTEXT",
      );
      setActiveContext(nextContext);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!options?.silent) setContextLoading(false);
    }
  }

  async function loadSettings() {
    const nextSettings = await sendRuntimeMessage<Settings>("GET_SETTINGS");
    setSettings(nextSettings);
  }

  async function refreshPanel(options?: { silent?: boolean }) {
    await Promise.all([
      loadConversations(debouncedKeyword, options),
      loadWikiPages(debouncedKeyword, options),
      loadActiveContext(options),
    ]);
  }

  useEffect(() => {
    void loadConversations(debouncedKeyword);
    void loadWikiPages(debouncedKeyword, { silent: true });
  }, [debouncedKeyword]);

  useEffect(() => {
    void loadActiveContext();
  }, []);

  useEffect(() => {
    if (view === "settings") void loadSettings();
  }, [view]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!shouldAutoRefreshContext(activeContext)) return;

    const timer = window.setInterval(() => {
      void loadActiveContext({ silent: true });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeContext]);

  useEffect(() => {
    const onFocus = () => {
      void refreshPanel({ silent: true });
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [debouncedKeyword]);

  useEffect(() => {
    const onMessage = (request: RuntimeRequest) => {
      if (request.command === "ACTIVE_TAB_CONTEXT_CHANGED") {
        const payload = request.payload as
          | ActiveTabContextChangedPayload
          | undefined;

        if (!payload?.context) return;

        setContextLoading(false);
        setActiveContext(payload.context);
        return;
      }

      if (request.command === "WIKI_PAGE_STATE_CHANGED") {
        const payload = request.payload as
          | WikiPageStateChangedPayload
          | undefined;
        if (!payload) return;

        setActiveContext((current) => {
          if (
            !current ||
            current.routeKind !== "wiki" ||
            current.url !== payload.url
          ) {
            return current;
          }
          return { ...current, wikiState: payload };
        });
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    if (activeContext?.status?.lastCapturedAt) {
      void loadConversations(debouncedKeyword, { silent: true });
    }
  }, [activeContext?.status?.lastCapturedAt, debouncedKeyword]);

  useEffect(() => {
    if (!infoMessage) return;

    const timer = window.setTimeout(() => {
      setInfoMessage(null);
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [infoMessage]);

  function handleBack() {
    setView("history");
    setInfoMessage(null);
  }

  async function handleDeleteConversation(conversationId: string) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;

    setInfoMessage(null);
    await sendRuntimeMessage<void, DeleteConversationPayload>(
      "DELETE_CONVERSATION",
      { conversationId },
    );
    await loadConversations(debouncedKeyword);
  }

  async function handleDeleteWikiPage(pageId: string) {
    if (!window.confirm("Delete this wiki page? This cannot be undone.")) {
      return;
    }

    setInfoMessage(null);
    await sendRuntimeMessage<void, DeleteWikiPagePayload>("DELETE_WIKI_PAGE", {
      pageId,
    });
    await loadWikiPages(debouncedKeyword);
  }

  async function handleClearAllData() {
    if (!window.confirm("Clear all locally saved data?")) return;

    setInfoMessage(null);
    await sendRuntimeMessage("CLEAR_ALL_DATA");
    await loadConversations(debouncedKeyword);
    await loadWikiPages(debouncedKeyword, { silent: true });
  }

  async function handleToggleAutoCapture() {
    if (!settings) return;

    const nextSettings = await sendRuntimeMessage<
      Settings,
      UpdateSettingsPayload
    >("UPDATE_SETTINGS", {
      patch: { autoCaptureEnabled: !settings.autoCaptureEnabled },
    });
    setSettings(nextSettings);
    await loadActiveContext();
  }

  async function handleToggleAutoRefreshWikiPages() {
    if (!settings) return;

    const nextSettings = await sendRuntimeMessage<
      Settings,
      UpdateSettingsPayload
    >("UPDATE_SETTINGS", {
      patch: { autoRefreshWikiPages: !settings.autoRefreshWikiPages },
    });
    setSettings(nextSettings);
  }

  async function handleCopySourceUrl(sourceUrl: string) {
    try {
      await navigator.clipboard.writeText(sourceUrl);
      setInfoMessage("Source URL copied to clipboard");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function downloadMarkdown(markdown: string, filename: string): void {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportMarkdown(conversationId: string) {
    setErrorMessage(null);

    try {
      const result = await sendRuntimeMessage<
        ExportConversationMarkdownResult,
        { conversationId: string }
      >("EXPORT_CONVERSATION_MARKDOWN", { conversationId });
      downloadMarkdown(result.markdown, result.filename);
      setInfoMessage("Markdown file exported");
    } catch (error) {
      setErrorMessage(`Export failed: ${ensureErrorMessage(error)}`);
    }
  }

  async function handleExportWikiMarkdown(pageId: string) {
    setErrorMessage(null);

    try {
      const result = await sendRuntimeMessage<
        ExportWikiPageMarkdownResult,
        { pageId: string }
      >("EXPORT_WIKI_PAGE_MARKDOWN", { pageId });
      downloadMarkdown(result.markdown, result.filename);
      setInfoMessage("Wiki Markdown file exported");
    } catch (error) {
      setErrorMessage(`Export failed: ${ensureErrorMessage(error)}`);
    }
  }

  async function handleSaveFullWiki() {
    if (activeContext?.routeKind !== "wiki") return;

    try {
      setErrorMessage(null);
      setInfoMessage(null);
      const result = await sendRuntimeMessage<
        SaveWikiPageResult,
        SaveFullWikiPayload
      >("SAVE_FULL_WIKI", {
        tabId: activeContext.tabId,
      });
      setInfoMessage(
        result.created
          ? "Full wiki saved."
          : result.changed
            ? "Full wiki refreshed."
            : "Full wiki saved again.",
      );
      await loadWikiPages(debouncedKeyword, { silent: true });
    } catch (error) {
      setErrorMessage(`Save full wiki failed: ${ensureErrorMessage(error)}`);
    }
  }

  async function handleManualSave() {
    if (!activeContext?.url) return;

    if (activeContext.routeKind === "wiki") {
      const wikiUrl = activeContext.url;
      try {
        setErrorMessage(null);
        setInfoMessage(null);
        const result = await sendRuntimeMessage<
          SaveWikiPageResult,
          SaveWikiPagePayload
        >("SAVE_WIKI_PAGE", {
          tabId: activeContext.tabId,
        });
        setActiveContext((current) =>
          current
            ? {
                ...current,
                wikiState: {
                  url: wikiUrl,
                  pageId: result.pageId,
                  title: result.title,
                  state: "saved_fresh",
                },
              }
            : current,
        );
        setInfoMessage(
          result.created
            ? "Wiki page saved."
            : result.changed
              ? "Wiki page refreshed."
              : "Wiki page saved again.",
        );
        await loadWikiPages(debouncedKeyword, { silent: true });
        return;
      } catch (error) {
        setErrorMessage(`Save failed: ${ensureErrorMessage(error)}`);
        return;
      }
    }

    if (!activeContext.queryId) return;

    setErrorMessage(null);
    setInfoMessage(null);

    if (activeContext.tabId) {
      try {
        const tabResponse = (await chrome.tabs.sendMessage(
          activeContext.tabId,
          {
            command: "TRIGGER_RECAPTURE",
          } satisfies RuntimeRequest,
        )) as RuntimeResponse<ActiveTabContext["status"]>;

        if (!tabResponse.ok) {
          throw new Error(
            tabResponse.error?.message ?? "Content script recapture failed",
          );
        }

        setActiveContext((current) =>
          current
            ? { ...current, status: tabResponse.data ?? current.status }
            : current,
        );
        setInfoMessage("Recapture triggered for the current session.");
        await refreshPanel();
        return;
      } catch {
        // Fall through to background capture fallback.
      }
    }

    try {
      const captureResult = await sendRuntimeMessage<
        CaptureResult,
        CaptureDeepWikiSessionPayload
      >("CAPTURE_DEEPWIKI_SESSION", {
        queryId: activeContext.queryId,
        sourceUrl: activeContext.url,
        tabId: activeContext.tabId,
      });

      setActiveContext((current) =>
        current
          ? {
              ...current,
              status: {
                ...(current.status ?? {
                  supported: true,
                  active: true,
                  queryId: current.queryId,
                  sourceUrl: current.url,
                }),
                method: captureResult.method,
                lastCapturedAt: captureResult.savedAt,
                pending: captureResult.pending,
                repoNames: captureResult.repoNames,
                reason: undefined,
                errorMessage: undefined,
                performance: captureResult.performance,
                existingConversationId: undefined,
              },
            }
          : current,
      );

      setInfoMessage("Current session re-saved via background.");
      await refreshPanel();
    } catch (error) {
      setErrorMessage(`Save failed: ${ensureErrorMessage(error)}`);
    }
  }

  async function handleExportData() {
    setExportLoading(true);
    setErrorMessage(null);

    try {
      const backup = await sendRuntimeMessage<ExportDataResult>("EXPORT_DATA");
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `wikeep-backup-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setInfoMessage(`Exported ${backup.conversations.length} conversations.`);
    } catch (error) {
      setErrorMessage(`Export failed: ${ensureErrorMessage(error)}`);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    setImportLoading(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      const backup = JSON.parse(text) as BackupData;

      if (
        typeof backup.version !== "number" ||
        !Array.isArray(backup.conversations) ||
        !Array.isArray(backup.messages)
      ) {
        throw new Error(
          "Invalid backup file. Please choose a JSON file exported by Wikeep.",
        );
      }

      const result = await sendRuntimeMessage<
        ImportDataResult,
        ImportDataPayload
      >("IMPORT_DATA", { backup });
      setInfoMessage(`Imported ${result.conversationCount} conversations.`);
      await loadConversations(debouncedKeyword);
      await loadWikiPages(debouncedKeyword, { silent: true });
    } catch (error) {
      setErrorMessage(`Import failed: ${ensureErrorMessage(error)}`);
    } finally {
      setImportLoading(false);
    }
  }

  const statusTone = getStatusTone(activeContext);
  const statusActionLabel = getStatusActionLabel(activeContext);
  const statusSubtitle = contextLoading
    ? "Please wait…"
    : getStatusSubtitle(activeContext);
  const showRecentLabel = !keyword.trim() && conversations.length > 0;
  const showWikiLabel = wikiPages.length > 0;
  const showBack = view === "settings" || view === "backup";
  const toolbarTitle =
    view === "settings"
      ? "Settings"
      : view === "backup"
        ? "Backup & Restore"
        : "";

  return (
    <div className="panel">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(e) => void handleImportFileChange(e)}
      />

      <div
        className={
          showBack
            ? "panel__toolbar panel__toolbar--settings"
            : "panel__toolbar"
        }
      >
        {showBack ? (
          <>
            <button className="back-btn" onClick={handleBack}>
              <BackIcon />
              <span>Back</span>
            </button>
            <div className="panel__toolbar-title">{toolbarTitle}</div>
          </>
        ) : (
          <>
            <SearchBox
              value={keyword}
              onChange={setKeyword}
              placeholder="Search by repo name or conversation"
            />
            <button
              type="button"
              className="btn-icon"
              title="Refresh"
              onClick={() => void refreshPanel()}
            >
              <RefreshIcon />
            </button>
            <div className="dropdown" ref={menuRef}>
              <button
                type="button"
                className="btn-icon"
                title="More"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreIcon />
              </button>
              {menuOpen ? (
                <div className="dropdown__menu">
                  <button
                    type="button"
                    className="dropdown__item"
                    onClick={() => {
                      setView("settings");
                      setMenuOpen(false);
                    }}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    className="dropdown__item"
                    onClick={() => {
                      setView("backup");
                      setMenuOpen(false);
                    }}
                  >
                    Backup & Restore
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {errorMessage ? (
        <div className="banner banner--error">{errorMessage}</div>
      ) : null}
      {infoMessage ? (
        <div className="toast-wrap">
          <div className="toast">
            <ToastIcon />
            {infoMessage}
          </div>
        </div>
      ) : null}

      {view === "history" ? (
        <div
          className={[
            "status-bar",
            statusTone === "saved" ? "is-saved" : "",
            statusTone === "pending" ? "is-pending" : "",
            statusTone === "unknown" ? "is-unknown" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span
            className={[
              "status-bar__dot",
              statusTone === "saved" ? "is-saved" : "",
              statusTone === "pending" ? "is-pending" : "",
              statusTone === "unknown" ? "is-unknown" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <div className="status-bar__main">
            <div
              className={[
                "status-bar__title",
                statusTone === "saved" ? "is-saved" : "",
                statusTone === "pending" ? "is-pending" : "",
                statusTone === "unknown" ? "is-unknown" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {contextLoading
                ? "Reading current page status"
                : getStatusTitle(activeContext)}
            </div>
            {statusSubtitle ? (
              <div className="status-bar__subtitle">{statusSubtitle}</div>
            ) : null}
          </div>
          {statusActionLabel ? (
            <button
              type="button"
              className="status-bar__action"
              onClick={() => void handleManualSave()}
            >
              {statusActionLabel}
            </button>
          ) : null}
          {activeContext?.routeKind === "wiki" ? (
            <button
              type="button"
              className="status-bar__action"
              title="Save every page from this repository wiki"
              onClick={() => void handleSaveFullWiki()}
            >
              Save full wiki
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="panel__content">
        {view === "settings" ? (
          <div className="settings settings--compact">
            <div className="settings-section">
              <div className="settings__section-title">Auto-save</div>
              {settings ? (
                <div className="settings__item settings__item--compact">
                  <div className="settings__item-content">
                    <div className="settings__label">Enable auto-save</div>
                    <div className="settings__help">
                      When a DeepWiki page is detected, automatically save the
                      question and repo info locally.
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoCaptureEnabled}
                      onChange={() => void handleToggleAutoCapture()}
                    />
                    <span className="toggle__track" />
                  </label>
                </div>
              ) : (
                <EmptyState
                  title="Loading settings"
                  description="Please wait…"
                />
              )}
            </div>

            {settings ? (
              <div className="settings-section">
                <div className="settings__section-title">Wiki pages</div>
                <div className="settings__item settings__item--compact">
                  <div className="settings__item-content">
                    <div className="settings__label">
                      Auto-refresh saved wiki pages
                    </div>
                    <div className="settings__help">
                      If a saved wiki page changes, refresh it automatically
                      when the page is open.
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoRefreshWikiPages}
                      onChange={() => void handleToggleAutoRefreshWikiPages()}
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
                    onClick={() => void handleClearAllData()}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : view === "backup" ? (
          <div className="settings settings--compact">
            <div className="settings-section">
              <div className="settings__section-title">Export data</div>
              <div className="settings__item settings__item--compact">
                <div className="settings__item-content">
                  <div className="settings__label">Export as JSON file</div>
                  <div className="settings__help">
                    Export all locally saved conversations as a backup file you
                    can restore after reinstalling.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary settings__danger-btn"
                  onClick={() => void handleExportData()}
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
                  <div className="settings__label">
                    Restore from backup file
                  </div>
                  <div className="settings__help">
                    Choose a previously exported JSON backup; data is merged
                    into your local records without deleting existing data.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary settings__danger-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLoading}
                >
                  {importLoading ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <EmptyState
                title="Loading history"
                description="Wikeep is reading local conversation records."
              />
            ) : conversations.length === 0 && wikiPages.length === 0 ? (
              <EmptyState
                title="No history yet"
                description={
                  keyword
                    ? "No saved sessions or wiki pages match your search."
                    : "Open a DeepWiki session or wiki page and Wikeep will help you save it locally."
                }
              />
            ) : (
              <>
                {conversations.length > 0 ? (
                  <>
                    {showRecentLabel ? (
                      <div className="panel__section-label">
                        Recent sessions
                      </div>
                    ) : null}
                    <ConversationList
                      items={conversations}
                      onDelete={(id) => void handleDeleteConversation(id)}
                      onCopyUrl={(url) => void handleCopySourceUrl(url)}
                      onOpenUrl={(url) => window.open(url, "_blank")}
                      onExportMarkdown={(id) => void handleExportMarkdown(id)}
                    />
                  </>
                ) : null}

                {wikiPages.length > 0 ? (
                  <>
                    {showWikiLabel ? (
                      <div className="panel__section-label">Wiki pages</div>
                    ) : null}
                    <WikiPageList
                      items={wikiPages}
                      onDelete={(id) => void handleDeleteWikiPage(id)}
                      onCopyUrl={(url) => void handleCopySourceUrl(url)}
                      onOpenUrl={(url) => window.open(url, "_blank")}
                      onExportMarkdown={(id) =>
                        void handleExportWikiMarkdown(id)
                      }
                    />
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

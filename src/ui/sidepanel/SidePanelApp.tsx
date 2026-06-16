import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { SearchBox } from "../components/SearchBox";

import {
  BackIcon,
  MoreIcon,
  RefreshIcon,
  ToastIcon,
} from "../components/icons";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { SEARCH_DEBOUNCE_MS } from "../../shared/constants";
import type {
  ActiveTabContext,
  BackupData,
  CaptureResult,
  ConversationListItem,
  Settings,
  WikiPage,
} from "../../shared/types";
import { ensureErrorMessage } from "../../shared/utils";
import type {
  ActiveTabContextChangedPayload,
  RuntimeRequest,
  RuntimeResponse,
  WikiPageStateChangedPayload,
} from "../../shared/messages";
import { send } from "../api/client";
import { BackupView } from "./views/BackupView";
import { HistoryView } from "./views/HistoryView";
import { SettingsView } from "./views/SettingsView";
import { getStatusViewModel } from "./statusModel";
import { shouldAutoRefreshContext } from "./status";
import { hasBackButton, viewTitle } from "./viewTitle";
import type { SidePanelView } from "./viewTypes";

export function SidePanelApp() {
  const [view, setView] = useState<SidePanelView>("history");
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
      const items = await send("LIST_CONVERSATIONS", {
        keyword: nextKeyword,
      });
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
      const items = await send("LIST_WIKI_PAGES", { keyword: nextKeyword });
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
      const nextContext = await send("GET_ACTIVE_TAB_CONTEXT");
      setActiveContext(nextContext);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!options?.silent) setContextLoading(false);
    }
  }

  async function loadSettings() {
    const nextSettings = await send("GET_SETTINGS");
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
    await send("DELETE_CONVERSATION", { conversationId });
    await loadConversations(debouncedKeyword);
  }

  async function handleDeleteWikiPage(pageId: string) {
    if (!window.confirm("Delete this wiki page? This cannot be undone.")) {
      return;
    }

    setInfoMessage(null);
    await send("DELETE_WIKI_PAGE", { pageId });
    await loadWikiPages(debouncedKeyword);
  }

  async function handleClearAllData() {
    if (!window.confirm("Clear all locally saved data?")) return;

    setInfoMessage(null);
    await send("CLEAR_ALL_DATA");
    await loadConversations(debouncedKeyword);
    await loadWikiPages(debouncedKeyword, { silent: true });
  }

  async function handleToggleAutoCapture() {
    if (!settings) return;

    const nextSettings = await send("UPDATE_SETTINGS", {
      patch: { autoCaptureEnabled: !settings.autoCaptureEnabled },
    });
    setSettings(nextSettings);
    await loadActiveContext();
  }

  async function handleToggleAutoRefreshWikiPages() {
    if (!settings) return;

    const nextSettings = await send("UPDATE_SETTINGS", {
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
      const result = await send("EXPORT_CONVERSATION_MARKDOWN", {
        conversationId,
      });
      downloadMarkdown(result.markdown, result.filename);
      setInfoMessage("Markdown file exported");
    } catch (error) {
      setErrorMessage(`Export failed: ${ensureErrorMessage(error)}`);
    }
  }

  async function handleExportWikiMarkdown(pageId: string) {
    setErrorMessage(null);

    try {
      const result = await send("EXPORT_WIKI_PAGE_MARKDOWN", { pageId });
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
      const result = await send("SAVE_FULL_WIKI", {
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
        const result = await send("SAVE_WIKI_PAGE", {
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
      const captureResult = await send("CAPTURE_DEEPWIKI_SESSION", {
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
      const backup = await send("EXPORT_DATA");
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

      const result = await send("IMPORT_DATA", { backup });
      setInfoMessage(`Imported ${result.conversationCount} conversations.`);
      await loadConversations(debouncedKeyword);
      await loadWikiPages(debouncedKeyword, { silent: true });
    } catch (error) {
      setErrorMessage(`Import failed: ${ensureErrorMessage(error)}`);
    } finally {
      setImportLoading(false);
    }
  }

  const statusView = getStatusViewModel(activeContext, contextLoading);
  const showBack = hasBackButton(view);
  const toolbarTitle = viewTitle(view);

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
        <div className={statusView.rootClassName}>
          <span className={statusView.dotClassName} />
          <div className="status-bar__main">
            <div className={statusView.titleClassName}>{statusView.title}</div>
            {statusView.subtitle ? (
              <div className="status-bar__subtitle">{statusView.subtitle}</div>
            ) : null}
          </div>
          {statusView.actionLabel ? (
            <button
              type="button"
              className="status-bar__action"
              onClick={() => void handleManualSave()}
            >
              {statusView.actionLabel}
            </button>
          ) : null}
          {statusView.showFullWikiAction ? (
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
          <SettingsView
            settings={settings}
            onToggleAutoCapture={() => void handleToggleAutoCapture()}
            onToggleAutoRefreshWikiPages={() =>
              void handleToggleAutoRefreshWikiPages()
            }
            onClearAllData={() => void handleClearAllData()}
          />
        ) : view === "backup" ? (
          <BackupView
            exportLoading={exportLoading}
            importLoading={importLoading}
            onExportData={() => void handleExportData()}
            onImportData={() => fileInputRef.current?.click()}
          />
        ) : (
          <HistoryView
            loading={loading}
            keyword={keyword}
            conversations={conversations}
            wikiPages={wikiPages}
            onDeleteConversation={(id) => void handleDeleteConversation(id)}
            onDeleteWikiPage={(id) => void handleDeleteWikiPage(id)}
            onCopyUrl={(url) => void handleCopySourceUrl(url)}
            onOpenUrl={(url) => window.open(url, "_blank")}
            onExportConversationMarkdown={(id) => void handleExportMarkdown(id)}
            onExportWikiMarkdown={(id) => void handleExportWikiMarkdown(id)}
          />
        )}
      </div>
    </div>
  );
}

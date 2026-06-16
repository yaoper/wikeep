import { useEffect, useRef, useState } from "react";
import { SearchBox } from "../components/SearchBox";

import {
  BackIcon,
  MoreIcon,
  RefreshIcon,
  ToastIcon,
} from "../components/icons";
import { useActiveTabContext } from "../hooks/useActiveTabContext";
import { useBackup } from "../hooks/useBackup";
import { useConversations } from "../hooks/useConversations";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useSettings } from "../hooks/useSettings";
import { useWikiPages } from "../hooks/useWikiPages";
import { SEARCH_DEBOUNCE_MS } from "../../shared/constants";
import type { CaptureStatus } from "../../shared/types";
import { ensureErrorMessage } from "../../shared/utils";
import type { RuntimeRequest, RuntimeResponse } from "../../shared/messages";
import { send } from "../api/client";
import { BackupView } from "./views/BackupView";
import { HistoryView } from "./views/HistoryView";
import { SettingsView } from "./views/SettingsView";
import { getStatusViewModel } from "./statusModel";
import { hasBackButton, viewTitle } from "./viewTitle";
import type { SidePanelView } from "./viewTypes";

export function SidePanelApp() {
  const [view, setView] = useState<SidePanelView>("history");
  const [keyword, setKeyword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const conversationsState = useConversations({ onError: setErrorMessage });
  const {
    conversations,
    loading,
    load: loadConversations,
  } = conversationsState;
  const wikiPagesState = useWikiPages({ onError: setErrorMessage });
  const { wikiPages, load: loadWikiPages } = wikiPagesState;
  const settingsState = useSettings();
  const { settings, load: loadSettings } = settingsState;
  const activeTabContextState = useActiveTabContext({
    onError: setErrorMessage,
  });
  const {
    activeContext,
    contextLoading,
    load: loadActiveContext,
    updateWikiState,
    updateStatus,
    applyCaptureResult,
  } = activeTabContextState;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedKeyword = useDebouncedValue(keyword, SEARCH_DEBOUNCE_MS);
  const backupState = useBackup({
    onError: setErrorMessage,
    onInfo: setInfoMessage,
    onImported: async () => {
      await loadConversations(debouncedKeyword);
      await loadWikiPages(debouncedKeyword, { silent: true });
    },
  });

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
    const onFocus = () => {
      void refreshPanel({ silent: true });
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [debouncedKeyword]);

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
    const nextSettings = await settingsState.toggleAutoCapture();
    if (!nextSettings) return;
    await loadActiveContext();
  }

  async function handleToggleAutoRefreshWikiPages() {
    await settingsState.toggleAutoRefreshWikiPages();
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
        updateWikiState({
          url: wikiUrl,
          pageId: result.pageId,
          title: result.title,
          state: "saved_fresh",
        });
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
        )) as RuntimeResponse<CaptureStatus | undefined>;

        if (!tabResponse.ok) {
          throw new Error(
            tabResponse.error?.message ?? "Content script recapture failed",
          );
        }

        updateStatus(tabResponse.data ?? activeContext.status);
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

      applyCaptureResult(captureResult);

      setInfoMessage("Current session re-saved via background.");
      await refreshPanel();
    } catch (error) {
      setErrorMessage(`Save failed: ${ensureErrorMessage(error)}`);
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
        onChange={(e) => void backupState.importFileChange(e)}
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
            exportLoading={backupState.exportLoading}
            importLoading={backupState.importLoading}
            onExportData={() => void backupState.exportData()}
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

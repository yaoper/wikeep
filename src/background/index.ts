import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { ensureErrorMessage } from "../shared/utils";
import { pruneLegacyConversationData } from "../storage/conversationRepository";
import { ensureSettings } from "../storage/settingsRepository";
import * as tabContext from "./handlers/tabContext";
import { handleRuntimeCommand } from "./router";

async function initializeExtension(): Promise<void> {
  await ensureSettings();
  await pruneLegacyConversationData();
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  });
  await tabContext.handleActiveTabChange();
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
});

void initializeExtension();

chrome.tabs.onActivated.addListener(() => {
  void tabContext.handleActiveTabChange();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    tabContext.clearTabCaches(tabId);
  }

  if (tab.active && (changeInfo.status || changeInfo.url)) {
    void tabContext.handleActiveTabChange();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabContext.clearTabCaches(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    void tabContext.handleActiveTabChange();
  }
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, sender, sendResponse) => {
    handleRuntimeCommand(request.command, request.payload, sender)
      .then((data) => {
        const response: RuntimeResponse = {
          ok: true,
          data,
        };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const response: RuntimeResponse = {
          ok: false,
          error: {
            code: "RUNTIME_ERROR",
            message: ensureErrorMessage(error),
          },
        };
        sendResponse(response);
      });

    return true;
  },
);

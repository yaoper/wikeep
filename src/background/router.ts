import type {
  CaptureDeepWikiSessionPayload,
  CaptureDomSnapshotPayload,
  DeleteConversationPayload,
  DeleteWikiPagePayload,
  ExportConversationMarkdownPayload,
  ExportWikiPageMarkdownPayload,
  GetConversationDetailPayload,
  GetWikiPagePayload,
  ImportDataPayload,
  ListConversationsPayload,
  ListWikiPagesPayload,
  LookupConversationByQueryIdPayload,
  RefreshWikiPagePayload,
  ReportPageStatusPayload,
  RuntimeCommand,
  SaveFullWikiPayload,
  SaveWikiPagePayload,
  UpdateSettingsPayload,
  WikiPageDetectedPayload,
} from "../shared/messages";
import * as conversations from "./handlers/conversations";
import * as data from "./handlers/data";
import * as tabContext from "./handlers/tabContext";
import * as wiki from "./handlers/wiki";

export async function handleRuntimeCommand(
  command: RuntimeCommand,
  payload: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (command) {
    case "CAPTURE_DEEPWIKI_SESSION":
      return conversations.captureViaApi({
        ...(payload as CaptureDeepWikiSessionPayload),
        tabId:
          (payload as CaptureDeepWikiSessionPayload).tabId ?? sender.tab?.id,
      });
    case "CAPTURE_DOM_SNAPSHOT":
      return conversations.captureViaDom(payload as CaptureDomSnapshotPayload);
    case "LIST_CONVERSATIONS":
      return conversations.list(
        (payload as ListConversationsPayload | undefined)?.keyword,
      );
    case "GET_CONVERSATION_DETAIL":
      return conversations.detail(
        (payload as GetConversationDetailPayload).conversationId,
      );
    case "DELETE_CONVERSATION":
      return conversations.deleteOne(
        (payload as DeleteConversationPayload).conversationId,
      );
    case "CLEAR_ALL_DATA":
      return data.clearAll();
    case "GET_SETTINGS":
      return data.getSettings();
    case "UPDATE_SETTINGS":
      return data.updateSettings(payload as UpdateSettingsPayload);
    case "GET_ACTIVE_TAB_CONTEXT":
      return tabContext.getActiveTabContext();
    case "OPEN_SIDE_PANEL":
      return tabContext.openSidePanelForActiveTab();
    case "LOOKUP_CAPTURE_BY_QUERY_ID":
      return conversations.lookupByQueryId(
        (payload as LookupConversationByQueryIdPayload).queryId,
      );
    case "REPORT_PAGE_STATUS":
      return tabContext.reportPageStatus(
        sender,
        payload as ReportPageStatusPayload,
      );
    case "WIKI_PAGE_DETECTED":
      return wiki.detected(sender, payload as WikiPageDetectedPayload);
    case "SAVE_WIKI_PAGE":
      return wiki.save({
        ...(payload as SaveWikiPagePayload),
        tabId:
          (payload as SaveWikiPagePayload | undefined)?.tabId ?? sender.tab?.id,
      });
    case "SAVE_FULL_WIKI":
      return wiki.saveFull({
        ...(payload as SaveFullWikiPayload),
        tabId:
          (payload as SaveFullWikiPayload | undefined)?.tabId ?? sender.tab?.id,
      });
    case "LIST_WIKI_PAGES":
      return wiki.list((payload as ListWikiPagesPayload | undefined)?.keyword);
    case "GET_WIKI_PAGE":
      return wiki.get((payload as GetWikiPagePayload).pageId);
    case "DELETE_WIKI_PAGE":
      return wiki.deleteOne((payload as DeleteWikiPagePayload).pageId);
    case "REFRESH_WIKI_PAGE":
      return wiki.refresh(payload as RefreshWikiPagePayload, sender);
    case "EXPORT_WIKI_PAGE_MARKDOWN":
      return wiki.exportMarkdown(payload as ExportWikiPageMarkdownPayload);
    case "ACTIVE_TAB_CONTEXT_CHANGED":
      return null;
    case "WIKI_PAGE_STATE_CHANGED":
      return null;
    case "EXPORT_DATA":
      return data.exportAll();
    case "IMPORT_DATA":
      return data.importAll(payload as ImportDataPayload);
    case "EXPORT_CONVERSATION_MARKDOWN":
      return conversations.exportMarkdown(
        payload as ExportConversationMarkdownPayload,
      );
    default:
      throw new Error(`Unsupported runtime command: ${String(command)}`);
  }
}

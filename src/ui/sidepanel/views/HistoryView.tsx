import { ConversationList } from "../../components/ConversationList";
import { EmptyState } from "../../components/EmptyState";
import { WikiPageList } from "../../components/WikiPageList";
import type { ConversationListItem, WikiPage } from "../../../shared/types";

interface HistoryViewProps {
  loading: boolean;
  keyword: string;
  conversations: ConversationListItem[];
  wikiPages: WikiPage[];
  onDeleteConversation: (id: string) => void;
  onDeleteWikiPage: (id: string) => void;
  onCopyUrl: (url: string) => void;
  onOpenUrl: (url: string) => void;
  onExportConversationMarkdown: (id: string) => void;
  onExportWikiMarkdown: (id: string) => void;
}

export function HistoryView({
  loading,
  keyword,
  conversations,
  wikiPages,
  onDeleteConversation,
  onDeleteWikiPage,
  onCopyUrl,
  onOpenUrl,
  onExportConversationMarkdown,
  onExportWikiMarkdown,
}: HistoryViewProps) {
  const showRecentLabel = !keyword.trim() && conversations.length > 0;
  const showWikiLabel = wikiPages.length > 0;

  if (loading) {
    return (
      <EmptyState
        title="Loading history"
        description="Wikeep is reading local conversation records."
      />
    );
  }

  if (conversations.length === 0 && wikiPages.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        description={
          keyword
            ? "No saved sessions or wiki pages match your search."
            : "Open a DeepWiki session or wiki page and Wikeep will help you save it locally."
        }
      />
    );
  }

  return (
    <>
      {conversations.length > 0 ? (
        <>
          {showRecentLabel ? (
            <div className="panel__section-label">Recent sessions</div>
          ) : null}
          <ConversationList
            items={conversations}
            onDelete={onDeleteConversation}
            onCopyUrl={onCopyUrl}
            onOpenUrl={onOpenUrl}
            onExportMarkdown={onExportConversationMarkdown}
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
            onDelete={onDeleteWikiPage}
            onCopyUrl={onCopyUrl}
            onOpenUrl={onOpenUrl}
            onExportMarkdown={onExportWikiMarkdown}
          />
        </>
      ) : null}
    </>
  );
}

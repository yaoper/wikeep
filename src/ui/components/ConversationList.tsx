import type { ConversationListItem } from '../../shared/types';

interface ConversationListProps {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

export function ConversationList({ items, selectedId, onSelect }: ConversationListProps) {
  return (
    <div className="conversation-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`conversation-card ${selectedId === item.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <div className="conversation-card__title">{item.title}</div>
          <div className="conversation-card__summary">
            {item.matchedSnippet ?? item.summary ?? '暂无摘要'}
          </div>
          <div className="conversation-card__meta">
            <span>{formatTime(item.updatedAt)}</span>
            <span>{item.messageCount} 条消息</span>
          </div>
        </button>
      ))}
    </div>
  );
}

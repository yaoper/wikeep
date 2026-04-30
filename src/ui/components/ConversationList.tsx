import type { ConversationListItem } from '../../shared/types';

interface ConversationListProps {
  items: ConversationListItem[];
  onDelete: (id: string) => void;
  onCopyUrl: (url: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 6L14 2M14 2H10M14 2V6" />
      <rect x="2" y="5" width="9" height="9" rx="2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 14,4" />
      <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M3.5 4l.9 9.5a1 1 0 001 .9h5.2a1 1 0 001-.9L12.5 4" />
    </svg>
  );
}

export function ConversationList({ items, onDelete, onCopyUrl }: ConversationListProps) {
  return (
    <div className="card-list">
      {items.map((item) => {
        const repoNames = item.metadata?.repoNames ?? [];
        const primaryRepo = repoNames.find(Boolean);
        const remainingRepoCount = primaryRepo ? repoNames.length - 1 : 0;

        return (
          <div key={item.id} className="card">
            <div className="card__body">
              <div className="card__question">{item.matchedSnippet?.trim() || item.question}</div>
              <div className="card__footer">
                <div className="card__repos">
                  {primaryRepo ? (
                    <span className="repo-badge">
                      <span className="repo-badge__dot" />
                      {primaryRepo}
                    </span>
                  ) : null}
                  {remainingRepoCount > 0 ? <span className="repo-badge">+{remainingRepoCount}</span> : null}
                </div>
                <div className="card__time">{formatRelativeTime(item.updatedAt)}</div>
              </div>
            </div>

            <div className="card__actions">
              <button
                type="button"
                className="card__action-btn"
                title="复制来源地址"
                onClick={() => onCopyUrl(item.sourceUrl)}
              >
                <LinkIcon />
              </button>
              <button
                type="button"
                className="card__action-btn is-danger"
                title="删除"
                onClick={() => onDelete(item.id)}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

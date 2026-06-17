import type { WikiPage } from '../../shared/types';

interface WikiPageListProps {
  items: WikiPage[];
  onDelete: (id: string) => void;
  onCopyUrl: (url: string) => void;
  onOpenUrl: (url: string) => void;
  onExportMarkdown: (id: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(timestamp).toLocaleDateString('en-US');
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" />
      <path d="M10 2h4v4" />
      <line x1="14" y1="2" x2="7" y2="9" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8" />
      <polyline points="4,7 8,11 12,7" />
      <path d="M3 13h10" />
    </svg>
  );
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getPageLabel(item: WikiPage): string {
  if (item.kind === 'full-wiki') return 'full wiki';
  // Devin section ids are bare numbers; combine with a title slug to match
  // DeepWiki's "<number>-<slug>" form, e.g. "1.1-getting-started-setup".
  if (item.source === 'devin-wiki') {
    const slug = item.title ? slugifyTitle(item.title) : '';
    if (item.sectionPath && slug) return `${item.sectionPath}-${slug}`;
    return item.sectionPath ?? slug ?? 'overview';
  }
  // DeepWiki section paths already encode the name ("2-core-reconciler-architecture").
  return item.sectionPath ?? 'overview';
}

export function WikiPageList({ items, onDelete, onCopyUrl, onOpenUrl, onExportMarkdown }: WikiPageListProps) {
  return (
    <div className="card-list">
      {items.map((item) => {
        const label = getPageLabel(item);

        return (
          <div key={item.id} className="card">
            <div className="card__body">
              <div className="card__question">{item.title}</div>
              <div className="card__footer">
                <div className="card__repos">
                  <span className="repo-badge">
                    <span className="repo-badge__dot" />
                    {item.repoFullName}
                  </span>
                  <span className="chip">{label}</span>
                  {item.isStale ? <span className="chip">stale</span> : null}
                </div>
                <div className="card__time">{formatRelativeTime(item.updatedAt)}</div>
              </div>
            </div>

            <div className="card__actions">
              <button
                type="button"
                className="card__action-btn"
                title="Open in browser"
                onClick={() => onOpenUrl(item.url)}
              >
                <ExternalLinkIcon />
              </button>
              <button
                type="button"
                className="card__action-btn"
                title="Copy source URL"
                onClick={() => onCopyUrl(item.url)}
              >
                <CopyIcon />
              </button>
              <button
                type="button"
                className="card__action-btn"
                title="Export Markdown"
                onClick={() => onExportMarkdown(item.id)}
              >
                <ExportIcon />
              </button>
              <button
                type="button"
                className="card__action-btn is-danger"
                title="Delete"
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

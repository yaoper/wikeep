# Step 8 — Side panel UI

**Files:** `src/ui/sidepanel/SidePanelApp.tsx`,
`src/ui/components/WikiPageList.tsx` (new)

Adds: a wiki Save/Refresh action in the status bar, a new **Wiki Pages** view in
the overflow menu, and an auto‑refresh toggle in Settings. Strings are English.

---

## 8.1 New view type & state

In `SidePanelApp.tsx`:

```ts
type View = 'history' | 'settings' | 'backup' | 'wiki'; // + 'wiki'

// inside the component:
const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
const [wikiState, setWikiState] = useState<WikiPageTabState | null>(null);
```

Load the list when the wiki view opens and react to background state pushes:

```ts
async function loadWikiPages(keyword?: string) {
  const items = await sendRuntimeMessage<WikiPage[], ListWikiPagesPayload>(
    'LIST_WIKI_PAGES',
    { keyword }
  );
  setWikiPages(items);
}

useEffect(() => {
  if (view === 'wiki') void loadWikiPages(debouncedKeyword);
}, [view, debouncedKeyword]);

// Only accept state pushes for the tab the panel is currently showing —
// otherwise a second DeepWiki tab could flip the Save/Refresh state.
useEffect(() => {
  const onMessage = (request: RuntimeRequest) => {
    if (request.command !== 'WIKI_PAGE_STATE_CHANGED') return;
    const payload = request.payload as WikiPageStateChangedPayload;
    if (activeContext?.url === payload.url) {
      setWikiState(payload);
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  return () => chrome.runtime.onMessage.removeListener(onMessage);
}, [activeContext?.url]);

// When the active tab changes, adopt the wiki state the background already
// cached for it (carried on ActiveTabContext.wikiState), or clear it.
useEffect(() => {
  setWikiState(activeContext?.wikiState ?? null);
}, [activeContext?.url, activeContext?.wikiState]);
```

---

## 8.2 Status-bar action (history view)

When the active tab is a wiki page, show a Save / Refresh action. Reuse the
existing `.status-bar` markup; add a branch keyed off `wikiState`.

```tsx
async function handleSaveWikiPage() {
  setErrorMessage(null);
  try {
    const res = await sendRuntimeMessage<SaveWikiPageResult, SaveWikiPagePayload>(
      'SAVE_WIKI_PAGE',
      { tabId: activeContext?.tabId }
    );
    setInfoMessage(res.created ? 'Wiki page saved.' : res.changed ? 'Wiki page updated.' : 'Already up to date.');
    if (view === 'wiki') await loadWikiPages(debouncedKeyword);
  } catch (error) {
    setErrorMessage(`Save failed: ${ensureErrorMessage(error)}`);
  }
}

// In the status bar, when wikiState?.state is set for the active tab:
{wikiState?.state === 'not_saved' && (
  <button type="button" className="status-bar__action" onClick={() => void handleSaveWikiPage()}>
    Save this page
  </button>
)}
{wikiState?.state === 'saved_stale' && (
  <button type="button" className="status-bar__action" onClick={() => void handleSaveWikiPage()}>
    Refresh
  </button>
)}
{wikiState?.state === 'saved_fresh' && (
  <span className="status-bar__title is-saved">Wiki page saved</span>
)}
{wikiState?.state === 'updated' && (
  <span className="status-bar__title is-saved">Wiki page updated</span>
)}
```

Add a "Wiki Pages" entry to the overflow dropdown (next to Settings / Backup):

```tsx
<button type="button" className="dropdown__item"
  onClick={() => { setView('wiki'); setMenuOpen(false); }}>
  Wiki Pages
</button>
```

And the toolbar title:

```ts
const toolbarTitle =
  view === 'settings' ? 'Settings'
  : view === 'backup' ? 'Backup & Restore'
  : view === 'wiki' ? 'Wiki Pages'
  : '';
```

---

## 8.3 Wiki Pages view body

```tsx
{view === 'wiki' ? (
  wikiPages.length === 0 ? (
    <EmptyState
      title="No saved wiki pages"
      description="Open a DeepWiki repo or section page and use “Save this page”."
    />
  ) : (
    <WikiPageList
      items={wikiPages}
      onOpen={(url) => window.open(url, '_blank')}
      onRefresh={(id) => void handleRefreshWiki(id)}
      onExport={(id) => void handleExportWiki(id)}
      onDelete={(id) => void handleDeleteWiki(id)}
    />
  )
) : null}
```

Handlers:

```ts
async function handleRefreshWiki(pageId: string) {
  await sendRuntimeMessage<SaveWikiPageResult, RefreshWikiPagePayload>('REFRESH_WIKI_PAGE', { pageId });
  await loadWikiPages(debouncedKeyword);
  setInfoMessage('Wiki page refreshed.');
}

async function handleDeleteWiki(pageId: string) {
  if (!window.confirm('Delete this saved wiki page?')) return;
  await sendRuntimeMessage<void, DeleteWikiPagePayload>('DELETE_WIKI_PAGE', { pageId });
  await loadWikiPages(debouncedKeyword);
}

async function handleExportWiki(pageId: string) {
  const res = await sendRuntimeMessage<ExportWikiPageMarkdownResult, ExportWikiPageMarkdownPayload>(
    'EXPORT_WIKI_PAGE_MARKDOWN', { pageId }
  );
  const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = res.filename; a.click();
  URL.revokeObjectURL(url);
  setInfoMessage('Markdown file exported.');
}
```

---

## 8.4 `src/ui/components/WikiPageList.tsx` (new)

```tsx
import type { WikiPage } from '../../shared/types';

interface Props {
  items: WikiPage[];
  onOpen: (url: string) => void;
  onRefresh: (pageId: string) => void;
  onExport: (pageId: string) => void;
  onDelete: (pageId: string) => void;
}

export function WikiPageList({ items, onOpen, onRefresh, onExport, onDelete }: Props) {
  return (
    <div className="card-list">
      {items.map((page) => (
        <div className="card" key={page.id}>
          <div className="card__main">
            <div className="card__title">
              {page.title}
              {page.isStale ? <span className="badge badge--warn">Update available</span> : null}
            </div>
            <div className="card__meta">
              {page.owner}/{page.repo}
              {page.sectionPath ? ` · ${page.sectionPath}` : ''} · {page.wordCount} words
            </div>
          </div>
          <div className="card__actions">
            <button className="card__action-btn" title="Open in browser" onClick={() => onOpen(page.url)}>↗</button>
            <button className="card__action-btn" title="Refresh from DeepWiki" onClick={() => onRefresh(page.id)}>⟳</button>
            <button className="card__action-btn" title="Export Markdown" onClick={() => onExport(page.id)}>⤓</button>
            <button className="card__action-btn is-danger" title="Delete" onClick={() => onDelete(page.id)}>🗑</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

> Reuse existing icon components (`ExternalLinkIcon`, `RefreshIcon`, etc.) instead
> of the emoji placeholders above to match the current visual style. Add a small
> `.badge--warn` rule to the stylesheet for the stale indicator.

---

## 8.5 Settings toggle

In the Settings view, mirror the existing auto‑save toggle:

```tsx
<div className="settings__item settings__item--compact">
  <div className="settings__item-content">
    <div className="settings__label">Auto-refresh saved wiki pages</div>
    <div className="settings__help">When a saved wiki page changes (after the repo updates), re-save it automatically.</div>
  </div>
  <label className="toggle">
    <input
      type="checkbox"
      checked={settings?.autoRefreshWikiPages ?? false}
      onChange={() => void handleToggleAutoRefreshWiki()}
    />
    <span className="toggle__track" />
  </label>
</div>
```

```ts
async function handleToggleAutoRefreshWiki() {
  if (!settings) return;
  const next = await sendRuntimeMessage<Settings, UpdateSettingsPayload>('UPDATE_SETTINGS', {
    patch: { autoRefreshWikiPages: !settings.autoRefreshWikiPages }
  });
  setSettings(next);
}
```

---

## Checklist

- [ ] `'wiki'` view + nav entry + toolbar title added.
- [ ] Status-bar Save / Refresh action driven by `WIKI_PAGE_STATE_CHANGED`.
- [ ] `WikiPageList` renders pages with stale badge + actions.
- [ ] Export downloads a `.md` via `EXPORT_WIKI_PAGE_MARKDOWN`.
- [ ] Settings toggle bound to `autoRefreshWikiPages`.
- [ ] All strings English; `npm run typecheck` passes.

# Step 11 — Live verification (DevTools MCP)

With the dev browser running the unpacked `dist/` (`wikeep-open-browser`, remote
debug on 9222) and `chrome-devtools-mcp` attached via `--browserUrl`, verify the
feature end‑to‑end.

---

## 11.1 Build & reload

```bash
nix develop --command wikeep-build
```

Reload the extension at `chrome://extensions` (↻ on the Wikeep card).

---

## 11.2 Manual save

1. Navigate the dev browser to `https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages`.
2. Open the side panel → the status bar should show **“Save this page”**.
3. Click it → expect **“Wiki page saved.”**

Confirm persistence directly in IndexedDB (via the MCP `evaluate_script` on an
extension page):

```js
async () => {
  const db = await new Promise(r => { const q = indexedDB.open('wikeep'); q.onsuccess = () => r(q.result); });
  const all = await new Promise(r => { const t = db.transaction('pages').objectStore('pages').getAll(); t.onsuccess = () => r(t.result); });
  return all.map(p => ({ id: p.id, title: p.title, commit: p.indexedCommit, words: p.wordCount, md: p.markdown.slice(0, 80) }));
}
```

Expect one row with the correct title, `indexedCommit`, word count, and Markdown
starting with the heading.

---

## 11.3 Markdown export

In the **Wiki Pages** view, click **Export** on the saved page. Verify the
downloaded `.md` has front‑matter (Repo / Page / Indexed commit / Saved at), the
section body, fenced code blocks with languages, GFM tables, and a diagram
placeholder line.

---

## 11.4 Auto‑refresh on change

1. Enable **Settings → Auto‑refresh saved wiki pages**.
2. Simulate a content change by editing the stored `contentHash` in IndexedDB,
   then revisit the page:

```js
// flip the stored hash so the next visit looks "changed"
async () => {
  const db = await new Promise(r => { const q = indexedDB.open('wikeep'); q.onsuccess = () => r(q.result); });
  const store = db.transaction('pages', 'readwrite').objectStore('pages');
  const all = await new Promise(r => { const t = store.getAll(); t.onsuccess = () => r(t.result); });
  const p = all[0]; p.contentHash = 'STALE'; store.put(p);
  return 'patched';
}
```

3. Reload the wiki tab. With auto‑refresh **on**, the panel should show
   **“Wiki page updated”** and the stored `contentHash` should return to the real
   value. With auto‑refresh **off**, expect a **stale badge / Refresh** button.

---

## 11.5 Regression — sessions still work

Open a `deepwiki.com/search/...` session and confirm the existing capture still
saves to `conversations` (the wiki changes must not affect it).

---

## Acceptance

- [ ] Save button appears only on wiki pages; saves to `pages` store.
- [ ] Exported `.md` is well‑formed.
- [ ] Auto‑refresh updates a stale page; off‑mode shows a Refresh affordance.
- [ ] `/search/*` session capture unaffected.
- [ ] `npm run typecheck`, `npm test`, `wikeep-build` all green.

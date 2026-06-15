export function extractWikiMarkdownFromRsc(joined: string): string | null {
  if (!joined) return null;

  const unescaped = joined
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t');

  const startIdx = unescaped.search(/(^|\n)#{1,2} \S/);
  if (startIdx === -1) return null;

  const body = unescaped.slice(startIdx);
  const lastFence = body.lastIndexOf('```');
  const end = lastFence !== -1 ? body.indexOf('\n', lastFence + 3) : body.length;
  const md = body.slice(0, end === -1 ? body.length : end).trim();

  return /#{1,3} /.test(md) && md.length > 200 ? md : null;
}

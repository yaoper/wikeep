import { describe, expect, it } from 'vitest';
import { parseDeepWikiDomSnapshot } from '../src/parser/deepwikiDomParser';

describe('deepwikiDomParser', () => {
  it('parses query display sections into user and assistant messages', () => {
    document.title = 'Example Session | DeepWiki';
    document.body.innerHTML = `
      <div data-query-display id="1">
        <div>
          <div>
            <div>
              <a href="/demo/repo">demo/repo</a>
              <div>第一个问题</div>
            </div>
            <div>Deep</div>
            <div>第一个回答</div>
          </div>
        </div>
      </div>
      <div data-query-display id="2">
        <div>
          <div>
            <div>
              <a href="/demo/repo">demo/repo</a>
              <div>第二个问题</div>
            </div>
            <div>Fast</div>
            <div>第二个回答</div>
          </div>
        </div>
      </div>
    `;

    const snapshot = parseDeepWikiDomSnapshot(
      document,
      'https://deepwiki.com/search/ragflowadmin_f49fa6f1-7111-4b98-826a-03c5c21742ce'
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sourceSessionId).toBe('ragflowadmin_f49fa6f1-7111-4b98-826a-03c5c21742ce');
    expect(snapshot?.messages).toHaveLength(4);
    expect(snapshot?.messages[0].content).toContain('第一个问题');
    expect(snapshot?.messages[1].content).toContain('第一个回答');
    expect(snapshot?.title).toBe('Example Session');
  });
});

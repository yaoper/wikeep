import { describe, expect, it } from 'vitest';
import { searchConversations } from '../src/search/searchService';
import type { Conversation } from '../src/shared/types';

const baseConversation: Conversation = {
  id: 'deepwiki:test',
  source: 'deepwiki',
  question: '如何接入 OAuth 登录？',
  sourceUrl: 'https://deepwiki.com/search/test',
  sourceSessionId: 'test',
  createdAt: 1,
  updatedAt: 2,
  schemaVersion: 2
};

describe('searchService', () => {
  it('matches by question text', () => {
    const results = searchConversations('OAuth', [baseConversation]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(baseConversation.id);
  });

  it('matches by repo name', () => {
    const results = searchConversations('demo/repo', [
      {
        ...baseConversation,
        metadata: {
          repoNames: ['demo/repo']
        }
      }
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].matchedSnippet).toContain('demo/repo');
  });
});

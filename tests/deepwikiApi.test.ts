import { describe, expect, it } from 'vitest';
import {
  buildCapturePayloadFromDeepWikiSession,
  extractQueryIdFromUrl,
  stripRelevantContext
} from '../src/api/deepwikiApi';
import type { DeepWikiQuerySession } from '../src/api/deepwikiTypes';

describe('deepwikiApi', () => {
  it('extracts query id from DeepWiki search url', () => {
    expect(
      extractQueryIdFromUrl(
        'https://deepwiki.com/search/ragflowadmin_f49fa6f1-7111-4b98-826a-03c5c21742ce'
      )
    ).toBe('ragflowadmin_f49fa6f1-7111-4b98-826a-03c5c21742ce');
    expect(extractQueryIdFromUrl('https://deepwiki.com')).toBeNull();
  });

  it('removes relevant context wrapper', () => {
    expect(
      stripRelevantContext(
        '<relevant_context>This query was sent from the wiki page: Overview.</relevant_context>hello world'
      )
    ).toBe('hello world');
  });

  it('maps DeepWiki API session into capture payload', () => {
    const session: DeepWikiQuerySession = {
      title:
        '<relevant_context>This query was sent from the wiki page: Overview.</relevant_context>测试标题',
      org_id: 'org_123',
      queries: [
        {
          message_id: 'message-1',
          user_query:
            '<relevant_context>This query was sent from the wiki page: Overview.</relevant_context>第一个问题',
          engine_id: 'omni',
          state: 'done',
          error: null,
          response: [
            {
              type: 'thoughts_start'
            },
            {
              type: 'chunk',
              data: 'thinking...'
            },
            {
              type: 'thoughts_end'
            },
            {
              type: 'chunk',
              data: '第一个回答'
            },
            {
              type: 'reference',
              data: {
                file_path: 'Repo demo/repo: src/index.ts',
                range_start: 1,
                range_end: 3
              }
            }
          ]
        },
        {
          message_id: 'message-2',
          user_query: '第二个问题',
          engine_id: 'omni',
          repo_names: ['demo/repo'],
          state: 'pending',
          error: null,
          response: [
            {
              type: 'chunk',
              data: '第二个回答'
            }
          ]
        }
      ]
    };

    const { snapshot, pending } = buildCapturePayloadFromDeepWikiSession(
      session,
      'https://deepwiki.com/search/demo_query'
    );

    expect(pending).toBe(true);
    expect(snapshot.title).toBe('测试标题');
    expect(snapshot.sourceSessionId).toBe('demo_query');
    expect(snapshot.messages).toHaveLength(4);
    expect(snapshot.metadata?.repoNames).toEqual(['demo/repo']);
    expect(snapshot.messages[0].content).toBe('第一个问题');
    expect(snapshot.messages[1].content).toBe('第一个回答');
    expect(snapshot.messages[1].metadata?.citations).toHaveLength(1);
    expect(snapshot.messages[3].content).toBe('第二个回答');
  });
});

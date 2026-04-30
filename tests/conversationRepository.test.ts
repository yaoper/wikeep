import { describe, expect, it } from 'vitest';
import { resolveConversationQuestion } from '../src/storage/conversationRepository';
import type { CapturePayload } from '../src/shared/types';

function createSnapshot(overrides: Partial<CapturePayload> = {}): CapturePayload {
  return {
    title: undefined,
    sourceUrl: 'https://deepwiki.com/search/demo_query',
    sourceHost: 'deepwiki.com',
    sourceSessionId: 'demo_query',
    messages: [],
    capturedAt: 1,
    ...overrides
  };
}

describe('conversationRepository', () => {
  it('prefers the session title over the latest follow-up question', () => {
    const question = resolveConversationQuestion(
      createSnapshot({
        title: 'ragflow是否可以支持配置金山云的对象存储服务，替换MinIO',
        messages: [
          { role: 'user', content: 'ragflow是否可以支持配置金山云的对象存储服务，替换MinIO', order: 0 },
          { role: 'assistant', content: '可以分析一下', order: 1 },
          { role: 'user', content: '是否可以接入七牛云？', order: 2 }
        ]
      })
    );

    expect(question).toBe('ragflow是否可以支持配置金山云的对象存储服务，替换MinIO');
  });

  it('falls back to the first user question when the title is empty', () => {
    const question = resolveConversationQuestion(
      createSnapshot({
        messages: [
          { role: 'user', content: '介绍下langchain的结构', order: 0 },
          { role: 'assistant', content: '好的', order: 1 },
          { role: 'user', content: '再展开下 agent', order: 2 }
        ]
      })
    );

    expect(question).toBe('介绍下langchain的结构');
  });
});

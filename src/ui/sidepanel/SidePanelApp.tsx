import { useEffect, useMemo, useState } from 'react';
import { SearchBox } from '../components/SearchBox';
import { ConversationList } from '../components/ConversationList';
import { MessageBubble } from '../components/MessageBubble';
import { EmptyState } from '../components/EmptyState';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { SEARCH_DEBOUNCE_MS } from '../../shared/constants';
import type {
  ConversationDetail,
  ConversationListItem,
  Settings
} from '../../shared/types';
import {
  sendRuntimeMessage
} from '../../shared/utils';
import type {
  DeleteConversationPayload,
  GetConversationDetailPayload,
  ListConversationsPayload,
  UpdateSettingsPayload
} from '../../shared/messages';

type View = 'history' | 'settings';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

export function SidePanelApp() {
  const [view, setView] = useState<View>('history');
  const [keyword, setKeyword] = useState('');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debouncedKeyword = useDebouncedValue(keyword, SEARCH_DEBOUNCE_MS);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  async function loadConversations(nextKeyword?: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const items = await sendRuntimeMessage<ConversationListItem[], ListConversationsPayload>(
        'LIST_CONVERSATIONS',
        {
          keyword: nextKeyword
        }
      );
      setConversations(items);
      setSelectedConversationId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }

        return items[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(conversationId: string) {
    setDetailLoading(true);

    try {
      const result = await sendRuntimeMessage<ConversationDetail | null, GetConversationDetailPayload>(
        'GET_CONVERSATION_DETAIL',
        {
          conversationId
        }
      );
      setDetail(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadSettings() {
    const nextSettings = await sendRuntimeMessage<Settings>('GET_SETTINGS');
    setSettings(nextSettings);
  }

  useEffect(() => {
    void loadConversations(debouncedKeyword);
  }, [debouncedKeyword]);

  useEffect(() => {
    if (selectedConversationId) {
      void loadDetail(selectedConversationId);
    } else {
      setDetail(null);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (view === 'settings') {
      void loadSettings();
    }
  }, [view]);

  async function handleDeleteConversation() {
    if (!detail || !window.confirm('确认删除这条会话吗？')) {
      return;
    }

    await sendRuntimeMessage<void, DeleteConversationPayload>('DELETE_CONVERSATION', {
      conversationId: detail.conversation.id
    });
    await loadConversations(debouncedKeyword);
  }

  async function handleClearAllData() {
    if (!window.confirm('确认清空所有本地保存的数据吗？')) {
      return;
    }

    await sendRuntimeMessage('CLEAR_ALL_DATA');
    setDetail(null);
    setSelectedConversationId(null);
    await loadConversations(debouncedKeyword);
  }

  async function handleToggleAutoCapture() {
    if (!settings) {
      return;
    }

    const nextSettings = await sendRuntimeMessage<Settings, UpdateSettingsPayload>('UPDATE_SETTINGS', {
      patch: {
        autoCaptureEnabled: !settings.autoCaptureEnabled
      }
    });
    setSettings(nextSettings);
  }

  return (
    <div className="app-shell">
      <div className="toolbar">
        <div className="toolbar__title">Wikeep</div>
        <div className="toolbar__actions">
          <button type="button" className="ghost-button" onClick={() => setView('history')}>
            历史
          </button>
          <button type="button" className="ghost-button" onClick={() => setView('settings')}>
            设置
          </button>
          <button type="button" className="secondary-button" onClick={() => void loadConversations(debouncedKeyword)}>
            刷新
          </button>
        </div>
      </div>

      {errorMessage ? <div className="banner is-error">{errorMessage}</div> : null}

      {view === 'settings' ? (
        <div className="panel-layout">
          <section className="settings-panel">
            <div className="section">
              <h2>基础设置</h2>
              {settings ? (
                <>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoCaptureEnabled}
                      onChange={() => void handleToggleAutoCapture()}
                    />
                    <span>开启自动保存</span>
                  </label>
                  <div className="banner is-info">Wikeep 默认只将数据保存在本地浏览器，不上传任何会话内容。</div>
                  <div className="settings-row">
                    <div>首选入口：{settings.preferredPanel === 'sidePanel' ? 'Side Panel' : 'Popup'}</div>
                    <div>Schema 版本：{settings.schemaVersion}</div>
                  </div>
                  <button type="button" className="danger-button" onClick={() => void handleClearAllData()}>
                    清空所有本地数据
                  </button>
                </>
              ) : (
                <EmptyState title="正在加载设置" description="请稍候…" />
              )}
            </div>
          </section>
          <section className="content-panel">
            <EmptyState
              title="设置说明"
              description="关闭自动保存后，Wikeep 不会继续自动抓取新的 DeepWiki session。"
            />
          </section>
        </div>
      ) : (
        <div className="panel-layout">
          <aside className="sidebar">
            <SearchBox value={keyword} onChange={setKeyword} placeholder="按标题、问题或回答搜索" />
            {loading ? (
              <EmptyState title="正在加载历史" description="Wikeep 正在读取本地会话记录。" />
            ) : conversations.length === 0 ? (
              <EmptyState
                title="暂无历史"
                description={keyword ? '没有匹配当前关键词的会话。' : '打开 DeepWiki session 页面后，Wikeep 会自动保存历史。'}
              />
            ) : (
              <ConversationList
                items={conversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
            )}
          </aside>

          <section className="content-panel">
            {detailLoading ? (
              <EmptyState title="正在加载详情" description="请稍候…" />
            ) : detail ? (
              <>
                <div className="detail-header">
                  <div>
                    <h2 className="detail-title">{detail.conversation.title}</h2>
                    <div className="detail-meta">
                      <span>更新时间：{formatDate(detail.conversation.updatedAt)}</span>
                      <span>来源：{detail.conversation.sourceUrl}</span>
                      <span>消息数：{detail.conversation.messageCount}</span>
                      {detail.conversation.metadata?.repoNames?.length ? (
                        <span>仓库：{detail.conversation.metadata.repoNames.join(', ')}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="detail-actions">
                    <button type="button" className="danger-button" onClick={() => void handleDeleteConversation()}>
                      删除会话
                    </button>
                  </div>
                </div>

                <div className="message-list">
                  {detail.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </>
            ) : selectedConversation ? (
              <EmptyState title="正在同步详情" description={`会话「${selectedConversation.title}」正在加载中。`} />
            ) : (
              <EmptyState title="未选择会话" description="在左侧列表中选择一条历史会话即可查看详情。" />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

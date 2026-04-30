import { useEffect, useRef, useState } from 'react';
import { SearchBox } from '../components/SearchBox';
import { ConversationList } from '../components/ConversationList';
import { EmptyState } from '../components/EmptyState';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { SEARCH_DEBOUNCE_MS } from '../../shared/constants';
import type { ConversationListItem, Settings } from '../../shared/types';
import { sendRuntimeMessage } from '../../shared/utils';
import type {
  DeleteConversationPayload,
  ListConversationsPayload,
  UpdateSettingsPayload
} from '../../shared/messages';

type View = 'history' | 'settings';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function SidePanelApp() {
  const [view, setView] = useState<View>('history');
  const [keyword, setKeyword] = useState('');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const debouncedKeyword = useDebouncedValue(keyword, SEARCH_DEBOUNCE_MS);
  const showBack = view === 'settings';

  async function loadConversations(nextKeyword?: string) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const items = await sendRuntimeMessage<ConversationListItem[], ListConversationsPayload>(
        'LIST_CONVERSATIONS',
        { keyword: nextKeyword }
      );
      setConversations(items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
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
    if (view === 'settings') {
      void loadSettings();
    }
  }, [view]);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [menuOpen]);

  function handleBack() {
    setView('history');
    setInfoMessage(null);
  }

  async function handleDeleteConversation(conversationId: string) {
    if (!window.confirm('确认删除这条记录吗？删除后无法恢复。')) {
      return;
    }

    setInfoMessage(null);
    await sendRuntimeMessage<void, DeleteConversationPayload>('DELETE_CONVERSATION', { conversationId });
    await loadConversations(debouncedKeyword);
  }

  async function handleClearAllData() {
    if (!window.confirm('确认清空所有本地保存的数据吗？')) {
      return;
    }

    setInfoMessage(null);
    await sendRuntimeMessage('CLEAR_ALL_DATA');
    await loadConversations(debouncedKeyword);
  }

  async function handleToggleAutoCapture() {
    if (!settings) {
      return;
    }

    const nextSettings = await sendRuntimeMessage<Settings, UpdateSettingsPayload>('UPDATE_SETTINGS', {
      patch: { autoCaptureEnabled: !settings.autoCaptureEnabled }
    });
    setSettings(nextSettings);
  }

  async function handleCopySourceUrl(sourceUrl: string) {
    try {
      await navigator.clipboard.writeText(sourceUrl);
      setInfoMessage('来源地址已复制到剪贴板');
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="panel">
      {/* ── Header ── */}
      <div className="panel__header">
        {showBack ? (
          <button className="back-btn" onClick={handleBack}>
            ← 返回
          </button>
        ) : (
          <>
            <div className="brand">
              <span className="brand__mark">W</span>
              <span className="brand__text panel__logo">Wikeep</span>
            </div>
            <div className="panel__tools">
              <button
                type="button"
                className="btn-icon"
                title="刷新"
                onClick={() => void loadConversations(debouncedKeyword)}
              >
                ↺
              </button>
              <div className="dropdown" ref={menuRef}>
                <button
                  type="button"
                  className="btn-icon"
                  title="更多"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋮
                </button>
                {menuOpen ? (
                  <div className="dropdown__menu">
                    <button
                      type="button"
                      className="dropdown__item"
                      onClick={() => {
                        setView('settings');
                        setMenuOpen(false);
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 6, flexShrink: 0}}>
                        <circle cx="8" cy="8" r="2.5" />
                        <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
                      </svg>
                      设置
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Banners ── */}
      {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
      {infoMessage ? <div className="banner banner--info">{infoMessage}</div> : null}

      {/* ── Content ── */}
      <div className="panel__content">
        {view === 'settings' ? (
          <div className="settings">
            <div>
              <div className="settings__section-title">自动保存</div>
              {settings ? (
                <div className="settings__item">
                  <div className="settings__item-content">
                    <div className="settings__label">开启自动保存</div>
                    <div className="settings__help">
                      识别到 DeepWiki 页面后，自动将问题和仓库信息保存到本地。
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoCaptureEnabled}
                      onChange={() => void handleToggleAutoCapture()}
                    />
                    <span className="toggle__track" />
                  </label>
                </div>
              ) : (
                <EmptyState title="正在加载设置" description="请稍候…" />
              )}
            </div>

            {settings ? (
              <div>
                <div className="settings__section-title">数据管理</div>
                <div className="settings__item">
                  <div className="settings__item-content">
                    <div className="settings__label">清空所有本地数据</div>
                    <div className="settings__help">删除所有保存的历史记录，此操作不可撤销。</div>
                  </div>
                  <button type="button" className="btn btn--danger" onClick={() => void handleClearAllData()}>
                    清空
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="按仓库名称或问题搜索" />
            {loading ? (
              <EmptyState title="正在加载历史" description="Wikeep 正在读取本地会话记录。" />
            ) : conversations.length === 0 ? (
              <EmptyState
                title="暂无历史"
                description={
                  keyword ? '没有匹配当前关键词的会话。' : '打开 DeepWiki session 页面后，Wikeep 会自动保存历史。'
                }
              />
            ) : (
              <>
                {!keyword.trim() ? <div className="panel__section-label">最近</div> : null}
                <ConversationList
                  items={conversations}
                  onDelete={(id) => void handleDeleteConversation(id)}
                  onCopyUrl={(url) => void handleCopySourceUrl(url)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

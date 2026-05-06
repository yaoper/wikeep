import { useEffect, useRef, useState } from 'react';
import { SearchBox } from '../components/SearchBox';
import { ConversationList } from '../components/ConversationList';
import { EmptyState } from '../components/EmptyState';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { SEARCH_DEBOUNCE_MS } from '../../shared/constants';
import type { ActiveTabContext, BackupData, CaptureResult, ConversationListItem, Settings } from '../../shared/types';
import { ensureErrorMessage, sendRuntimeMessage } from '../../shared/utils';
import type {
  ActiveTabContextChangedPayload,
  CaptureDeepWikiSessionPayload,
  DeleteConversationPayload,
  ExportDataResult,
  ImportDataPayload,
  ImportDataResult,
  ListConversationsPayload,
  RuntimeRequest,
  RuntimeResponse,
  UpdateSettingsPayload
} from '../../shared/messages';

type View = 'history' | 'settings' | 'backup';
type StatusTone = 'saved' | 'pending' | 'unknown';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function isStatusPending(context: ActiveTabContext | null): boolean {
  const status = context?.status;
  return Boolean(
    status?.pending ||
    (status?.active && !status?.method) ||
    status?.reason === 'dom_not_ready' ||
    status?.reason === 'idle'
  );
}

function getStatusTone(context: ActiveTabContext | null): StatusTone {
  if (!context?.supported) {
    return 'unknown';
  }

  const status = context.status;

  if (isStatusPending(context)) {
    return 'pending';
  }

  if (
    status?.method === 'api' ||
    status?.method === 'dom' ||
    status?.reason === 'already_saved' ||
    (status?.reason === 'api_fetch_failed' && status.method === 'dom')
  ) {
    return 'saved';
  }

  return 'unknown';
}

function getStatusTitle(context: ActiveTabContext | null): string {
  if (!context?.supported) return '非 DeepWiki 页面';
  if (context.status?.reason === 'auto_capture_disabled') return '自动保存已关闭';
  if (isStatusPending(context)) return 'Session 保存中';
  if (
    context.status?.method === 'api' ||
    context.status?.method === 'dom' ||
    context.status?.reason === 'already_saved'
  ) {
    return 'Session 已保存';
  }
  if (context.status?.reason === 'storage_error') return '保存失败';
  return '等待识别当前 Session';
}

function getStatusSubtitle(context: ActiveTabContext | null): string {
  if (!context?.supported) return '切换到 DeepWiki 后自动识别 Session';
  if (context.status?.reason === 'auto_capture_disabled') return '当前页可通过右侧操作手动保存';
  if (context.status?.reason === 'storage_error') return context.status.errorMessage ?? '请稍后重试';
  if (context.status?.reason === 'api_fetch_failed' && context.status.method === 'dom') {
    return '已通过 DOM 保存，API 同步失败';
  }
  if (isStatusPending(context)) return '正在获取页面 Session 信息';

  if (
    (
      context.status?.method === 'api' ||
      context.status?.method === 'dom' ||
      context.status?.reason === 'already_saved'
    )
  ) {
    return '';
  }

  return '打开 DeepWiki Session 页面后自动识别';
}

function getStatusActionLabel(context: ActiveTabContext | null): string | null {
  if (!context?.supported) {
    return null;
  }

  if (isStatusPending(context) || context.status?.reason === 'auto_capture_disabled') {
    return '手动保存';
  }

  return '重新保存';
}

function shouldAutoRefreshContext(context: ActiveTabContext | null): boolean {
  if (!context?.supported) {
    return false;
  }

  return isStatusPending(context) || !context.status || context.status?.reason === 'idle';
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ToastIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function SidePanelApp() {
  const [view, setView] = useState<View>('history');
  const [keyword, setKeyword] = useState('');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [activeContext, setActiveContext] = useState<ActiveTabContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedKeyword = useDebouncedValue(keyword, SEARCH_DEBOUNCE_MS);

  async function loadConversations(nextKeyword?: string, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
      setErrorMessage(null);
    }

    try {
      const items = await sendRuntimeMessage<ConversationListItem[], ListConversationsPayload>(
        'LIST_CONVERSATIONS',
        { keyword: nextKeyword }
      );
      setConversations(items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  async function loadActiveContext(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setContextLoading(true);
    }

    try {
      const nextContext = await sendRuntimeMessage<ActiveTabContext>('GET_ACTIVE_TAB_CONTEXT');
      setActiveContext(nextContext);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!options?.silent) {
        setContextLoading(false);
      }
    }
  }

  async function loadSettings() {
    const nextSettings = await sendRuntimeMessage<Settings>('GET_SETTINGS');
    setSettings(nextSettings);
  }

  async function refreshPanel(options?: { silent?: boolean }) {
    await Promise.all([
      loadConversations(debouncedKeyword, options),
      loadActiveContext(options)
    ]);
  }

  useEffect(() => {
    void loadConversations(debouncedKeyword);
  }, [debouncedKeyword]);

  useEffect(() => {
    void loadActiveContext();
  }, []);

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

  useEffect(() => {
    if (!shouldAutoRefreshContext(activeContext)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadActiveContext({ silent: true });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeContext]);

  useEffect(() => {
    const onFocus = () => {
      void refreshPanel({ silent: true });
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [debouncedKeyword]);

  useEffect(() => {
    const onMessage = (request: RuntimeRequest) => {
      if (request.command !== 'ACTIVE_TAB_CONTEXT_CHANGED') {
        return;
      }

      const payload = request.payload as ActiveTabContextChangedPayload | undefined;

      if (!payload?.context) {
        return;
      }

      setContextLoading(false);
      setActiveContext(payload.context);
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    if (activeContext?.status?.lastCapturedAt) {
      void loadConversations(debouncedKeyword, { silent: true });
    }
  }, [activeContext?.status?.lastCapturedAt, debouncedKeyword]);

  useEffect(() => {
    if (!infoMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInfoMessage(null);
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [infoMessage]);

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
    await loadActiveContext();
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

  async function handleManualSave() {
    if (!activeContext?.queryId || !activeContext.url) {
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);

    if (activeContext.tabId) {
      try {
        const tabResponse = (await chrome.tabs.sendMessage(activeContext.tabId, {
          command: 'TRIGGER_RECAPTURE'
        } satisfies RuntimeRequest)) as RuntimeResponse<ActiveTabContext['status']>;

        if (!tabResponse.ok) {
          throw new Error(tabResponse.error?.message ?? '内容脚本重新抓取失败');
        }

        setActiveContext((current) => current ? { ...current, status: tabResponse.data ?? current.status } : current);
        setInfoMessage('当前页面 Session 已触发重新保存。');
        await refreshPanel();
        return;
      } catch {
        // Fall through to background capture fallback.
      }
    }

    try {
      const captureResult = await sendRuntimeMessage<CaptureResult, CaptureDeepWikiSessionPayload>(
        'CAPTURE_DEEPWIKI_SESSION',
        {
          queryId: activeContext.queryId,
          sourceUrl: activeContext.url,
          tabId: activeContext.tabId
        }
      );

      setActiveContext((current) =>
        current
          ? {
              ...current,
              status: {
                ...(current.status ?? {
                  supported: true,
                  active: true,
                  queryId: current.queryId,
                  sourceUrl: current.url
                }),
                method: captureResult.method,
                lastCapturedAt: captureResult.savedAt,
                pending: captureResult.pending,
                repoNames: captureResult.repoNames,
                reason: undefined,
                errorMessage: undefined,
                performance: captureResult.performance,
                existingConversationId: undefined
              }
            }
          : current
      );

      setInfoMessage('当前页面 Session 已通过后台重新保存。');
      await refreshPanel();
    } catch (error) {
      setErrorMessage(`重新保存失败：${ensureErrorMessage(error)}`);
    }
  }

  async function handleExportData() {
    setExportLoading(true);
    setErrorMessage(null);

    try {
      const backup = await sendRuntimeMessage<ExportDataResult>('EXPORT_DATA');
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `wikeep-backup-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setInfoMessage(`已导出 ${backup.conversations.length} 条会话记录。`);
    } catch (error) {
      setErrorMessage(`导出失败：${ensureErrorMessage(error)}`);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) {
      return;
    }

    setImportLoading(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      const backup = JSON.parse(text) as BackupData;

      if (
        typeof backup.version !== 'number' ||
        !Array.isArray(backup.conversations) ||
        !Array.isArray(backup.messages)
      ) {
        throw new Error('备份文件格式不正确，请选择由 Wikeep 导出的 JSON 文件。');
      }

      const result = await sendRuntimeMessage<ImportDataResult, ImportDataPayload>('IMPORT_DATA', { backup });
      setInfoMessage(`已成功导入 ${result.conversationCount} 条会话记录。`);
      await loadConversations(debouncedKeyword);
    } catch (error) {
      setErrorMessage(`导入失败：${ensureErrorMessage(error)}`);
    } finally {
      setImportLoading(false);
    }
  }

  const statusTone = getStatusTone(activeContext);
  const statusActionLabel = getStatusActionLabel(activeContext);
  const statusSubtitle = contextLoading ? '请稍候…' : getStatusSubtitle(activeContext);
  const showRecentLabel = !keyword.trim() && conversations.length > 0;
  const showBack = view === 'settings' || view === 'backup';
  const toolbarTitle = view === 'settings' ? '设置' : view === 'backup' ? '数据备份' : '';

  return (
    <div className="panel">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => void handleImportFileChange(e)}
      />
      <div className={showBack ? 'panel__toolbar panel__toolbar--settings' : 'panel__toolbar'}>
        {showBack ? (
          <>
            <button className="back-btn" onClick={handleBack}>
              <BackIcon />
              <span>返回</span>
            </button>
            <div className="panel__toolbar-title">{toolbarTitle}</div>
          </>
        ) : (
          <>
            <SearchBox value={keyword} onChange={setKeyword} placeholder="支持搜索仓库名称或者对话内容" />
            <button
              type="button"
              className="btn-icon"
              title="刷新"
              onClick={() => void refreshPanel()}
            >
              <RefreshIcon />
            </button>
            <div className="dropdown" ref={menuRef}>
              <button
                type="button"
                className="btn-icon"
                title="更多"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreIcon />
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
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
                      <circle cx="8" cy="8" r="2.5" />
                      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
                    </svg>
                    设置
                  </button>
                  <button
                    type="button"
                    className="dropdown__item"
                    onClick={() => {
                      setView('backup');
                      setMenuOpen(false);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
                      <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
                      <polyline points="4 7 8 11 12 7" />
                      <line x1="8" y1="2" x2="8" y2="11" />
                    </svg>
                    数据备份
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
      {infoMessage ? (
        <div className="toast-wrap">
          <div className="toast">
            <ToastIcon />
            {infoMessage}
          </div>
        </div>
      ) : null}

      {view === 'history' ? (
        <div
          className={[
            'status-bar',
            statusTone === 'saved' ? 'is-saved' : '',
            statusTone === 'pending' ? 'is-pending' : '',
            statusTone === 'unknown' ? 'is-unknown' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span
            className={[
              'status-bar__dot',
              statusTone === 'saved' ? 'is-saved' : '',
              statusTone === 'pending' ? 'is-pending' : '',
              statusTone === 'unknown' ? 'is-unknown' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          />
          <div className="status-bar__main">
            <div
              className={[
                'status-bar__title',
                statusTone === 'saved' ? 'is-saved' : '',
                statusTone === 'pending' ? 'is-pending' : '',
                statusTone === 'unknown' ? 'is-unknown' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {contextLoading ? '正在读取当前页面状态' : getStatusTitle(activeContext)}
            </div>
            {statusSubtitle ? (
              <div className="status-bar__subtitle">
                {statusSubtitle}
              </div>
            ) : null}
          </div>
          {statusActionLabel ? (
            <button type="button" className="status-bar__action" onClick={() => void handleManualSave()}>
              {statusActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="panel__content">
        {view === 'settings' ? (
          <div className="settings settings--compact">
            <div className="settings-section">
              <div className="settings__section-title">自动保存</div>
              {settings ? (
                <div className="settings__item settings__item--compact">
                  <div className="settings__item-content">
                    <div className="settings__label">开启自动保存</div>
                    <div className="settings__help">识别到 DeepWiki 页面后，自动将问题和仓库信息保存到本地。</div>
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
              <div className="settings-section">
                <div className="settings__section-title">数据管理</div>
                <div className="settings__item settings__item--compact">
                  <div className="settings__item-content">
                    <div className="settings__label">清空所有本地数据</div>
                    <div className="settings__help">删除所有保存的历史记录，此操作不可撤销。</div>
                  </div>
                  <button type="button" className="btn btn--danger settings__danger-btn" onClick={() => void handleClearAllData()}>
                    清空
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : view === 'backup' ? (
          <div className="settings settings--compact">
            <div className="settings-section">
              <div className="settings__section-title">导出数据</div>
              <div className="settings__item settings__item--compact">
                <div className="settings__item-content">
                  <div className="settings__label">导出为 JSON 文件</div>
                  <div className="settings__help">将所有本地保存的会话数据导出为备份文件，可在重装插件后恢复。</div>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary settings__danger-btn"
                  onClick={() => void handleExportData()}
                  disabled={exportLoading}
                >
                  {exportLoading ? '导出中…' : '导出'}
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings__section-title">导入数据</div>
              <div className="settings__item settings__item--compact">
                <div className="settings__item-content">
                  <div className="settings__label">从备份文件恢复</div>
                  <div className="settings__help">选择之前导出的 JSON 备份文件，将数据合并到当前本地记录中，不会删除已有数据。</div>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary settings__danger-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLoading}
                >
                  {importLoading ? '导入中…' : '导入'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <EmptyState title="正在加载历史" description="Wikeep 正在读取本地会话记录。" />
            ) : conversations.length === 0 ? (
              <EmptyState
                title="暂无历史"
                description={
                  keyword ? '没有匹配当前关键词的会话。' : '打开 DeepWiki Session 页面后，Wikeep 会自动保存历史。'
                }
              />
            ) : (
              <>
                {showRecentLabel ? <div className="panel__section-label">最近</div> : null}
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

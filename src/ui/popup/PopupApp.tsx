import { useEffect, useState } from 'react';
import type { ActiveTabContext, CaptureResult } from '../../shared/types';
import type {
  CaptureDeepWikiSessionPayload,
  RuntimeRequest,
  RuntimeResponse
} from '../../shared/messages';
import { ensureErrorMessage, sendRuntimeMessage } from '../../shared/utils';
import { EmptyState } from '../components/EmptyState';

function getStatusDotClass(context: ActiveTabContext): string {
  if (!context.supported) return 'status-dot';
  if (context.status?.pending) return 'status-dot is-pending';
  if (context.status?.reason === 'api_fetch_failed' || context.status?.reason === 'dom_not_ready') {
    return 'status-dot is-error';
  }
  if (context.status?.method === 'api' || context.status?.method === 'dom') {
    return 'status-dot is-active';
  }
  return 'status-dot is-pending';
}

function getStatusLabel(context: ActiveTabContext): string {
  if (!context.supported) return '非 DeepWiki 页面';
  if (context.status?.reason === 'auto_capture_disabled') return '自动保存已关闭';
  if (context.status?.method === 'api') {
    return context.status.pending ? 'API 同步中…' : '已自动保存';
  }
  if (context.status?.method === 'dom') {
    return context.status?.reason === 'api_fetch_failed' ? '已保存（API 失败）' : '已通过 DOM 保存';
  }
  if (context.status?.reason === 'dom_not_ready') return '等待页面稳定';
  return '等待捕获';
}

function getStatusDesc(context: ActiveTabContext): string {
  if (!context.supported) return '当前页面不是 DeepWiki session。';
  if (context.status?.reason === 'auto_capture_disabled') return '开启自动保存后可自动记录历史。';
  if (context.status?.method === 'api' && !context.status.pending) return '已用 API 完整抓取并保存到本地。';
  if (context.status?.method === 'api' && context.status.pending) return '快速保存完成，API 正在继续同步。';
  if (context.status?.method === 'dom') return '已快速保存到本地，API 同步失败。';
  return '正在准备抓取…';
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function PopupApp() {
  const [context, setContext] = useState<ActiveTabContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function loadContext() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextContext = await sendRuntimeMessage<ActiveTabContext>('GET_ACTIVE_TAB_CONTEXT');
      setContext(nextContext);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContext();
  }, []);

  async function handleOpenSidePanel() {
    if (!context?.tabId) {
      setErrorMessage('当前没有可用的标签页来打开侧边栏。');
      return;
    }
    try {
      await chrome.sidePanel.open({ tabId: context.tabId });
      window.close();
    } catch (error) {
      setErrorMessage(`打开侧边栏失败：${ensureErrorMessage(error)}`);
    }
  }

  async function handleRecapture() {
    if (!context?.queryId || !context.url) {
      setErrorMessage('当前页面没有可用的 DeepWiki session 标识。');
      return;
    }
    setErrorMessage(null);
    setInfoMessage(null);

    if (context.tabId) {
      try {
        const tabResponse = (await chrome.tabs.sendMessage(context.tabId, {
          command: 'TRIGGER_RECAPTURE'
        } satisfies RuntimeRequest)) as RuntimeResponse<ActiveTabContext['status']>;
        if (!tabResponse.ok) throw new Error(tabResponse.error?.message ?? '内容脚本重新抓取失败');
        setContext((current) => current ? { ...current, status: tabResponse.data ?? current.status } : current);
        setInfoMessage('已触发重新抓取，状态已同步。');
        await loadContext();
        return;
      } catch {
        // Fall through to background capture fallback.
      }
    }

    try {
      const captureResult = await sendRuntimeMessage<CaptureResult, CaptureDeepWikiSessionPayload>(
        'CAPTURE_DEEPWIKI_SESSION',
        { queryId: context.queryId, sourceUrl: context.url }
      );
      setContext((current) =>
        current
          ? {
              ...current,
              status: {
                ...(current.status ?? { supported: true, active: true, queryId: current.queryId, sourceUrl: current.url }),
                method: captureResult.method,
                lastCapturedAt: captureResult.savedAt,
                pending: captureResult.pending,
                reason: undefined,
                errorMessage: undefined
              }
            }
          : current
      );
      setInfoMessage('已通过后台重新抓取并保存。');
    } catch (error) {
      setErrorMessage(`重新抓取失败：${ensureErrorMessage(error)}`);
    }
  }

  async function handleFocusTab() {
    if (!context?.tabId) return;
    await chrome.tabs.update(context.tabId, { active: true });
  }

  return (
    <div className="popup">
      <div className="popup__header">
        <span className="popup__logo">Wikeep</span>
      </div>

      <div className="popup__body">
        {errorMessage ? <div className="banner banner--error">{errorMessage}</div> : null}
        {infoMessage ? <div className="banner banner--info">{infoMessage}</div> : null}

        {loading ? (
          <EmptyState title="正在读取页面状态" description="请稍候…" />
        ) : context ? (
          <>
            <div className="popup__card">
              <div className="popup__status">
                <span className={getStatusDotClass(context)} />
                <div>
                  <div className="popup__status-label">{getStatusLabel(context)}</div>
                  <div className="popup__status-desc">{getStatusDesc(context)}</div>
                  {context.status?.lastCapturedAt ? (
                    <div className="popup__status-time">{formatRelativeTime(context.status.lastCapturedAt)}</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="popup__actions">
              <button type="button" className="btn btn--primary btn--full" onClick={() => void handleOpenSidePanel()}>
                打开侧边栏
              </button>
              <div className="popup__row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={!context.supported}
                  onClick={() => void handleRecapture()}
                >
                  重新抓取
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => void handleFocusTab()}>
                  返回页面
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => void loadContext()}>
                  刷新
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="无法读取页面" description="请重新打开 Wikeep Popup 后再试。" />
        )}
      </div>
    </div>
  );
}

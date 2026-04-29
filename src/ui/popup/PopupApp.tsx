import { useEffect, useState } from 'react';
import type { ActiveTabContext, CaptureResult } from '../../shared/types';
import type {
  CaptureDeepWikiSessionPayload,
  RuntimeRequest,
  RuntimeResponse
} from '../../shared/messages';
import { ensureErrorMessage, sendRuntimeMessage } from '../../shared/utils';
import { EmptyState } from '../components/EmptyState';

function formatStatus(context: ActiveTabContext): string {
  if (!context.supported) {
    return '当前标签页不是 DeepWiki session 页面。';
  }

  if (context.status?.reason === 'auto_capture_disabled') {
    return '自动保存已关闭。';
  }

  if (context.status?.method === 'api') {
    return '已通过 API 自动保存。';
  }

  if (context.status?.method === 'dom') {
    return '已通过 DOM 兜底保存。';
  }

  if (context.status?.reason === 'api_fetch_failed') {
    return 'API 抓取失败，等待 DOM 兜底。';
  }

  return '等待捕获状态回传。';
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
      await chrome.sidePanel.open({
        tabId: context.tabId
      });
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

        if (!tabResponse.ok) {
          throw new Error(tabResponse.error?.message ?? '内容脚本重新抓取失败');
        }

        setContext((current) =>
          current
            ? {
                ...current,
                status: tabResponse.data ?? current.status
              }
            : current
        );
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
        {
          queryId: context.queryId,
          sourceUrl: context.url
        }
      );

      setContext((current) =>
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
    if (!context?.tabId) {
      return;
    }

    await chrome.tabs.update(context.tabId, {
      active: true
    });
  }

  return (
    <div className="popup-root">
      <div className="popup-card">
        <div className="toolbar__title">Wikeep</div>
        {errorMessage ? <div className="banner is-error">{errorMessage}</div> : null}
        {infoMessage ? <div className="banner is-info">{infoMessage}</div> : null}
        {loading ? (
          <EmptyState title="正在读取页面状态" description="请稍候…" />
        ) : context ? (
          <>
            <div className="popup-row">
              <strong>{context.supported ? '已识别 DeepWiki Session' : '未识别到 DeepWiki Session'}</strong>
              <div className="status-list">{formatStatus(context)}</div>
              {context.queryId ? <div className="status-list">queryId: {context.queryId}</div> : null}
              {context.status?.lastCapturedAt ? (
                <div className="status-list">
                  最近保存：{new Date(context.status.lastCapturedAt).toLocaleString('zh-CN', { hour12: false })}
                </div>
              ) : null}
            </div>

            <div className="popup-actions">
              <button type="button" className="primary-button" onClick={() => void handleOpenSidePanel()}>
                打开侧边栏
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!context.supported}
                onClick={() => void handleRecapture()}
              >
                立即重新抓取
              </button>
              <button type="button" className="ghost-button" onClick={() => void handleFocusTab()}>
                返回当前页面
              </button>
              <button type="button" className="ghost-button" onClick={() => void loadContext()}>
                刷新状态
              </button>
            </div>
          </>
        ) : (
          <EmptyState title="无法读取页面" description="请重新打开 Wikeep Popup 后再试。" />
        )}
      </div>
    </div>
  );
}

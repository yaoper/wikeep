import { useCallback, useEffect, useState } from "react";
import type {
  ActiveTabContext,
  CaptureResult,
  CaptureStatus,
} from "../../shared/types";
import type {
  ActiveTabContextChangedPayload,
  RuntimeRequest,
  WikiPageStateChangedPayload,
} from "../../shared/messages";
import { send } from "../api/client";
import { shouldAutoRefreshContext } from "../sidepanel/status";

interface LoadOptions {
  silent?: boolean;
}

interface UseActiveTabContextOptions {
  onError: (message: string | null) => void;
}

export function useActiveTabContext({ onError }: UseActiveTabContextOptions) {
  const [activeContext, setActiveContext] = useState<ActiveTabContext | null>(
    null,
  );
  const [contextLoading, setContextLoading] = useState(true);

  const load = useCallback(
    async (options?: LoadOptions) => {
      if (!options?.silent) setContextLoading(true);

      try {
        const nextContext = await send("GET_ACTIVE_TAB_CONTEXT");
        setActiveContext(nextContext);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!options?.silent) setContextLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!shouldAutoRefreshContext(activeContext)) return;

    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeContext, load]);

  useEffect(() => {
    const onMessage = (request: RuntimeRequest) => {
      if (request.command === "ACTIVE_TAB_CONTEXT_CHANGED") {
        const payload = request.payload as
          | ActiveTabContextChangedPayload
          | undefined;

        if (!payload?.context) return;

        setContextLoading(false);
        setActiveContext(payload.context);
        return;
      }

      if (request.command === "WIKI_PAGE_STATE_CHANGED") {
        const payload = request.payload as WikiPageStateChangedPayload | undefined;
        if (!payload) return;

        setActiveContext((current) => {
          if (
            !current ||
            current.routeKind !== "wiki" ||
            current.url !== payload.url
          ) {
            return current;
          }
          return { ...current, wikiState: payload };
        });
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  const updateWikiState = useCallback(
    (wikiState: ActiveTabContext["wikiState"]) => {
      setActiveContext((current) =>
        current
          ? {
              ...current,
              wikiState,
            }
          : current,
      );
    },
    [],
  );

  const updateStatus = useCallback(
    (status: CaptureStatus | undefined) => {
      setActiveContext((current) =>
        current
          ? {
              ...current,
              status,
            }
          : current,
      );
    },
    [],
  );

  const applyCaptureResult = useCallback((captureResult: CaptureResult) => {
    setActiveContext((current) =>
      current
        ? {
            ...current,
            status: {
              ...(current.status ?? {
                supported: true,
                active: true,
                queryId: current.queryId,
                sourceUrl: current.url,
              }),
              method: captureResult.method,
              lastCapturedAt: captureResult.savedAt,
              pending: captureResult.pending,
              repoNames: captureResult.repoNames,
              reason: undefined,
              errorMessage: undefined,
              performance: captureResult.performance,
              existingConversationId: undefined,
            },
          }
        : current,
    );
  }, []);

  return {
    activeContext,
    contextLoading,
    load,
    setActiveContext,
    updateWikiState,
    updateStatus,
    applyCaptureResult,
  };
}

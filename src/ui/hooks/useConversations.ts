import { useCallback, useState } from "react";
import type { ConversationListItem } from "../../shared/types";
import { send } from "../api/client";

interface LoadOptions {
  silent?: boolean;
}

interface UseConversationsOptions {
  onError: (message: string | null) => void;
}

export function useConversations({ onError }: UseConversationsOptions) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (keyword?: string, options?: LoadOptions) => {
      if (!options?.silent) {
        setLoading(true);
        onError(null);
      }

      try {
        const items = await send("LIST_CONVERSATIONS", { keyword });
        setConversations(items);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [onError],
  );

  return {
    conversations,
    loading,
    load,
    setConversations,
  };
}

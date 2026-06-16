import { useCallback, useState } from "react";
import type { WikiPage } from "../../shared/types";
import { send } from "../api/client";

interface LoadOptions {
  silent?: boolean;
}

interface UseWikiPagesOptions {
  onError: (message: string | null) => void;
}

export function useWikiPages({ onError }: UseWikiPagesOptions) {
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);

  const load = useCallback(
    async (keyword?: string, options?: LoadOptions) => {
      try {
        const items = await send("LIST_WIKI_PAGES", { keyword });
        setWikiPages(items);
      } catch (error) {
        if (!options?.silent) {
          onError(error instanceof Error ? error.message : String(error));
        }
      }
    },
    [onError],
  );

  return {
    wikiPages,
    load,
    setWikiPages,
  };
}

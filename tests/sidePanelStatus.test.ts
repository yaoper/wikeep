import { describe, expect, it } from "vitest";
import {
  getStatusActionLabel,
  getStatusSubtitle,
  getStatusTitle,
  getStatusTone,
  shouldAutoRefreshContext,
} from "../src/ui/sidepanel/status";

describe("side panel status helpers", () => {
  it("returns saved tone for freshly saved wiki pages", () => {
    expect(
      getStatusTone({
        supported: true,
        routeKind: "wiki",
        wikiState: { state: "saved_fresh" },
      } as any),
    ).toBe("saved");
  });

  it("returns pending tone and refresh label for stale wiki pages", () => {
    const context = {
      supported: true,
      routeKind: "wiki",
      wikiState: { state: "saved_stale" },
    } as any;

    expect(getStatusTone(context)).toBe("pending");
    expect(getStatusActionLabel(context)).toBe("Refresh");
    expect(getStatusTitle(context)).toBe("Wiki page changed");
    expect(getStatusSubtitle(context)).toContain("newer content");
  });

  it("auto-refreshes pending conversation contexts", () => {
    expect(
      shouldAutoRefreshContext({
        supported: true,
        routeKind: "conversation",
        status: { pending: true },
      } as any),
    ).toBe(true);
  });
});

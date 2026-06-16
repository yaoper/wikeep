import { describe, expect, it } from "vitest";
import { statusToneClass } from "../src/ui/sidepanel/statusClass";

describe("statusToneClass", () => {
  it("adds the saved modifier", () => {
    expect(statusToneClass("saved", "status-bar")).toBe("status-bar is-saved");
  });

  it("adds the pending modifier", () => {
    expect(statusToneClass("pending", "status-bar")).toBe("status-bar is-pending");
  });
});

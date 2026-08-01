import { beforeEach, describe, expect, it } from "vitest";
import { useActiveGroup } from "../use-active-group";

describe("useActiveGroup", () => {
  beforeEach(() => {
    useActiveGroup.setState({ activeGroupId: null });
  });

  it("defaults activeGroupId to null", () => {
    expect(useActiveGroup.getState().activeGroupId).toBeNull();
  });

  it("setActiveGroup stores the group id", () => {
    useActiveGroup.getState().setActiveGroup("g1");
    expect(useActiveGroup.getState().activeGroupId).toBe("g1");
  });

  it("setActiveGroup accepts null to clear the active group", () => {
    useActiveGroup.getState().setActiveGroup("g1");
    useActiveGroup.getState().setActiveGroup(null);
    expect(useActiveGroup.getState().activeGroupId).toBeNull();
  });

  it("setActiveGroup can switch between groups", () => {
    useActiveGroup.getState().setActiveGroup("g1");
    useActiveGroup.getState().setActiveGroup("g2");
    expect(useActiveGroup.getState().activeGroupId).toBe("g2");
  });
});

import { describe, expect, it } from "vitest";
import type { TokenProvider } from "../src/auth";

describe("TokenProvider interface", () => {
  it("supports getToken returning string", async () => {
    const tp: TokenProvider = { getToken: async () => "abc" };
    expect(await tp.getToken()).toBe("abc");
  });

  it("supports getToken returning null", async () => {
    const tp: TokenProvider = { getToken: async () => null };
    expect(await tp.getToken()).toBeNull();
  });

  it("supports optional refresh", async () => {
    const tp: TokenProvider = {
      getToken: async () => "old",
      refresh: async () => "new",
    };
    expect(await tp.refresh?.()).toBe("new");
  });

  it("refresh is optional (undefined OK)", () => {
    const tp: TokenProvider = { getToken: async () => "x" };
    expect(tp.refresh).toBeUndefined();
  });
});

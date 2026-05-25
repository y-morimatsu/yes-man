/**
 * personaSourceStorage — localStorage 永続化 unit tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE,
  STORAGE_KEY,
  clearPersonaSource,
  readPersonaSource,
  writePersonaSource,
} from "../../../src/features/persona/personaSourceStorage";

describe("personaSourceStorage", () => {
  beforeEach(() => clearPersonaSource());
  afterEach(() => clearPersonaSource());

  it("default source is 'builtin' (US-4.1 AC-2: regression 防止)", () => {
    expect(DEFAULT_SOURCE).toBe("builtin");
    expect(readPersonaSource()).toBe("builtin");
  });

  it("writePersonaSource('anonymous') persists to localStorage", () => {
    writePersonaSource("anonymous");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("anonymous");
    expect(readPersonaSource()).toBe("anonymous");
  });

  it("writePersonaSource is reversible (anonymous → builtin)", () => {
    writePersonaSource("anonymous");
    writePersonaSource("builtin");
    expect(readPersonaSource()).toBe("builtin");
  });

  it("invalid stored value falls back to default", () => {
    window.localStorage.setItem(STORAGE_KEY, "bogus");
    expect(readPersonaSource()).toBe("builtin");
  });

  it("clearPersonaSource removes the entry", () => {
    writePersonaSource("anonymous");
    clearPersonaSource();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readPersonaSource()).toBe("builtin");
  });
});

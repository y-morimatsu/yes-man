/**
 * aws-amplify mock (ultrathink NFR Design I3: 分離 file).
 *
 * test ごとに `vi.mocked(fetchAuthSession).mockResolvedValueOnce(...)` で override 可能.
 */
import { vi } from "vitest";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => "fake-id-token",
        payload: { sub: "user-1", email: "test@example.com" },
      },
    },
  }),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("aws-amplify", () => ({
  Amplify: { configure: vi.fn() },
}));

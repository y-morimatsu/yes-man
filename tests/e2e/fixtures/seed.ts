/** E2E seed fixture — Mock backend に test data 投入 (U-Test FD §2.1). */
import type { APIRequestContext } from "@playwright/test";

export async function seedSamplePersona(request: APIRequestContext) {
  const response = await request.post("http://localhost:8000/v1/personas/me", {
    data: {
      name: "テスト効率派",
      description: "E2E テスト用",
      prompt_text: "あなたは効率派です。" + "短く意見してください。".repeat(3),
      avatar_url: null,
    },
  });
  return await response.json();
}

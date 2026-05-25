/**
 * usePersonaSource — Persona Selection の source 切替 + localStorage 永続化 hook.
 *
 * v3-γ anonymous-strangers Task 4 (US-4.1).
 *
 * I-1 fix (Task 4 ultrathink): lazy initializer で初回 render から localStorage 値を使う
 * (effect 経由の sync で発生していた「builtin → anonymous」flash を解消).
 *
 * Task 5 連携メモ: DecisionPage は `usePersonaSource().source` を読み、
 * `DecisionRequestPayload.persona_source` に渡す責務を持つ.
 * 例: `client.decisions.streamRequest({ user_input, persona_source: source })`.
 */
import { useCallback, useState } from "react";
import {
  type PersonaSource,
  DEFAULT_SOURCE,
  readPersonaSource,
  writePersonaSource,
} from "./personaSourceStorage";

export function usePersonaSource(): {
  source: PersonaSource;
  setSource: (next: PersonaSource) => void;
} {
  // lazy initializer: 初回 render で localStorage を 1 回だけ読む.
  // SSR / privacy mode は readPersonaSource() 内 try/catch で DEFAULT_SOURCE fallback.
  const [source, setSourceState] = useState<PersonaSource>(() => {
    try {
      return readPersonaSource();
    } catch {
      return DEFAULT_SOURCE;
    }
  });

  const setSource = useCallback((next: PersonaSource) => {
    setSourceState(next);
    writePersonaSource(next);
  }, []);

  return { source, setSource };
}

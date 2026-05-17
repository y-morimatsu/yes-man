/**
 * useToast — ToastProvider context へのアクセス hook (NFR Design §6).
 *
 * 使用例:
 *   const { push } = useToast();
 *   push({ message: "保存しました", variant: "success" });
 */
import { useToastContext } from "../primitives/ToastProvider";

export function useToast() {
  return useToastContext();
}

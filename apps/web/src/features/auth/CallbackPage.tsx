/** CallbackPage — OAuth callback、元 page 復帰 (FD §5.4 + ultrathink Imp2). */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@yesman/ui";
import { useAuth } from "../../shell/AuthProvider";

export default function CallbackPage() {
  const navigate = useNavigate();
  const { status, refresh } = useAuth();

  // OAuth code 受領後、aws-amplify が token を保存。AuthProvider に refresh を依頼.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "authenticated") {
      const from = sessionStorage.getItem("yesman:redirect-to") ?? "/";
      sessionStorage.removeItem("yesman:redirect-to");
      navigate(from, { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <Spinner />
      <p className="text-neutral-600">サインイン中...</p>
    </div>
  );
}

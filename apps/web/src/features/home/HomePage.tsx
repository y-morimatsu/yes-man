/** HomePage — Hub Dashboard with summary card (Pack A #2) + 5 機能 nav. */
import { Link } from "react-router-dom";
import { Card } from "@yesman/ui";
import { useScore } from "../score/useScore";

function SummaryCard() {
  const { data, isPending, isError } = useScore();

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-neutral-500">読み込み中...</p>
      </Card>
    );
  }
  if (isError || !data) {
    return null; // silent fail: Home itself は崩さない
  }

  if (data.total === 0) {
    return (
      <Link to="/decision" className="block">
        <Card>
          <h2 className="font-serif font-semibold text-brand-700">
            📊 最近の YesMan
          </h2>
          <p className="text-sm text-neutral-600 mt-2">
            最近の決定はまだありません。「💭 合議で決定」からどうぞ
          </p>
        </Card>
      </Link>
    );
  }

  const pct = data.ratio !== null ? Math.round(data.ratio * 100) : 0;

  return (
    <Link to="/score" className="block">
      <Card>
        <h2 className="font-serif font-semibold text-brand-700">
          📊 最近の YesMan
        </h2>
        <p className="text-base text-neutral-800 mt-2 font-bold font-mono">
          {data.total} 件の決定 / Yes 比率 {pct}%
        </p>
        <div
          className="mt-2 h-2 rounded-full bg-neutral-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#9F88C8" }}
          />
        </div>
        <p className="text-xs italic text-neutral-500 mt-2">{data.message}</p>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Pack A #2: Summary カード (上部) */}
      <SummaryCard />

      {/* Hub: 5 機能 nav (drawio 画面ツリー Home ハブ画面相当) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <Link to="/decision" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              💭 合議で決定
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              AI ペルソナと合議して、Yes/No で採択
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/personas" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              🎭 Persona 管理
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              ペルソナ作成・共有プール閲覧
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/score" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              📊 委任度 スコア
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Yes/No 採択履歴の自己分析
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/preferences" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              🧠 嗜好プロファイル
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              学習された嗜好の閲覧・リセット
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/profile" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              👤 プロフィール
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              ユーザー情報・アカウント管理
            </p>
          </Link>
        </Card>
      </section>
    </div>
  );
}

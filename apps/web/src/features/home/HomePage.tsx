/** HomePage — Hub Dashboard (Splash は /auth/splash に分離、ログイン後は機能 nav のみ). */
import { Link } from "react-router-dom";
import { Card } from "@yesman/ui";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
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

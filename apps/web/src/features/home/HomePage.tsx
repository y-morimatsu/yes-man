/** HomePage — INCEPTION A1 Splash + Hub Dashboard (U7d 拡張). */
import { Link } from "react-router-dom";
import { Card } from "@yesman/ui";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      {/* INCEPTION A1 Splash: 大見出し + 逆説的設計 disclaimer */}
      <section className="text-center py-8">
        <h1 className="font-serif font-bold text-5xl text-neutral-800 tracking-wide">
          YESMAN
        </h1>
        <p className="mt-6 font-serif italic text-xl text-neutral-800">
          人間最後の仕事は、
        </p>
        <p className="font-serif italic text-xl text-neutral-800">
          YES で承認すること。
        </p>
        <hr className="my-6 border-neutral-200 mx-auto max-w-md" />
        <p className="text-sm text-neutral-700 leading-relaxed">
          本作品は AI が人間の主体性を奪う体験を演出する作品です。
        </p>
        <p className="text-sm text-neutral-700 leading-relaxed">
          「委任度スコア」「沈黙演出」 などは意図的な
          <strong className="font-semibold text-brand-700">逆説的設計</strong>
          です。
        </p>
        <p className="mt-4 text-xs italic text-neutral-400">
          → スワイプして同意
        </p>
      </section>

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

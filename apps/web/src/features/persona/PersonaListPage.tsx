/**
 * PersonaListPage — own/shared tabs + create modal (U7d FD §4.1).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, PersonaCard, Spinner } from "@yesman/ui";
import type { SharedSort } from "@yesman/api-client";
import { useMyPersonas, useSharedPersonas } from "./usePersona";
import { PersonaCreateModal } from "./PersonaCreateModal";
import { t } from "./strings";

type Tab = "my" | "shared";

export default function PersonaListPage() {
  const [tab, setTab] = useState<Tab>("my");
  const [sort, setSort] = useState<SharedSort>("popularity");
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold">{t("pageTitle")}</h1>
        <div className="flex gap-2">
          <Link to="/personas/selection">
            <Button variant="secondary" size="sm">選択管理</Button>
          </Link>
          <Button onClick={() => setModalOpen(true)}>{t("createButton")}</Button>
        </div>
      </div>

      {/* INCEPTION screen-06: 検索 input (🔍 ペルソナを 探す...) */}
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
      />

      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => setTab("my")}
          className={`pb-2 px-3 ${tab === "my" ? "border-b-2 border-brand-600 font-semibold" : ""}`}
        >
          {t("tabMy")}
        </button>
        <button
          type="button"
          onClick={() => setTab("shared")}
          className={`pb-2 px-3 ${tab === "shared" ? "border-b-2 border-brand-600 font-semibold" : ""}`}
        >
          {t("tabShared")}
        </button>
      </div>

      {tab === "my" ? <MyTab query={query} /> : <SharedTab sort={sort} setSort={setSort} query={query} />}

      {/* INCEPTION footnote: 最大 3 個 + 共有はオプトイン */}
      <p className="mt-4 text-center text-xs italic text-neutral-400">
        {t("footnoteMaxThree")}
      </p>
      <p className="text-center text-xs italic text-neutral-400">
        {t("footnoteShareOptIn")}
      </p>

      <PersonaCreateModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function MyTab({ query }: { query: string }) {
  const { data, isPending } = useMyPersonas();
  if (isPending) return <Spinner />;
  const filtered =
    query.trim() === ""
      ? data ?? []
      : (data ?? []).filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            (p.description ?? "").toLowerCase().includes(query.toLowerCase()),
        );
  if (filtered.length === 0) {
    return <p className="text-neutral-500">{t("emptyMy")}</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {filtered.map((p) => (
        <PersonaCard key={p.id} persona={p} />
      ))}
    </div>
  );
}

function SharedTab({
  sort,
  setSort,
  query,
}: {
  sort: SharedSort;
  setSort: (s: SharedSort) => void;
  query: string;
}) {
  const { data, isPending } = useSharedPersonas({ sort, page: 0, page_size: 20 });
  const filtered =
    query.trim() === ""
      ? data ?? []
      : (data ?? []).filter((p) =>
          p.name.toLowerCase().includes(query.toLowerCase()),
        );
  return (
    <div className="flex flex-col gap-3">
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SharedSort)}
        className="self-end rounded-xl border border-neutral-300 px-3 py-1 bg-neutral-0 dark:bg-neutral-800"
      >
        <option value="popularity">{t("sortPopularity")}</option>
        <option value="newest">{t("sortNewest")}</option>
        <option value="acceptance">{t("sortAcceptance")}</option>
      </select>
      {isPending ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">{t("emptyShared")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <PersonaCard key={p.id} persona={p} />
          ))}
        </div>
      )}
    </div>
  );
}

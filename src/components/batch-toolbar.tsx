"use client";
import { useState } from "react";
import type { Category } from "@/server/schema";
import type { BatchCommand } from "@/lib/catalog-commands";

type Props = {
  ids: string[];
  categories: Category[];
  trash: boolean;
  busy: boolean;
  onApply: (command: BatchCommand) => Promise<void>;
  onClear: () => void;
  onSelectAll: () => void;
};
export function BatchToolbar({
  ids,
  categories,
  trash,
  busy,
  onApply,
  onClear,
  onSelectAll,
}: Props) {
  const [destination, setDestination] = useState("uncategorized");
  const [tags, setTags] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parsedTags = [
    ...new Set(
      tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  return (
    <section className="batch-toolbar glass" aria-label="批量操作">
      <div className="batch-heading">
        <strong>已选择 {ids.length} 项</strong>
        <button onClick={onSelectAll}>选择当前结果</button>
        <button
          onClick={() => {
            setConfirmDelete(false);
            onClear();
          }}
        >
          取消选择
        </button>
      </div>
      <fieldset disabled={busy || !ids.length}>
        {trash ? (
          <>
            <button onClick={() => void onApply({ ids, action: "restore" })}>
              恢复选中网站
            </button>
            <button onClick={() => setConfirmDelete(true)}>永久删除…</button>
            {confirmDelete && (
              <span role="alert">
                将永久删除所选网站，无法恢复。
                <button
                  className="danger"
                  onClick={async () => {
                    await onApply({ ids, action: "delete" });
                    setConfirmDelete(false);
                  }}
                >
                  确认删除
                </button>
                <button onClick={() => setConfirmDelete(false)}>取消</button>
              </span>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => void onApply({ ids, action: "pin", pinned: true })}
            >
              置顶
            </button>
            <button
              onClick={() =>
                void onApply({ ids, action: "pin", pinned: false })
              }
            >
              取消置顶
            </button>
            <select
              aria-label="目标分类"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                void onApply({ ids, action: "move", categoryId: destination })
              }
            >
              移动分类
            </button>
            <input
              aria-label="批量标签"
              placeholder="标签，逗号分隔"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
            <button
              disabled={!parsedTags.length}
              onClick={() =>
                void onApply({
                  ids,
                  action: "tags",
                  mode: "add",
                  tags: parsedTags,
                })
              }
            >
              添加标签
            </button>
            <button
              disabled={!parsedTags.length}
              onClick={() =>
                void onApply({
                  ids,
                  action: "tags",
                  mode: "remove",
                  tags: parsedTags,
                })
              }
            >
              移除标签
            </button>
            <button onClick={() => void onApply({ ids, action: "trash" })}>
              移入回收站
            </button>
          </>
        )}
      </fieldset>
      {busy && <span role="status">正在保存…</span>}
    </section>
  );
}

"use client";
import { useState } from "react";
import type { Category } from "@/server/schema";
import { requestJson } from "./atlas";
export function CategoryManager({
  categories,
  onChanged,
}: {
  categories: Category[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState("");
  async function apply(command: unknown) {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/categories", {
        method: "PATCH",
        body: JSON.stringify(command),
      });
      await onChanged();
      setId("");
      setDeleting("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "修改失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="category-manager glass">
      <summary>管理分类</summary>
      <p>删除分类会将网站移入“未分类”，包括回收站中的网站。</p>
      {categories.map((category, index) => (
        <div key={category.id} className="category-manage-row">
          <span>{category.name}</span>
          <button
            disabled={busy || index === 0}
            aria-label={`上移${category.name}`}
            onClick={() =>
              void apply({ id: category.id, action: "move", direction: "up" })
            }
          >
            ↑
          </button>
          <button
            disabled={busy || index === categories.length - 1}
            aria-label={`下移${category.name}`}
            onClick={() =>
              void apply({ id: category.id, action: "move", direction: "down" })
            }
          >
            ↓
          </button>
          {category.id !== "uncategorized" && (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  setId(category.id);
                  setName(category.name);
                }}
              >
                重命名
              </button>
              <button disabled={busy} onClick={() => setDeleting(category.id)}>
                删除…
              </button>
            </>
          )}
        </div>
      ))}
      {id && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void apply({ id, action: "rename", name });
          }}
        >
          <input
            aria-label="新分类名称"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button disabled={busy}>保存名称</button>
          <button type="button" onClick={() => setId("")}>
            取消
          </button>
        </form>
      )}
      {deleting && (
        <p role="alert">
          确认删除“
          {categories.find((category) => category.id === deleting)?.name}”？
          <button
            disabled={busy}
            onClick={() => void apply({ id: deleting, action: "delete" })}
          >
            确认
          </button>
          <button onClick={() => setDeleting("")}>取消</button>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}

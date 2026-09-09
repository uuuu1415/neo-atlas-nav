"use client";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Category, Website } from "@/server/schema";
import {
  fillEmptyFields,
  metadataPreviewSchema,
  type MetadataFields,
  type MetadataPreview,
} from "@/lib/metadata";
import { requestJson } from "./atlas";

type Props = {
  website?: Website;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};
export function WebsiteEditor({
  website,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [url, setUrl] = useState(website?.url ?? "");
  const [fields, setFields] = useState<MetadataFields>({
    title: website?.title ?? "",
    description: website?.description ?? "",
    iconUrl: website?.iconUrl ?? "",
  });
  const [preview, setPreview] = useState<MetadataPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function changeUrl(value: string) {
    controller.current?.abort();
    controller.current = null;
    setFetching(false);
    setPreview(null);
    setUrl(value);
  }
  async function fetchInformation() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setFetching(true);
    setError("");
    setPreview(null);
    try {
      const result = metadataPreviewSchema.parse(
        await requestJson<unknown>("/api/metadata", {
          method: "POST",
          body: JSON.stringify({ url }),
          signal: active.signal,
        }),
      );
      if (controller.current !== active || active.signal.aborted) return;
      setPreview(result);
      setFields((current) => fillEmptyFields(current, result));
    } catch (reason) {
      if (!active.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "获取失败，请手动填写",
        );
    } finally {
      if (controller.current === active) setFetching(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const data = {
      ...fields,
      url,
      categoryId: form.get("categoryId"),
      tags: String(form.get("tags") ?? "")
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      pinned: website?.pinned ?? false,
    };
    try {
      await requestJson("/api/websites", {
        method: website ? "PATCH" : "POST",
        body: JSON.stringify(
          website ? { id: website.id, action: "edit", data } : data,
        ),
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        initial={{ y: 20, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
      >
        <div className="modal-title">
          <div>
            <small>CURATE YOUR ATLAS</small>
            <h2 id="editor-title">{website ? "编辑网站" : "收藏一个好网站"}</h2>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={(event) => void save(event)}>
          <label>
            网站链接
            <div className="url-row">
              <input
                autoFocus
                name="url"
                type="url"
                value={url}
                onChange={(event) => changeUrl(event.target.value)}
                placeholder="https://example.com"
                required
              />
              <button
                type="button"
                className="secondary fetch-button"
                onClick={() => void fetchInformation()}
                disabled={fetching || !url}
              >
                {fetching ? "获取中…" : "获取信息"}
              </button>
            </div>
          </label>
          {preview && (
            <div className="metadata-preview" role="status">
              <p>{preview.warning}</p>
              <small>
                来源：{preview.sourceUrl}
                <br />
                获取时间：{new Date(preview.fetchedAt).toLocaleString()}
              </small>
              <p>已补充空字段，原有内容保留。</p>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setFields({
                    title: preview.title || fields.title,
                    description: preview.description || fields.description,
                    iconUrl: preview.iconUrl || fields.iconUrl,
                  })
                }
              >
                使用抓取结果替换已有内容
              </button>
            </div>
          )}
          <label>
            网站名称
            <input
              name="title"
              value={fields.title}
              onChange={(event) =>
                setFields({ ...fields, title: event.target.value })
              }
              required
              maxLength={160}
            />
          </label>
          <label>
            描述
            <textarea
              name="description"
              value={fields.description}
              onChange={(event) =>
                setFields({ ...fields, description: event.target.value })
              }
              maxLength={1000}
            />
          </label>
          <label>
            远程图标地址
            <input
              name="iconUrl"
              type="url"
              value={fields.iconUrl}
              onChange={(event) =>
                setFields({ ...fields, iconUrl: event.target.value })
              }
              placeholder="可手动填写或替换"
            />
          </label>
          <div className="form-row">
            <label>
              分类
              <select
                name="categoryId"
                defaultValue={website?.categoryId ?? "uncategorized"}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              标签
              <input
                name="tags"
                placeholder="工具, 灵感"
                defaultValue={website?.tags.join(", ")}
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy || fetching}>
              {busy ? "正在保存…" : "保存网站 ↗"}
            </button>
          </div>
        </form>
      </motion.section>
    </motion.div>
  );
}

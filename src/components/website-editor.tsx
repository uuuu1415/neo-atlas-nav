"use client";
import { motion } from "motion/react";
import { useState } from "react";
import type { Category, Website } from "@/server/schema";
import { requestJson } from "./atlas";
export function WebsiteEditor({ website, categories, onClose, onSaved }: { website?: Website; categories: Category[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [fetching, setFetching] = useState(false); const [error, setError] = useState(""); const [preview, setPreview] = useState({ title: website?.title ?? "", description: website?.description ?? "", iconUrl: website?.iconUrl ?? "" });
  async function fetchMetadata() { const url = (document.querySelector("input[name=url]") as HTMLInputElement)?.value; if (!url) return; setFetching(true); setError(""); try { const result = await requestJson<typeof preview>("/api/metadata", { method: "POST", body: JSON.stringify({ url }) }); setPreview(result); } catch (reason) { setError(reason instanceof Error ? reason.message : "获取失败"); } finally { setFetching(false); } }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const data = { title: preview.title, url: form.get("url"), description: preview.description, categoryId: form.get("categoryId"), iconUrl: preview.iconUrl, tags: String(form.get("tags")).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), pinned: website?.pinned ?? false };
    try { await requestJson("/api/websites", { method: website ? "PATCH" : "POST", body: JSON.stringify(website ? { id: website.id, action: "edit", data } : data) }); await onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setBusy(false); }
  }
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="modal glass" role="dialog" aria-modal="true" aria-labelledby="editor-title" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }}><div className="modal-title"><div><small>CURATE YOUR ATLAS</small><h2 id="editor-title">{website ? "编辑网站" : "收藏一个好网站"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></div><form onSubmit={(event) => void save(event)}><label>网站链接<div className="url-row"><input autoFocus name="url" type="url" placeholder="https://example.com" defaultValue={website?.url} required /><button type="button" className="secondary fetch-button" onClick={() => void fetchMetadata()} disabled={fetching}>{fetching ? "获取中…" : "获取信息"}</button></div></label><label>网站名称<input name="title" placeholder="给它一个好记的名字" value={preview.title} onChange={(event) => setPreview({ ...preview, title: event.target.value })} required maxLength={160} /></label><label>描述<textarea name="description" placeholder="这个网站能帮你做什么？" value={preview.description} onChange={(event) => setPreview({ ...preview, description: event.target.value })} maxLength={1000} /></label><div className="form-row"><label>分类<select name="categoryId" defaultValue={website?.categoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>标签<input name="tags" placeholder="工具, 灵感" defaultValue={website?.tags.join(", ")} /></label></div>{error && <p role="alert" className="error">{error}</p>}<div className="modal-footer"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? "正在保存…" : "保存网站 ↗"}</button></div></form></motion.section></motion.div>;
}



"use client";
import { motion } from "motion/react";
import { useState } from "react";
import type { Settings } from "@/lib/schemas";
import { requestJson } from "./atlas";
export function SettingsPanel({
  settings,
  onClose,
  onSaved,
}: {
  settings: Settings;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const next = await requestJson<Settings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          name: form.get("name"),
          description: form.get("description"),
          theme: form.get("theme"),
          motion: form.get("motion"),
          density: form.get("density"),
          accent: form.get("accent"),
        }),
      });
      onSaved(next);
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
      <section
        className="modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-title">
          <div>
            <small>MAKE IT YOURS</small>
            <h2 id="settings-title">偏好设置</h2>
          </div>
          <button onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <form onSubmit={(event) => void save(event)}>
          <label>
            站点名称
            <input name="name" defaultValue={settings.name} required />
          </label>
          <label>
            首页描述
            <input name="description" defaultValue={settings.description} />
          </label>
          <div className="form-row">
            <label>
              主题
              <select name="theme" defaultValue={settings.theme}>
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>
              动效
              <select name="motion" defaultValue={settings.motion}>
                <option value="rich">丰富 · 流畅而活泼</option>
                <option value="simple">简洁</option>
                <option value="off">关闭</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              卡片密度
              <select name="density" defaultValue={settings.density}>
                <option value="comfortable">舒适</option>
                <option value="compact">紧凑</option>
              </select>
            </label>
            <label>
              主题色
              <input
                name="accent"
                type="color"
                defaultValue={settings.accent}
              />
            </label>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "正在保存…" : "保存设置"}
            </button>
          </div>
        </form>
      </section>
    </motion.div>
  );
}

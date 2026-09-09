"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  MAX_TRANSFER_BYTES,
  type TransferPreview,
  type TransferRequest,
} from "@/lib/transfer";
import { requestJson } from "./atlas";

const statusLabels = {
  new: "可导入",
  duplicate: "重复，跳过",
  invalid: "无效，跳过",
  trashed: "回收站，跳过",
};

export function ImportPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"html" | "json">("html");
  const [mode, setMode] = useState<"merge" | "restore">("merge");
  const [prepared, setPrepared] = useState<{
    request: TransferRequest;
    preview: TransferPreview;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);

  function resetPreview() {
    setPrepared(null);
    setConfirmed(false);
    setMessage("");
    setCompleted(false);
  }
  async function preview() {
    if (!file) return;
    setBusy(true);
    resetPreview();
    try {
      if (file.size > MAX_TRANSFER_BYTES)
        throw new Error("文件超过 10 MB，请拆分后导入");
      const request = { format, mode, content: await file.text() };
      const result = await requestJson<TransferPreview>("/api/import/preview", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setPrepared({ request, preview: result });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "预览失败");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!prepared || (mode === "restore" && !confirmed)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await requestJson<
        TransferPreview & { backupName: string | null }
      >("/api/import/apply", {
        method: "POST",
        body: JSON.stringify({
          ...prepared.request,
          expectedFingerprint: prepared.preview.fingerprint,
        }),
      });
      // Clear the submitted preview before refreshing: a refresh failure must not
      // leave an already applied destructive operation available to submit again.
      setPrepared(null);
      setConfirmed(false);
      setCompleted(true);
      setMessage(
        result.backupName
          ? `恢复已完成。恢复前的完整备份保存在服务器数据目录 backups/${result.backupName}。`
          : `已导入 ${result.added} 个网站，跳过 ${result.duplicates} 个重复项。`,
      );
      try {
        await onChanged();
      } catch {
        setMessage((current) => `${current} 列表刷新失败，请刷新页面。`);
      }
    } catch (error) {
      setPrepared(null);
      setMessage(
        error instanceof Error ? error.message : "导入失败，请重新预览",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="transfer-panel glass">
      <summary>
        导入与备份 <span>把收藏带进来，也随时带走</span>
      </summary>
      <p>
        支持浏览器书签 HTML 和 Neo Atlas JSON。最多 10 MB、10,000
        个网站；嵌套文件夹转换为完整路径分类。
      </p>
      <a className="secondary" href="/api/backup" download>
        导出完整 JSON 备份
      </a>
      <fieldset disabled={busy} className="transfer-fields">
        <legend>导入文件</legend>
        <label>
          选择文件
          <input
            type="file"
            accept=".html,.htm,.json"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              const nextFormat = next?.name.toLowerCase().endsWith(".json")
                ? "json"
                : "html";
              setFormat(nextFormat);
              setMode("merge");
              resetPreview();
            }}
          />
        </label>
        <label>
          导入方式
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value === "restore" ? "restore" : "merge");
              resetPreview();
            }}
          >
            <option value="merge">合并：保留现有内容，重复 URL 跳过</option>
            {format === "json" && (
              <option value="restore">完整恢复：替换网站、分类和设置</option>
            )}
          </select>
        </label>
        <button
          className="secondary"
          disabled={!file}
          onClick={() => void preview()}
        >
          {busy ? "正在处理…" : "生成导入预览"}
        </button>
      </fieldset>
      {prepared && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="transfer-preview"
        >
          <div className="transfer-stats">
            <span>
              文件记录 <strong>{prepared.preview.total}</strong>
            </span>
            <span>
              {mode === "restore" ? "恢复" : "新增"}{" "}
              <strong>{prepared.preview.added}</strong>
            </span>
            <span>
              重复 <strong>{prepared.preview.duplicates}</strong>
            </span>
            <span>
              无效 <strong>{prepared.preview.invalid}</strong>
            </span>
            <span>
              回收站 <strong>{prepared.preview.trashed}</strong>
            </span>
            <span>
              {mode === "restore" ? "恢复分类" : "新增分类"}{" "}
              <strong>{prepared.preview.categoryCount}</strong>
            </span>
          </div>
          <p>
            {mode === "merge"
              ? "与现有网站（含回收站）及文件内网址去重；保留首次条目，跳过备份中的回收站记录。"
              : `将替换当前 ${prepared.preview.currentCount} 个网站及全部分类和设置，站点名称恢复为“${prepared.preview.settingsName}”。原数据会先完整备份。`}
          </p>
          <div
            className="transfer-table"
            tabIndex={0}
            role="region"
            aria-label="导入明细，可横向滚动"
          >
            <table>
              <thead>
                <tr>
                  <th>网站</th>
                  <th>分类</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {prepared.preview.rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      {row.title || "（空标题）"}
                      <small>{row.url}</small>
                    </td>
                    <td>{row.categoryName}</td>
                    <td>{row.reason ?? statusLabels[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prepared.preview.truncated && (
            <p>仅展示前 200 条明细，统计包含全部记录。</p>
          )}
          {mode === "restore" && (
            <label className="transfer-confirm">
              <input
                type="checkbox"
                disabled={busy}
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              我确认替换当前全部网站、分类和设置（包括回收站）。
            </label>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (mode === "restore" ? !confirmed : prepared.preview.added === 0)
            }
            onClick={() => void apply()}
          >
            {busy
              ? "正在处理…"
              : mode === "restore"
                ? "备份现有数据并恢复"
                : "确认合并导入"}
          </button>
        </motion.div>
      )}
      {message && (
        <p role="status" className={completed ? "" : "error"}>
          {message}
        </p>
      )}
    </details>
  );
}

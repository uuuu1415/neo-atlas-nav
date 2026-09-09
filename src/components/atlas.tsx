"use client";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useState } from "react";
import Link from "next/link";
import type { Website, Category } from "@/server/schema";
import type { Settings } from "@/lib/schemas";
import { WebsiteEditor } from "./website-editor";
import { SettingsPanel } from "./settings-panel";
import { BatchToolbar } from "./batch-toolbar";
import { CategoryManager } from "./category-manager";
import type { BatchCommand } from "@/lib/catalog-commands";

type Props = {
  initialWebsites: Website[];
  initialCategories: Category[];
  initialSettings: Settings;
  warning?: string;
};
export async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "请求失败");
  return data;
}
export function Atlas({
  initialWebsites,
  initialCategories,
  initialSettings,
  warning,
}: Props) {
  const [websites, setWebsites] = useState(initialWebsites);
  const [categories, setCategories] = useState(initialCategories);
  const [settings, setSettings] = useState(initialSettings);
  const [category, setCategory] = useState(settings.defaultCategory);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [editor, setEditor] = useState<Website | "new" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notice, setNotice] = useState(warning ?? "");
  const [categoryName, setCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [managing, setManaging] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const active = websites.filter((site) => !site.deletedAt);
  const visible = websites.filter((site) => {
    const matchesView =
      view === "trash"
        ? !!site.deletedAt
        : !site.deletedAt && (view !== "pinned" || site.pinned);
    return (
      matchesView &&
      (category === "all" || site.categoryId === category) &&
      `${site.title} ${site.description} ${site.url} ${site.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  async function refresh() {
    setWebsites(await requestJson<Website[]>("/api/websites"));
  }
  async function refreshCategories() {
    const next = await requestJson<Category[]>("/api/categories");
    setCategories(next);
    if (!next.some((item) => item.id === category)) setCategory("all");
    setSelected([]);
    await refresh();
  }
  async function batch(command: BatchCommand) {
    setBatchBusy(true);
    try {
      await requestJson("/api/websites/batch", {
        method: "POST",
        body: JSON.stringify(command),
      });
      await refresh();
      setSelected([]);
      setNotice("批量操作已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBatchBusy(false);
    }
  }
  async function move(id: string, direction: "up" | "down") {
    setBatchBusy(true);
    try {
      await requestJson("/api/websites/move", {
        method: "POST",
        body: JSON.stringify({ id, direction }),
      });
      await refresh();
      setNotice("分类内顺序已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "排序失败");
    } finally {
      setBatchBusy(false);
    }
  }
  async function update(site: Website, action: "trash" | "restore" | "edit") {
    try {
      await requestJson("/api/websites", {
        method: "PATCH",
        body: JSON.stringify({
          id: site.id,
          action,
          data: { ...site, pinned: !site.pinned },
        }),
      });
      await refresh();
      setNotice(
        action === "trash"
          ? "已移入回收站"
          : action === "restore"
            ? "网站已恢复"
            : "置顶已更新",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    }
  }
  async function createCategory() {
    try {
      const created = await requestJson<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName }),
      });
      setCategories([...categories, created]);
      setCategoryName("");
      setAddingCategory(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    }
  }
  const duration =
    settings.motion === "off" ? 0 : settings.motion === "simple" ? 0.15 : 0.25;
  return (
    <MotionConfig reducedMotion="user" transition={{ duration }}>
      <div
        className={`atlas theme-${settings.theme}`}
        style={{ "--accent": settings.accent } as React.CSSProperties}
      >
        <aside className="sidebar glass">
          <Link className="brand" href="/">
            <span className="brand-icon">✳</span>
            <span>
              {settings.name}
              <small>YOUR DIGITAL ATLAS</small>
            </span>
          </Link>
          <div className="workspace-label">
            个人空间 <span>⌘ K</span>
          </div>
          <nav aria-label="主导航">
            {[
              ["all", "◈", "全部网站"],
              ["pinned", "☆", "常用置顶"],
              ["trash", "♧", "回收站"],
            ].map(([key, icon, label]) => (
              <button
                key={key}
                className={`nav-item ${view === key ? "active" : ""}`}
                onClick={() => {
                  setView(key ?? "all");
                  setCategory("all");
                  setSelected([]);
                }}
              >
                <span>{icon}</span>
                {label}
                <em>
                  {key === "all"
                    ? active.length
                    : key === "pinned"
                      ? active.filter((site) => site.pinned).length
                      : websites.length - active.length}
                </em>
              </button>
            ))}
          </nav>
          <div className="section-label">
            我的分类{" "}
            <button
              aria-label="新增分类"
              onClick={() => setAddingCategory(!addingCategory)}
            >
              ＋
            </button>
          </div>
          {addingCategory && (
            <form
              className="category-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createCategory();
              }}
            >
              <input
                autoFocus
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="分类名称"
                required
              />
              <button type="submit">添加</button>
            </form>
          )}
          <div className="category-list">
            {categories.map((item, index) => (
              <button
                key={item.id}
                className={`nav-item ${category === item.id ? "selected" : ""}`}
                onClick={() => {
                  setCategory(category === item.id ? "all" : item.id);
                  setSelected([]);
                }}
              >
                <span className={`category-dot dot-${index % 4}`} />
                {item.name}
                <em>
                  {active.filter((site) => site.categoryId === item.id).length}
                </em>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="local-status">
              <span /> 数据保存在你的服务器
            </div>
            <button className="nav-item" onClick={() => setShowSettings(true)}>
              <span>⚙</span>偏好设置<span className="arrow">↗</span>
            </button>
            <div className="profile">
              <span className="avatar">N</span>
              <div>
                我的导航空间<small>一点整理，无限可能</small>
              </div>
            </div>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <div className="breadcrumb">
              我的空间 <span>/</span>{" "}
              <strong>
                {view === "trash"
                  ? "回收站"
                  : view === "pinned"
                    ? "常用置顶"
                    : "探索导航"}
              </strong>
            </div>
            <div className="top-actions">
              <span className="version">EARLY ACCESS · 0.1</span>
              <button
                className="icon-button glass"
                aria-label="切换主题"
                onClick={() =>
                  setSettings({
                    ...settings,
                    theme: settings.theme === "dark" ? "light" : "dark",
                  })
                }
              >
                ◐
              </button>
            </div>
          </header>
          <section className="page-intro">
            <div>
              <div className="eyebrow">
                <span /> A LITTLE MORE ORGANIZED
              </div>
              <h1>
                {view === "trash"
                  ? "留一点，反悔的余地。"
                  : "你的网络，自成一方。"}
              </h1>
              <p>{settings.description}</p>
            </div>
            <button className="primary" onClick={() => setEditor("new")}>
              <span>＋</span> 添加网站
            </button>
          </section>
          <section className="search-bar glass">
            <span className="search-icon">⌕</span>
            <input
              aria-label="搜索网站"
              placeholder="搜索你收藏的网站、描述或标签…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected([]);
              }}
            />
            <span className="search-hint">搜索收藏</span>
          </section>
          <CategoryManager
            categories={categories}
            onChanged={refreshCategories}
          />
          <div className="collection-heading">
            <div>
              <h2>
                {category === "all"
                  ? view === "trash"
                    ? "回收站"
                    : view === "pinned"
                      ? "常用置顶"
                      : "所有收藏"
                  : categories.find((item) => item.id === category)?.name}
              </h2>
              <span>{visible.length} 个网站</span>
            </div>
            <div className="view-control glass">
              <button
                onClick={() => {
                  setManaging(!managing);
                  setSelected([]);
                }}
              >
                {managing ? "结束管理" : "批量管理"}
              </button>
              <span>▦</span>
              <span className="muted">卡片视图</span>
            </div>
          </div>
          {managing && (
            <BatchToolbar
              ids={selected.filter((id) =>
                visible.some((site) => site.id === id),
              )}
              categories={categories}
              trash={view === "trash"}
              busy={batchBusy}
              onApply={batch}
              onClear={() => setSelected([])}
              onSelectAll={() => setSelected(visible.map((site) => site.id))}
            />
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="关闭提示" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          <motion.div
            layout={settings.motion !== "off"}
            className={`website-grid ${settings.density}`}
          >
            <AnimatePresence>
              {visible.map((site, index) => (
                <motion.article
                  key={site.id}
                  layout={settings.motion !== "off"}
                  initial={{
                    opacity: 0,
                    y: settings.motion === "rich" ? 12 : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    duration,
                    delay:
                      Math.min(index, 5) *
                      (settings.motion === "rich" ? 0.03 : 0),
                  }}
                  whileHover={settings.motion === "rich" ? { y: -4 } : {}}
                  className="website-card glass"
                >
                  <div className="card-top">
                    {managing && (
                      <input
                        type="checkbox"
                        aria-label={`选择${site.title}`}
                        checked={selected.includes(site.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, site.id]
                              : current.filter((id) => id !== site.id),
                          )
                        }
                      />
                    )}
                    <span className="site-icon">{site.title.slice(0, 1)}</span>
                    <div className="card-actions">
                      {!site.deletedAt &&
                        category !== "all" &&
                        !query &&
                        view === "all" && (
                          <>
                            <button
                              disabled={batchBusy || index === 0}
                              title="分类内上移"
                              onClick={() => void move(site.id, "up")}
                            >
                              ↑
                            </button>
                            <button
                              disabled={
                                batchBusy || index === visible.length - 1
                              }
                              title="分类内下移"
                              onClick={() => void move(site.id, "down")}
                            >
                              ↓
                            </button>
                          </>
                        )}
                      <button
                        title={site.pinned ? "取消置顶" : "置顶"}
                        onClick={() => void update(site, "edit")}
                      >
                        {site.pinned ? "★" : "☆"}
                      </button>
                      <button title="编辑" onClick={() => setEditor(site)}>
                        ↗
                      </button>
                    </div>
                  </div>
                  <a
                    className="site-link"
                    href={site.url}
                    target={settings.openInNewTab ? "_blank" : "_self"}
                    rel="noreferrer"
                  >
                    <h3>{site.title}</h3>
                    <span>{new URL(site.url).hostname}</span>
                  </a>
                  {settings.showDescription && (
                    <p>
                      {site.description || "还没有描述，留下一点你的使用心得。"}
                    </p>
                  )}
                  <div className="card-bottom">
                    <div className="tags">
                      {site.tags.slice(0, 2).map((tag) => (
                        <button key={tag} onClick={() => setQuery(tag)}>
                          #{tag}
                        </button>
                      ))}
                    </div>
                    <button
                      className="subtle"
                      onClick={() =>
                        void update(site, site.deletedAt ? "restore" : "trash")
                      }
                    >
                      {site.deletedAt ? "恢复" : "移入回收站"}
                    </button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </motion.div>
          {visible.length === 0 && (
            <div className="empty-state glass">
              <div className="empty-orbit">
                <span>✳</span>
              </div>
              <h2>{query ? "暂时没有找到这个网站" : "从一个好网站开始"}</h2>
              <p>
                {query
                  ? "换一个关键词，或者查看其他分类。"
                  : "把常用工具、灵感来源和喜欢的网站，收进自己的导航。"}
              </p>
              <button
                className="primary"
                onClick={() => (query ? setQuery("") : setEditor("new"))}
              >
                {query ? "清除搜索" : "＋ 添加第一个网站"}
              </button>
              <div className="empty-caption">你的收藏，由你定义</div>
            </div>
          )}
          <footer>
            <span>
              NEO ATLAS <i>✳</i> MAKE SPACE FOR GOOD THINGS.
            </span>
            <span>
              {active.length} 个网站 · {categories.length} 个分类
            </span>
          </footer>
        </main>
        <AnimatePresence>
          {editor && (
            <WebsiteEditor
              key="editor"
              website={editor === "new" ? undefined : editor}
              categories={categories}
              onClose={() => setEditor(null)}
              onSaved={async () => {
                await refresh();
                setEditor(null);
                setNotice("网站已保存");
              }}
            />
          )}
          {showSettings && (
            <SettingsPanel
              key="settings"
              settings={settings}
              onClose={() => setShowSettings(false)}
              onSaved={(next) => {
                setSettings(next);
                setNotice("设置已保存");
                setShowSettings(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

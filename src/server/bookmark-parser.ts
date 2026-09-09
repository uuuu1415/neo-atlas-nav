import { load } from "cheerio";
import { websiteInputSchema } from "../lib/schemas";
import {
  backupSchema,
  MAX_TRANSFER_BYTES,
  MAX_TRANSFER_ENTRIES,
  type Backup,
  type ImportEntry,
  type ImportRow,
  type TransferRequest,
} from "../lib/transfer";
import { CatalogError } from "./catalog-management";

export function canonicalUrl(input: string) {
  return new URL(input).href;
}
export function parseTransfer(request: TransferRequest): {
  backup?: Backup;
  entries: ImportEntry[];
  rows: ImportRow[];
} {
  if (Buffer.byteLength(request.content, "utf8") > MAX_TRANSFER_BYTES)
    throw new CatalogError("导入文件超过 10 MB");
  if (request.mode === "restore" && request.format !== "json")
    throw new CatalogError("完整恢复只支持 Neo Atlas JSON 备份");
  const entries: ImportEntry[] = [];
  const rows: ImportRow[] = [];
  function append(
    input: unknown,
    categoryName: string,
    title: string,
    url: string,
  ) {
    if (rows.length >= MAX_TRANSFER_ENTRIES)
      throw new CatalogError("单次导入最多 10,000 个网站");
    const result = websiteInputSchema.safeParse(input);
    if (!result.success) {
      rows.push({
        title,
        url,
        categoryName,
        status: "invalid",
        reason: result.error.issues[0]?.message ?? "无效网站",
      });
      return;
    }
    entries.push({
      ...result.data,
      url: canonicalUrl(result.data.url),
      categoryName,
    });
    rows.push({
      title: result.data.title,
      url: canonicalUrl(result.data.url),
      categoryName,
      status: "new",
    });
  }
  if (request.format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(request.content.replace(/^\uFEFF/, ""));
    } catch {
      throw new CatalogError("JSON 文件格式错误，未写入任何数据");
    }
    const backup = backupSchema.parse(data);
    const names = new Map(
      backup.categories.map((item) => [item.id, item.name]),
    );
    for (const site of [...backup.websites].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    )) {
      const categoryName = names.get(site.categoryId) ?? "未分类";
      if (site.deletedAt && request.mode === "merge")
        rows.push({
          title: site.title,
          url: site.url,
          categoryName,
          status: "trashed",
          reason: "合并导入跳过回收站记录",
        });
      else append(site, categoryName, site.title, site.url);
    }
    return { backup, entries, rows };
  }
  // Browser bookmark files often omit closing DT tags. Parse as HTML and walk
  // the DL ancestors rather than relying on source indentation or regular expressions.
  const $ = load(request.content);
  if (!$("dl").length)
    throw new CatalogError(
      "没有找到浏览器书签列表，请选择浏览器导出的 HTML 文件",
    );
  for (const anchor of $("dl a[href]").toArray()) {
    if (rows.length >= MAX_TRANSFER_ENTRIES)
      throw new CatalogError("单次导入最多 10,000 个网站");
    const folders: string[] = [];
    for (const list of $(anchor).parents("dl").toArray().reverse()) {
      let label = $(list).prevAll("h3").first().text().trim();
      if (!label)
        label = $(list).parent("dt").children("h3").first().text().trim();
      if (!label)
        label = $(list).prev("dt").children("h3").first().text().trim();
      if (label) folders.push(label);
    }
    const categoryName = folders.join(" / ") || "未分类";
    const title = $(anchor).text().trim();
    const url = $(anchor).attr("href") ?? "";
    const icon = $(anchor).attr("icon_uri") ?? $(anchor).attr("icon") ?? "";
    const iconUrl = /^https?:\/\//i.test(icon) ? icon : "";
    if (categoryName.length > 500) {
      rows.push({
        title,
        url,
        categoryName,
        status: "invalid",
        reason: "分类路径超过 500 字符",
      });
      continue;
    }
    append(
      {
        title,
        url,
        iconUrl,
        tags: ($(anchor).attr("tags") ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      categoryName,
      title,
      url,
    );
  }
  return { entries, rows };
}

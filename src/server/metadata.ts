import { load } from "cheerio";

export function resolveWebUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("仅支持 HTTP 或 HTTPS 地址");
  return url.href;
}

export function parseMetadata(html: string, sourceUrl: string) {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ?? $("title").first().text();
  const description =
    $('meta[property="og:description"]').attr("content") ??
    $('meta[name="description"]').attr("content") ??
    "";
  let base = sourceUrl;
  try {
    base = resolveWebUrl($("base[href]").attr("href") ?? sourceUrl, sourceUrl);
  } catch {
    /* A malformed base must not discard other metadata. */
  }
  let iconUrl = "";
  for (const element of $("link[rel][href]").toArray()) {
    const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) continue;
    try {
      iconUrl = resolveWebUrl($(element).attr("href") ?? "", base);
      break;
    } catch {
      /* Try the next candidate when a URL is unusable. */
    }
  }
  return {
    title: title.trim().slice(0, 160),
    description: description.trim().slice(0, 1000),
    iconUrl: iconUrl || new URL("/favicon.ico", sourceUrl).href,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    warning: "信息来自网页；图标为远程候选地址，尚未验证是否可显示。",
  };
}

export async function readBoundedHtml(response: Response, limit = 2_000_000) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error("页面超过下载大小限制");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("页面超过下载大小限制");
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchMetadata(
  inputUrl: string,
  timeoutMs: number,
  fetchPage: typeof fetch = fetch,
) {
  let url = resolveWebUrl(inputUrl);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchPage(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": "NeoAtlasNav/0.1 metadata preview" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("重定向响应缺少目标地址");
      url = resolveWebUrl(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`网站返回 HTTP ${response.status}，请手动填写或稍后重试`);
    }
    if (
      !/text\/html|application\/xhtml\+xml/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      await response.body?.cancel();
      throw new Error("目标不是 HTML 页面，请手动填写");
    }
    return parseMetadata(await readBoundedHtml(response), url);
  }
  throw new Error("页面重定向次数超过限制");
}

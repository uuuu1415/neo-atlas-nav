import { describe, expect, it, vi } from "vitest";
import {
  fetchMetadata,
  parseMetadata,
  readBoundedHtml,
} from "../src/server/metadata";

describe("metadata extraction", () => {
  it("handles reversed attributes, entities and relative icons", () => {
    const result = parseMetadata(
      '<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta content="Useful &quot;tool&quot;" name="description"><link href="../icon.png" rel="icon">',
      "https://example.com/tools/page",
    );
    expect(result.title).toBe("A & B");
    expect(result.description).toBe('Useful "tool"');
    expect(result.iconUrl).toBe("https://example.com/icon.png");
  });
  it("leaves absent text blank and rejects non-web icon schemes", () => {
    const result = parseMetadata(
      '<link rel="icon" href="javascript:alert(1)">',
      "https://example.com",
    );
    expect(result.title).toBe("");
    expect(result.description).toBe("");
    expect(result.iconUrl).toBe("https://example.com/favicon.ico");
  });
  it("cancels chunked downloads on byte limit rather than truncating afterwards", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
      },
      cancel,
    });
    await expect(readBoundedHtml(new Response(body), 8)).rejects.toThrow(
      "大小限制",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not parse HTTP error pages", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("denied", { status: 403 }));
    await expect(
      fetchMetadata("https://example.com", 1000, fake),
    ).rejects.toThrow("403");
  });
  it("caps redirect loops", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(null, { status: 302, headers: { location: "/again" } }),
      );
    await expect(
      fetchMetadata("https://example.com", 1000, fake),
    ).rejects.toThrow("重定向次数");
    expect(fake).toHaveBeenCalledTimes(6);
  });
  it("rejects non HTML responses", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("{}", { headers: { "content-type": "application/json" } }),
      );
    await expect(
      fetchMetadata("https://example.com", 1000, fake),
    ).rejects.toThrow("不是 HTML");
  });
});

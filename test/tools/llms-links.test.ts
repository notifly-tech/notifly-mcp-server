/**
 * LLMS Links Accessibility Tests
 *
 * Verifies that every URL listed in notifly-sdk-llms.txt and notifly-sdk-llms-en.txt
 * is accessible over the network. We treat HTTP 2xx as success and 429 (rate limit)
 * as acceptable for GitHub raw links.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";

type LinkItem = { title: string; url: string };

function parseLlmsLinks(content: string): LinkItem[] {
  const items: LinkItem[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\-\s*\[(.*?)\]\((.*?)\)/);
    if (m) {
      const [, title, url] = m;
      if (title && url) {
        items.push({ title: title.trim(), url: url.trim() });
      }
    }
  }
  return items;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // Prefer HEAD to reduce transfer; some endpoints may not support HEAD → fallback to GET
    let res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Notifly-MCP-Server-LinkCheck",
        Accept: "text/plain, */*",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (res.status === 405 || res.status === 400) {
      res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Notifly-MCP-Server-LinkCheck",
          Accept: "text/plain, */*",
          Range: "bytes=0-0", // fetch minimum data
        },
        signal: controller.signal,
        redirect: "follow",
      });
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkLinksAccessible(urls: string[], concurrency = 5, timeoutMs = 8000) {
  const results: Array<{ url: string; ok: boolean; status?: number; error?: string }> = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const current = urls[index++];
      try {
        const res = await fetchWithTimeout(current, timeoutMs);
        const ok = (res.status >= 200 && res.status < 300) || res.status === 429;
        results.push({ url: current, ok, status: res.status });
      } catch (err) {
        results.push({
          url: current,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  const failures = results.filter((r) => !r.ok);
  return { results, failures };
}

describe("LLMS link accessibility", () => {
  it("should have all links accessible in notifly-sdk-llms.txt", async () => {
    const content = await readFile("notifly-sdk-llms.txt", "utf8");
    const links = parseLlmsLinks(content);
    expect(links.length).toBeGreaterThan(0);

    const { failures } = await checkLinksAccessible(
      links.map((l) => l.url),
      5,
      10000
    );

    if (failures.length > 0) {
      const sample = failures.slice(0, 5).map((f) => `${f.url} (${f.status ?? f.error})`);
      throw new Error(
        `Some links are not accessible (${failures.length} failures). Examples:\n- ` +
          sample.join("\n- ")
      );
    }
  }, 120_000);

  it("should have all links accessible in notifly-sdk-llms-en.txt", async () => {
    const content = await readFile("notifly-sdk-llms-en.txt", "utf8");
    const links = parseLlmsLinks(content);
    expect(links.length).toBeGreaterThan(0);

    const { failures } = await checkLinksAccessible(
      links.map((l) => l.url),
      5,
      10000
    );

    if (failures.length > 0) {
      const sample = failures.slice(0, 5).map((f) => `${f.url} (${f.status ?? f.error})`);
      throw new Error(
        `Some links are not accessible (${failures.length} failures). Examples:\n- ` +
          sample.join("\n- ")
      );
    }
  }, 120_000);
});

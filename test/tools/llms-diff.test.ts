import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

function extractMarkdownLinks(content: string): string[] {
  const regex = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function diff(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return Array.from(new Set(a.filter((x) => !bSet.has(x)))).sort();
}

function findDuplicates(urls: string[]): Array<{ url: string; count: number }> {
  const freq = new Map<string, number>();
  for (const u of urls) {
    freq.set(u, (freq.get(u) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .filter(([, c]) => c > 1)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

describe("LLMS link differences (EN vs KO)", () => {
  it("should print links only in EN and only in KO", async () => {
    const root = process.cwd();
    const koPath = path.join(root, "notifly-sdk-llms.txt");
    const enPath = path.join(root, "notifly-sdk-llms-en.txt");

    const [koText, enText] = await Promise.all([
      readFile(koPath, "utf8"),
      readFile(enPath, "utf8"),
    ]);

    const koLinks = extractMarkdownLinks(koText);
    const enLinks = extractMarkdownLinks(enText);

    const onlyInEN = diff(enLinks, koLinks);
    const onlyInKO = diff(koLinks, enLinks);
    const duplicatesEN = findDuplicates(enLinks);
    const duplicatesKO = findDuplicates(koLinks);

    // eslint-disable-next-line no-console
    console.log("[llms-diff] Only in EN:");
    // eslint-disable-next-line no-console
    console.log(onlyInEN.map((u) => `  - ${u}`).join("\n") || "  (none)");
    // eslint-disable-next-line no-console
    console.log("[llms-diff] Only in KO:");
    // eslint-disable-next-line no-console
    console.log(onlyInKO.map((u) => `  - ${u}`).join("\n") || "  (none)");
    // eslint-disable-next-line no-console
    console.log("[llms-diff] Duplicates in EN (url x count):");
    // eslint-disable-next-line no-console
    console.log(duplicatesEN.map((d) => `  - ${d.url} x ${d.count}`).join("\n") || "  (none)");
    // eslint-disable-next-line no-console
    console.log("[llms-diff] Duplicates in KO (url x count):");
    // eslint-disable-next-line no-console
    console.log(duplicatesKO.map((d) => `  - ${d.url} x ${d.count}`).join("\n") || "  (none)");

    // Test should always pass; this is diagnostic output
    expect(onlyInEN).toBeDefined();
    expect(onlyInKO).toBeDefined();
  });
});

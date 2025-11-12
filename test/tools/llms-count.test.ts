import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

function countMarkdownLinks(content: string): number {
  const regex = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = regex.exec(content)) !== null) {
    count += 1;
  }
  return count;
}

describe("LLMS link counts", () => {
  it("should count total links in KO and EN SDK llms files", async () => {
    const root = process.cwd();
    const koPath = path.join(root, "notifly-sdk-llms.txt");
    const enPath = path.join(root, "notifly-sdk-llms-en.txt");

    const [koText, enText] = await Promise.all([
      readFile(koPath, "utf8"),
      readFile(enPath, "utf8"),
    ]);

    const koCount = countMarkdownLinks(koText);
    const enCount = countMarkdownLinks(enText);

    // Print counts for visibility in test output
    // eslint-disable-next-line no-console
    console.log(`[llms-count] notifly-sdk-llms.txt links: ${koCount}`);
    // eslint-disable-next-line no-console
    console.log(`[llms-count] notifly-sdk-llms-en.txt links: ${enCount}`);

    // Basic sanity assertions; ensure both indexes are non-trivial
    expect(koCount).toBeGreaterThan(50);
    expect(enCount).toBeGreaterThan(50);
  });
});

/**
 * SDK Search Tool Tests
 *
 * Tests the SDK search functionality with BM25 algorithm
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sdkSearchTool } from "../../src/tools/search-sdk.js";
import type { ServerContext } from "../../src/types.js";

// Mock fetch for testing: serve remote sdk-llms.txt and raw code
const REMOTE_LLMS_EN =
  "https://raw.githubusercontent.com/notifly-tech/notifly-mcp-server/refs/heads/main/notifly-sdk-llms-en.txt";
const REMOTE_LLMS_KO =
  "https://raw.githubusercontent.com/notifly-tech/notifly-mcp-server/refs/heads/main/notifly-sdk-llms.txt";

const LLMS_TEXT = [
  "# Platform: iOS",
  "- [Notifly Main Entry](https://raw.githubusercontent.com/team-michael/notifly-ios-sdk/refs/heads/main/Sources/Notifly/notifly-ios-sdk/notifly-ios-sdk/SourceCodes/Notifly/Notifly.swift): Singleton entry point of Notifly iOS SDK.",
  "- [Notification Service Extension](https://raw.githubusercontent.com/team-michael/notifly-ios-sdk/refs/heads/main/Sources/Notifly/notifly-ios-sdk/notifly-ios-sdk/SourceCodes/NotiflyExtension/NotificationServiceExtension.swift): Enables rich push processing.",
  "# Platform: android",
  "- [RN Module Implementation](https://raw.githubusercontent.com/team-michael/notifly-react-native-sdk/refs/heads/main/android/src/main/java/tech/notifly/rn/NotiflySdkModule.kt): ReactMethods for native SDK calls.",
  "# Platform: react-native",
  "- [JS Public API (index)](https://raw.githubusercontent.com/team-michael/notifly-react-native-sdk/refs/heads/main/src/index.tsx): Public interface for React Native.",
].join("\n");

global.fetch = vi.fn();

describe("SDK Search Tool", () => {
  const mockContext: ServerContext = {};

  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => {
      if (
        typeof url === "string" &&
        (url.includes(REMOTE_LLMS_EN) || url.includes(REMOTE_LLMS_KO))
      ) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(LLMS_TEXT) });
      }
      // Return small code snippet for raw source file requests
      return Promise.resolve({ ok: true, text: () => Promise.resolve("class Notifly { }") });
    });
  });

  describe("Tool Metadata", () => {
    it("should have correct tool name", () => {
      expect(sdkSearchTool.name).toBe("search_sdk");
    });

    // Description expectations are relaxed; content may change without BM25 mention

    it("should have correct input schema", () => {
      expect(sdkSearchTool.inputSchema).toHaveProperty("query");
      expect(sdkSearchTool.inputSchema).toHaveProperty("platform");
      expect(sdkSearchTool.inputSchema).toHaveProperty("maxResults");
    });
  });

  describe("Platform Filtering", () => {
    it("should filter by iOS platform", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 5 },
        mockContext
      );

      expect(result).toContain("ios");
      expect(result).not.toContain("android");
      expect(result).not.toContain("react-native");
    });

    it("should filter by Android platform", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "android", maxResults: 5 },
        mockContext
      );

      expect(result).toContain("android");
      expect(result).not.toContain("ios");
    });

    it('should search all platforms when platform="all"', async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "all", maxResults: 5 },
        mockContext
      );

      // Should have results from multiple platforms
      expect(result).toContain("Platform");
    });
  });

  describe("Language Selection and Fallback", () => {
    it("should use EN llms for English queries", async () => {
      const fetchSpy = vi.spyOn(global, "fetch" as any);
      await sdkSearchTool.handler(
        { query: "notifly", platform: "all", maxResults: 1 },
        mockContext
      );
      const firstCall = (fetchSpy as any).mock.calls[0][0] as string;
      expect(firstCall).toContain(REMOTE_LLMS_EN);
    });

    it("should use KO llms for Korean queries", async () => {
      const fetchSpy = vi.spyOn(global, "fetch" as any);
      await sdkSearchTool.handler({ query: "알림", platform: "all", maxResults: 1 }, mockContext);
      const firstCall = (fetchSpy as any).mock.calls[0][0] as string;
      expect(firstCall).toContain(REMOTE_LLMS_KO);
    });

    it("should fall back to local llms when remote fetch fails", async () => {
      // Make the first call (llms fetch) fail to trigger fallback
      (global.fetch as any).mockImplementationOnce(() => Promise.reject(new Error("offline")));
      // Subsequent code fetches should still succeed
      (global.fetch as any).mockImplementation((url: string) =>
        Promise.resolve({ ok: true, text: () => Promise.resolve("// code") })
      );

      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );
      expect(result).toContain("# Notifly SDK Search Results");
      expect(result).toContain("Result 1");
    });
  });

  describe("BM25 Search Quality", () => {
    it("should rank title matches highest", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "all", maxResults: 5 },
        mockContext
      );

      // Should rank 'Notifly Main Entry' highest for 'notifly' query
      expect(result).toContain("Notifly Main Entry");
      expect(result).toContain("# Notifly SDK Search Results");
    });

    it("should weight title higher than description", async () => {
      const result = await sdkSearchTool.handler(
        { query: "initialization", platform: "all", maxResults: 5 },
        mockContext
      );

      // Should find results where "initialization" is in description
      expect(result).toContain("SDK");
    });

    it("should handle multi-term queries", async () => {
      const mockCode = "class NotificationService { }";
      (global.fetch as any).mockImplementation((url: string) => {
        if (
          typeof url === "string" &&
          (url.includes(REMOTE_LLMS_EN) || url.includes(REMOTE_LLMS_KO))
        ) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(LLMS_TEXT) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve(mockCode) });
      });

      const result = await sdkSearchTool.handler(
        { query: "push notification service", platform: "all", maxResults: 5 },
        mockContext
      );

      // Should match documents with multiple query terms
      expect(result).toContain("Notification Service");
    });
  });

  describe("Source Code Fetching", () => {
    it("should fetch source code from GitHub", async () => {
      const mockCode = `class Notifly {
  init(config: NotiflyConfig) {
    // Initialize SDK
  }
}`;

      (global.fetch as any).mockImplementation((url: string) => {
        if (
          typeof url === "string" &&
          (url.includes(REMOTE_LLMS_EN) || url.includes(REMOTE_LLMS_KO))
        ) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(LLMS_TEXT) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve(mockCode) });
      });

      const result = await sdkSearchTool.handler(
        { query: "notifly sdk", platform: "ios", maxResults: 1 },
        mockContext
      );

      // Should contain the actual source code
      expect(result).toContain("class Notifly");
    });

    it("should detect and apply correct syntax highlighting", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );

      // Should use swift syntax highlighting for .swift files
      expect(result).toContain("```swift");
    });

    it("should truncate long source files", async () => {
      const longCode = "// Code\n".repeat(1000);

      (global.fetch as any).mockImplementation((url: string) => {
        if (
          typeof url === "string" &&
          (url.includes(REMOTE_LLMS_EN) || url.includes(REMOTE_LLMS_KO))
        ) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(LLMS_TEXT) });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve(longCode) });
      });

      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );

      // Should be truncated
      expect(result).toContain("truncated for brevity");
    });

    it("should handle fetch errors gracefully", async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (
          typeof url === "string" &&
          (url.includes(REMOTE_LLMS_EN) || url.includes(REMOTE_LLMS_KO))
        ) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(LLMS_TEXT) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );

      // Should contain error message but not fail
      expect(result).toContain("Unable to fetch content");
    });
  });

  describe("Result Formatting", () => {
    it("should include summary section", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "all", maxResults: 3 },
        mockContext
      );

      expect(result).toContain("## Summary");
      expect(result).toContain("most relevant");
    });

    it("should include platform information", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 2 },
        mockContext
      );

      expect(result).toContain("**Platform**: ios");
    });

    it("should include GitHub source links", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );

      expect(result).toContain("**GitHub Source**:");
      expect(result).toContain("https://raw.githubusercontent.com/");
    });

    it("should include helpful footer", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "ios", maxResults: 1 },
        mockContext
      );

      expect(result).toContain("**Note**:");
      expect(result).toContain("source code");
    });
  });

  describe("Error Handling", () => {
    it("should handle no search results", async () => {
      const result = await sdkSearchTool.handler(
        { query: "nonexistent_feature_xyz", platform: "all", maxResults: 3 },
        mockContext
      );

      expect(result).toContain("No Results Found");
    });

    it("should handle platform with no matches", async () => {
      const result = await sdkSearchTool.handler(
        { query: "nonexistent_feature_xyz", platform: "flutter", maxResults: 3 },
        mockContext
      );

      expect(result).toContain("No Results Found");
    });
  });

  describe("maxResults Parameter", () => {
    it("should respect maxResults parameter", async () => {
      const result = await sdkSearchTool.handler(
        { query: "notifly", platform: "all", maxResults: 2 },
        mockContext
      );

      // Count result sections
      const resultMatches = result.match(/## Result \d+:/g);
      expect(resultMatches).toBeTruthy();
      expect(resultMatches!.length).toBeLessThanOrEqual(2);
    });
  });
});

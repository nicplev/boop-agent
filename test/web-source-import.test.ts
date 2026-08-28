import { describe, expect, it, vi } from "vitest";
import {
  importPublicWebSource,
  isBlockedNetworkAddress,
  validatePublicWebUrl,
} from "../server/web-source-import.js";

const publicResolver = async () => [{ address: "93.184.216.34" }];

describe("web source network guard", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.20",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
  ])("blocks private address %s", (address) => {
    expect(isBlockedNetworkAddress(address)).toBe(true);
  });

  it("rejects localhost and credential-bearing URLs", async () => {
    await expect(validatePublicWebUrl("http://localhost:3456/private")).rejects.toThrow(
      "Local and private",
    );
    await expect(
      validatePublicWebUrl("https://example.com/report?access_token=secret", publicResolver),
    ).rejects.toThrow("access tokens");
  });

  it("accepts a normal public webpage", async () => {
    const url = await validatePublicWebUrl("https://example.com/report#section", publicResolver);
    expect(url.toString()).toBe("https://example.com/report");
  });
});
describe("web source extraction", () => {
  it("extracts readable evidence without scripts or markup", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<!doctype html><html><head><title>Lumi Research</title><meta name="description" content="Evidence summary"></head><body><script>alert('x')</script><main><h1>Reading engagement</h1><p>Students read more when progress is visible and encouraging.</p></main></body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    );

    const source = await importPublicWebSource("https://example.com/research", {
      fetchImpl,
      resolveAddresses: publicResolver,
    });

    expect(source.title).toBe("Lumi Research");
    expect(source.summary).toBe("Evidence summary");
    expect(source.content).toContain("Reading engagement");
    expect(source.content).not.toContain("alert('x')");
  });

  it("revalidates redirects and blocks a redirect to a local service", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3456/private" } }),
    );

    await expect(
      importPublicWebSource("https://example.com/redirect", {
        fetchImpl,
        resolveAddresses: publicResolver,
      }),
    ).rejects.toThrow("Local and private");
  });
});

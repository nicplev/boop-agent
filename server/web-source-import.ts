import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_SOURCE_CHARACTERS = 50_000;
const SENSITIVE_QUERY_KEY = /(?:^|[_-])(auth|code|credential|key|password|secret|signature|sig|token)(?:$|[_-])/i;

export class WebSourceImportError extends Error {}

type AddressLookup = (hostname: string) => Promise<Array<{ address: string }>>;

export interface ImportedWebSource {
  title: string;
  summary?: string;
  content: string;
  uri: string;
  externalId: string;
  occurredAt?: number;
  metadata: string;
}
function blockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? blockedIpv4(mapped) : false;
}

export function isBlockedNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blockedIpv4(address);
  if (version === 6) return blockedIpv6(address);
  return true;
}

async function systemLookup(hostname: string): Promise<Array<{ address: string }>> {
  return await lookup(hostname, { all: true, verbatim: true });
}

export async function validatePublicWebUrl(
  rawUrl: string,
  resolveAddresses: AddressLookup = systemLookup,
): Promise<URL> {
  if (rawUrl.length > 2_048) throw new WebSourceImportError("URL is too long");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebSourceImportError("Enter a valid webpage URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WebSourceImportError("Only http and https webpages can be imported");
  }
  if (url.username || url.password) {
    throw new WebSourceImportError("URLs containing credentials cannot be imported");
  }
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      throw new WebSourceImportError("Remove credentials or access tokens from the URL");
    }
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid")
  ) {
    throw new WebSourceImportError("Local and private network addresses cannot be imported");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolveAddresses(hostname).catch(() => []);
  if (addresses.length === 0) throw new WebSourceImportError("The webpage host could not be resolved");
  if (addresses.some(({ address }) => isBlockedNetworkAddress(address))) {
    throw new WebSourceImportError("Local and private network addresses cannot be imported");
  }

  url.hash = "";
  return url;
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new WebSourceImportError("The webpage is larger than the 1 MB import limit");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new WebSourceImportError("The webpage is larger than the 1 MB import limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function compactText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMetaDescription(html: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const isDescription = /\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag);
    if (!isDescription) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    const summary = content ? compactText(decodeHtmlEntities(content)) : "";
    if (summary) return summary.slice(0, 500);
  }
  return undefined;
}

function htmlToText(html: string): string {
  const withoutUnsafeBlocks = html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutUnsafeBlocks.replace(
    /<\/?(?:article|aside|blockquote|br|div|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|td|th|tr|ul)\b[^>]*>/gi,
    "\n",
  );
  return compactText(decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))).slice(
    0,
    MAX_SOURCE_CHARACTERS,
  );
}

function fallbackTitle(url: URL): string {
  const finalSegment = url.pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ");
  return (finalSegment || url.hostname).slice(0, 240);
}

export async function importPublicWebSource(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; resolveAddresses?: AddressLookup } = {},
): Promise<ImportedWebSource> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveAddresses = options.resolveAddresses ?? systemLookup;
  let url = await validatePublicWebUrl(rawUrl.trim(), resolveAddresses);
  let response: Response | undefined;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "text/html,text/plain;q=0.9,application/xhtml+xml;q=0.8",
        "User-Agent": "Lumi-Assistant-Source-Importer/0.2",
      },
    }).catch((error: unknown) => {
      throw new WebSourceImportError(
        error instanceof Error && error.name === "TimeoutError"
          ? "The webpage took too long to respond"
          : "The webpage could not be fetched",
      );
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new WebSourceImportError("The webpage returned an invalid redirect");
      if (redirect === MAX_REDIRECTS) {
        throw new WebSourceImportError("The webpage redirected too many times");
      }
      url = await validatePublicWebUrl(new URL(location, url).toString(), resolveAddresses);
      continue;
    }
    break;
  }

  if (!response?.ok) {
    throw new WebSourceImportError(`The webpage returned HTTP ${response?.status ?? "error"}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("text/html") &&
    !contentType.startsWith("application/xhtml+xml") &&
    !contentType.startsWith("text/plain")
  ) {
    throw new WebSourceImportError("Only HTML and plain-text webpages can be imported");
  }

  const raw = await readLimitedText(response);
  const isHtml = !contentType.startsWith("text/plain");
  const content = isHtml ? htmlToText(raw) : compactText(raw).slice(0, MAX_SOURCE_CHARACTERS);
  if (content.length < 40) {
    throw new WebSourceImportError("The webpage did not contain enough readable text");
  }

  const extractedTitle = isHtml
    ? compactText(decodeHtmlEntities(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""))
    : "";
  const modifiedAt = Date.parse(response.headers.get("last-modified") ?? "");

  return {
    title: (extractedTitle || fallbackTitle(url)).slice(0, 240),
    summary: isHtml ? extractMetaDescription(raw) : undefined,
    content,
    uri: url.toString(),
    externalId: url.toString(),
    occurredAt: Number.isFinite(modifiedAt) ? modifiedAt : undefined,
    metadata: JSON.stringify({ contentType, importedFrom: "web" }),
  };
}

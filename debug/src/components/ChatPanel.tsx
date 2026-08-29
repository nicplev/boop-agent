import {
  Fragment,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  Cancel01Icon,
  ChatSparkIcon,
  Copy01Icon,
  Plug01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { LumiMark } from "./LumiMark.js";
import { RuntimeProviderLogo, type RuntimeProvider } from "../lib/branding.js";
import { useSocket, type SocketEvent } from "../lib/useSocket.js";

interface ChatConversation {
  conversationId: string;
  title: string;
  preview: string;
  messageCount: number;
  lastActivityAt: number;
}

interface ChatMessage {
  _id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  imageUrls?: string[];
  optimistic?: boolean;
}

interface ChatCapability {
  name: string;
  description: string;
}

interface CapabilitiesResponse {
  runtime: { runtime: RuntimeProvider; model: string };
  integrations: ChatCapability[];
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 4;
const ACCEPTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const STARTERS = [
  "Give me a concise overview of Lumi's current priorities",
  "Review the latest Lumi code changes and flag anything important",
  "Draft a professional follow-up email from my recent context",
  "Help me plan the next development milestone",
];

function newConversationId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `desktop:${id}`;
}

function formatConversationTime(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function humanizeTool(value: string): string {
  const short = value.split("__").pop() ?? value;
  return short
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 80);
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export function ChatPanel({
  isDark,
  runtime,
  model,
  onOpenConnections,
}: {
  isDark: boolean;
  runtime: RuntimeProvider | null;
  model: string;
  onOpenConnections: () => void;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationId, setConversationId] = useState(() => {
    try {
      return localStorage.getItem("lumi-desktop-chat") || newConversationId();
    } catch {
      return newConversationId();
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [streamText, setStreamText] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/conversations", { cache: "no-store" });
      const payload = await jsonResponse<{ conversations: ChatConversation[] }>(response);
      setConversations(payload.conversations);
    } catch (nextError) {
      console.error("[chat] conversations", nextError);
    }
  }, []);

  const loadMessages = useCallback(async (targetId: string) => {
    try {
      const response = await fetch(
        `/api/chat/messages?conversationId=${encodeURIComponent(targetId)}`,
        { cache: "no-store" },
      );
      const payload = await jsonResponse<{ messages: ChatMessage[] }>(response);
      setMessages(payload.messages);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Couldn't load this chat");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    fetch("/api/chat/capabilities", { cache: "no-store" })
      .then((response) => jsonResponse<CapabilitiesResponse>(response))
      .then(setCapabilities)
      .catch((nextError) => console.error("[chat] capabilities", nextError));
  }, [loadConversations]);

  useEffect(() => {
    setLoadingMessages(true);
    setMessages([]);
    setStreamText("");
    setActivity(null);
    setActiveAgentId(null);
    setError(null);
    try {
      localStorage.setItem("lumi-desktop-chat", conversationId);
    } catch {
      // Local persistence is a convenience only.
    }
    void loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: sending ? "smooth" : "auto" });
  }, [messages, streamText, activity, sending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  const onSocketEvent = useCallback(
    (event: SocketEvent) => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      if (data.conversationId !== conversationId) return;

      if (event.event === "assistant_delta" && typeof data.content === "string") {
        setStreamText((current) => current + data.content);
        setActivity(null);
      } else if (event.event === "assistant_status") {
        if (data.state === "thinking") setActivity("Thinking");
        if (data.state === "idle") setActivity(null);
      } else if (event.event === "agent_spawned") {
        if (typeof data.agentId === "string") setActiveAgentId(data.agentId);
        setStreamText("");
        setActivity(typeof data.name === "string" ? `Working with ${data.name}` : "Working");
      } else if (event.event === "agent_tool") {
        if (typeof data.toolName === "string") setActivity(humanizeTool(data.toolName));
      } else if (event.event === "agent_done") {
        setActiveAgentId(null);
        setActivity("Finishing response");
      } else if (event.event === "assistant_message" || event.event === "user_message") {
        if (event.event === "assistant_message") {
          setStreamText("");
          setActivity(null);
          setActiveAgentId(null);
        }
        window.setTimeout(() => void loadMessages(conversationId), 80);
        window.setTimeout(() => void loadConversations(), 160);
      }
    },
    [conversationId, loadConversations, loadMessages],
  );
  useSocket(onSocketEvent);

  function startNewChat() {
    setConversationId(newConversationId());
    setDraft("");
    setPendingImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function selectConversation(id: string) {
    if (id === conversationId || sending) return;
    setConversationId(id);
  }

  function addImages(files: FileList | File[]) {
    const additions: PendingImage[] = [];
    let nextError: string | null = null;
    for (const file of Array.from(files)) {
      if (pendingImages.length + additions.length >= MAX_IMAGES) {
        nextError = `You can attach up to ${MAX_IMAGES} images.`;
        break;
      }
      if (!ACCEPTED_IMAGES.has(file.type)) {
        nextError = `${file.name} isn't a supported image.`;
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        nextError = `${file.name} is larger than 10 MB.`;
        continue;
      }
      additions.push({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (additions.length) setPendingImages((current) => [...current, ...additions]);
    setError(nextError);
  }

  function removeImage(id: string) {
    setPendingImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  async function uploadImage(image: PendingImage) {
    const urlResponse = await fetch("/api/chat/upload-url", { method: "POST" });
    const { uploadUrl } = await jsonResponse<{ uploadUrl: string }>(urlResponse);
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": image.file.type },
      body: image.file,
    });
    const payload = await jsonResponse<{ storageId: string }>(uploadResponse);
    return { storageId: payload.storageId, mediaType: image.file.type };
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (sending || (!content && pendingImages.length === 0)) return;

    const images = [...pendingImages];
    const optimistic: ChatMessage = {
      _id: `optimistic-${Date.now()}`,
      conversationId,
      role: "user",
      content,
      createdAt: Date.now(),
      imageUrls: images.map((image) => image.previewUrl),
      optimistic: true,
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setPendingImages([]);
    setSending(true);
    setError(null);
    setStreamText("");
    setActivity("Preparing your request");

    try {
      const uploadedImages = await Promise.all(images.map(uploadImage));
      setActivity("Thinking");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content, images: uploadedImages }),
      });
      await jsonResponse<{ reply: string }>(response);
      await loadMessages(conversationId);
      await loadConversations();
      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    } catch (nextError) {
      setMessages((current) => current.filter((message) => message._id !== optimistic._id));
      setDraft(content);
      setPendingImages(images);
      setError(nextError instanceof Error ? nextError.message : "Lumi couldn't send that message");
    } finally {
      setSending(false);
      setStreamText("");
      setActivity(null);
      setActiveAgentId(null);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  async function stopAgent() {
    if (!activeAgentId) return;
    setActivity("Stopping");
    try {
      await fetch(`/api/agents/${encodeURIComponent(activeAgentId)}/cancel`, { method: "POST" });
    } catch {
      setError("Lumi couldn't stop the current work.");
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const activeConversation = conversations.find(
    (conversation) => conversation.conversationId === conversationId,
  );
  const currentRuntime = capabilities?.runtime.runtime ?? runtime;
  const currentModel = capabilities?.runtime.model ?? model;
  const integrationCount = capabilities?.integrations.length ?? 0;
  const empty = !loadingMessages && messages.length === 0;

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={`hidden w-[218px] shrink-0 flex-col border-r lg:flex ${
          isDark ? "border-white/10 bg-black/10" : "border-zinc-200 bg-zinc-50/80"
        }`}
      >
        <div className="p-3">
          <button
            type="button"
            onClick={startNewChat}
            className={`flex h-9 w-full items-center justify-center gap-2 rounded-xl border text-xs font-medium ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} />
            New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-3 debug-scroll">
          <div className={`px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.16em] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            Recent
          </div>
          {conversations.length === 0 ? (
            <p className={`px-2 text-[11px] leading-5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              Your desktop chats will appear here.
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => selectConversation(conversation.conversationId)}
                  disabled={sending && conversation.conversationId !== conversationId}
                  className={`w-full rounded-xl px-2.5 py-2 text-left ${
                    conversation.conversationId === conversationId
                      ? isDark
                        ? "bg-white/8 text-zinc-100"
                        : "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200"
                      : isDark
                        ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {conversation.title}
                    </span>
                    <span className={`shrink-0 text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      {formatConversationTime(conversation.lastActivityAt)}
                    </span>
                  </div>
                  <div className={`mt-0.5 truncate text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {conversation.preview}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className={`flex h-12 shrink-0 items-center justify-between border-b px-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="min-w-0">
            <div className={`truncate text-xs font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              {activeConversation?.title ?? "New chat"}
            </div>
            <div className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              Private to your Lumi workspace
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setToolsOpen((open) => !open)}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] ${
                isDark ? "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200" : "border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
              }`}
              aria-expanded={toolsOpen}
            >
              <HugeiconsIcon icon={Plug01Icon} size={14} />
              {integrationCount} tools
            </button>
            {currentRuntime && (
              <div className={`hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] md:flex ${isDark ? "border-white/10 bg-white/5 text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
                <RuntimeProviderLogo runtime={currentRuntime} size={14} />
                <span className="max-w-[150px] truncate mono">{currentModel}</span>
              </div>
            )}
            {toolsOpen && (
              <ToolsPopover
                isDark={isDark}
                integrations={capabilities?.integrations ?? []}
                onOpenConnections={() => {
                  setToolsOpen(false);
                  onOpenConnections();
                }}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto debug-scroll">
          <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-5 pb-36 pt-7">
            {loadingMessages ? (
              <div className="flex flex-1 items-center justify-center">
                <ThinkingDots isDark={isDark} />
              </div>
            ) : empty ? (
              <WelcomeState
                isDark={isDark}
                integrations={capabilities?.integrations ?? []}
                onSelect={(starter) => {
                  setDraft(starter);
                  window.setTimeout(() => textareaRef.current?.focus(), 0);
                }}
              />
            ) : (
              <div className="space-y-7">
                {messages.map((message) => (
                  <MessageRow key={message._id} message={message} isDark={isDark} />
                ))}
                {streamText && (
                  <MessageRow
                    message={{
                      _id: "streaming",
                      conversationId,
                      role: "assistant",
                      content: streamText,
                      createdAt: Date.now(),
                    }}
                    isDark={isDark}
                    streaming
                  />
                )}
                {activity && !streamText && (
                  <div className="flex items-center gap-3 fade-in">
                    <LumiMark size={28} />
                    <div className={`flex items-center gap-2 text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                      <ThinkingDots isDark={isDark} compact />
                      {activity}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t pb-4 pt-14 ${isDark ? "from-[#18181b] via-[#18181b]/95 to-transparent" : "from-[#fbfbfa] via-[#fbfbfa]/95 to-transparent"}`}>
          <form onSubmit={sendMessage} className="mx-auto w-full max-w-[820px] px-5">
            {error && (
              <div className={`mb-2 flex items-center justify-between rounded-xl border px-3 py-2 text-[11px] ${isDark ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </button>
              </div>
            )}
            <div className={`rounded-[22px] border p-2 shadow-2xl ${isDark ? "border-white/10 bg-[#222226] shadow-black/25" : "border-zinc-200 bg-white shadow-zinc-300/40"}`}>
              {pendingImages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-1 pb-2 debug-scroll">
                  {pendingImages.map((image) => (
                    <div key={image.id} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                      <img src={image.previewUrl} alt={image.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-80 hover:opacity-100"
                        aria-label={`Remove ${image.file.name}`}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                onPaste={(event) => {
                  const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                  if (images.length) addImages(images);
                }}
                placeholder="Message Lumi Assistant"
                rows={1}
                disabled={sending}
                className={`block max-h-[180px] min-h-[42px] w-full resize-none bg-transparent px-2 py-2 text-[13px] leading-6 outline-none ${isDark ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-900 placeholder:text-zinc-400"}`}
              />
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files) addImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || pendingImages.length >= MAX_IMAGES}
                    className={`rounded-full p-2 ${isDark ? "text-zinc-500 hover:bg-white/5 hover:text-zinc-200" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
                    title="Attach screenshots or images"
                    aria-label="Attach images"
                  >
                    <HugeiconsIcon icon={Attachment01Icon} size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToolsOpen((open) => !open)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] ${isDark ? "text-zinc-500 hover:bg-white/5 hover:text-zinc-200" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
                  >
                    <HugeiconsIcon icon={Plug01Icon} size={15} />
                    Tools
                  </button>
                </div>
                {sending && activeAgentId ? (
                  <button
                    type="button"
                    onClick={stopAgent}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${isDark ? "bg-zinc-100 text-zinc-950 hover:bg-white" : "bg-zinc-900 text-white hover:bg-black"}`}
                    title="Stop current work"
                    aria-label="Stop current work"
                  >
                    <HugeiconsIcon icon={StopIcon} size={15} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && pendingImages.length === 0)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      sending || (!draft.trim() && pendingImages.length === 0)
                        ? isDark
                          ? "bg-white/8 text-zinc-600"
                          : "bg-zinc-100 text-zinc-400"
                        : isDark
                          ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                          : "bg-zinc-900 text-white hover:bg-black"
                    }`}
                    aria-label="Send message"
                  >
                    <HugeiconsIcon icon={ArrowUp02Icon} size={17} />
                  </button>
                )}
              </div>
            </div>
            <div className={`pt-1.5 text-center text-[9px] ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
              Lumi can use connected tools and may make mistakes. External actions still require approval.
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function WelcomeState({
  isDark,
  integrations,
  onSelect,
}: {
  isDark: boolean;
  integrations: ChatCapability[];
  onSelect: (starter: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#ef4246] shadow-xl shadow-red-500/10">
        <LumiMark size={54} />
      </div>
      <h2 className={`text-xl font-semibold tracking-tight ${isDark ? "text-zinc-100" : "text-zinc-950"}`}>
        What can I help with?
      </h2>
      <p className={`mt-2 max-w-md text-xs leading-5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
        Chat with Lumi using your memory, projects, codebase, assets, web research, and connected services.
      </p>
      {integrations.length > 0 && (
        <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
          {integrations.slice(0, 7).map((integration) => (
            <span key={integration.name} className={`rounded-full border px-2 py-1 text-[9px] ${isDark ? "border-white/10 bg-white/5 text-zinc-500" : "border-zinc-200 bg-white text-zinc-500"}`}>
              {integration.name}
            </span>
          ))}
          {integrations.length > 7 && (
            <span className={`rounded-full border px-2 py-1 text-[9px] ${isDark ? "border-white/10 bg-white/5 text-zinc-500" : "border-zinc-200 bg-white text-zinc-500"}`}>
              +{integrations.length - 7} more
            </span>
          )}
        </div>
      )}
      <div className="mt-7 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => onSelect(starter)}
            className={`rounded-2xl border p-3 text-left text-[11px] leading-5 ${isDark ? "border-white/10 bg-white/[0.025] text-zinc-400 hover:bg-white/5 hover:text-zinc-200" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"}`}
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolsPopover({
  isDark,
  integrations,
  onOpenConnections,
}: {
  isDark: boolean;
  integrations: ChatCapability[];
  onOpenConnections: () => void;
}) {
  return (
    <div className={`absolute right-0 top-10 z-50 w-80 rounded-2xl border p-3 shadow-2xl pop-in ${isDark ? "border-white/10 bg-[#222226] shadow-black/50" : "border-zinc-200 bg-white shadow-zinc-300/60"}`}>
      <div className="flex items-start gap-2.5">
        <div className={`rounded-xl p-2 ${isDark ? "bg-white/5 text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
          <HugeiconsIcon icon={ChatSparkIcon} size={18} />
        </div>
        <div>
          <div className={`text-xs font-medium ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
            Tools & integrations
          </div>
          <p className={`mt-0.5 text-[10px] leading-4 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
            Lumi chooses from connected tools when your request needs them.
          </p>
        </div>
      </div>
      <div className="mt-3 max-h-64 space-y-1 overflow-auto debug-scroll">
        {integrations.length === 0 ? (
          <p className={`rounded-xl p-3 text-[11px] ${isDark ? "bg-white/5 text-zinc-500" : "bg-zinc-50 text-zinc-500"}`}>
            No optional integrations are currently enabled.
          </p>
        ) : (
          integrations.map((integration) => (
            <div key={integration.name} className={`rounded-xl px-2.5 py-2 ${isDark ? "hover:bg-white/5" : "hover:bg-zinc-50"}`}>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className={`text-[11px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>
                  {integration.name}
                </span>
              </div>
              <p className={`ml-3.5 mt-0.5 line-clamp-2 text-[9px] leading-4 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                {integration.description}
              </p>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={onOpenConnections}
        className={`mt-3 w-full rounded-xl border py-2 text-[11px] font-medium ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}
      >
        Manage connections
      </button>
    </div>
  );
}

function MessageRow({
  message,
  isDark,
  streaming = false,
}: {
  message: ChatMessage;
  isDark: boolean;
  streaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (message.role === "system") return null;
  const user = message.role === "user";
  return (
    <article className={`group flex gap-3 fade-in ${user ? "justify-end" : "justify-start"}`}>
      {!user && <LumiMark size={28} />}
      <div className={`min-w-0 ${user ? "max-w-[78%]" : "max-w-[calc(100%-42px)] flex-1"}`}>
        {message.imageUrls && message.imageUrls.length > 0 && (
          <div className={`mb-2 flex flex-wrap gap-2 ${user ? "justify-end" : "justify-start"}`}>
            {message.imageUrls.map((url, index) => (
              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/10">
                <img src={url} alt="Chat attachment" className="max-h-56 max-w-72 object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className={user ? `rounded-[20px] px-4 py-2.5 text-[13px] leading-6 ${isDark ? "bg-white/10 text-zinc-100" : "bg-zinc-100 text-zinc-900"}` : `text-[13px] leading-6 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
          {message.content ? <MarkdownContent text={message.content} isDark={isDark} /> : null}
          {streaming && <span className="ml-1 inline-block h-3.5 w-1 animate-pulse rounded-full bg-current align-middle opacity-50" />}
        </div>
        {!user && !streaming && (
          <div className="mt-1 flex h-6 items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(message.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
              className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] ${isDark ? "text-zinc-600 hover:bg-white/5 hover:text-zinc-300" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"}`}
            >
              <HugeiconsIcon icon={Copy01Icon} size={12} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function ThinkingDots({ isDark, compact = false }: { isDark: boolean; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center ${compact ? "gap-1" : "gap-1.5"}`} aria-label="Lumi is working">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`rounded-full live-dot ${compact ? "h-1 w-1" : "h-1.5 w-1.5"} ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`}
          style={{ animationDelay: `${index * 180}ms` }}
        />
      ))}
    </span>
  );
}

function MarkdownContent({ text, isDark }: { text: string; isDark: boolean }) {
  const parts = text.split(/```([^\n`]*)\n?([\s\S]*?)```/g);
  const nodes: ReactNode[] = [];
  for (let index = 0; index < parts.length; index += 3) {
    if (parts[index]) {
      nodes.push(<MarkdownText key={`text-${index}`} text={parts[index]} isDark={isDark} />);
    }
    if (index + 2 < parts.length) {
      nodes.push(
        <CodeBlock
          key={`code-${index}`}
          language={parts[index + 1]?.trim() || "code"}
          code={parts[index + 2]?.replace(/\n$/, "") ?? ""}
          isDark={isDark}
        />,
      );
    }
  }
  return <>{nodes}</>;
}

function MarkdownText({ text, isDark }: { text: string; isDark: boolean }) {
  const lines = text.replace(/^\n+|\n+$/g, "").split("\n");
  const output: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      const tableLines = [line];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const rows = tableLines.map((row) => row.replace(/^\s*\||\|\s*$/g, "").split("|").map((cell) => cell.trim()));
      output.push(
        <div key={`table-${index}`} className="my-3 overflow-x-auto">
          <table className={`w-full border-collapse text-left text-[11px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            <thead>
              <tr>{rows[0]?.map((cell, cellIndex) => <th key={cellIndex} className={`border px-2 py-1.5 font-medium ${isDark ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50"}`}>{renderInline(cell, isDark)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className={`border px-2 py-1.5 align-top ${isDark ? "border-white/10" : "border-zinc-200"}`}>{renderInline(cell, isDark)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      output.push(
        <div key={`heading-${index}`} className={`${output.length ? "mt-4" : ""} mb-1 font-semibold ${level === 1 ? "text-base" : level === 2 ? "text-sm" : "text-[13px]"}`}>
          {renderInline(heading[2] ?? "", isDark)}
        </div>,
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*] ?\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*] ?\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*] ?\s+/, ""));
        index += 1;
      }
      output.push(<ul key={`ul-${index}`} className="my-2 list-disc space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, isDark)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      output.push(<ol key={`ol-${index}`} className="my-2 list-decimal space-y-1 pl-5">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, isDark)}</li>)}</ol>);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(<blockquote key={`quote-${index}`} className={`my-2 border-l-2 pl-3 ${isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-300 text-zinc-600"}`}>{quote.map((item, itemIndex) => <Fragment key={itemIndex}>{renderInline(item, isDark)}{itemIndex < quote.length - 1 && <br />}</Fragment>)}</blockquote>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,3})\s+/.test(lines[index] ?? "") &&
      !/^\s*[-*] ?\s+/.test(lines[index] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[index] ?? "") &&
      !/^\s*>\s?/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    output.push(
      <p key={`p-${index}`} className={`${output.length ? "mt-2" : ""} whitespace-pre-wrap`}>
        {paragraph.map((item, itemIndex) => (
          <Fragment key={itemIndex}>
            {renderInline(item, isDark)}
            {itemIndex < paragraph.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{output}</>;
}

function renderInline(text: string, isDark: boolean): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+)/g;
  return text.split(tokenPattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className={`rounded px-1 py-0.5 text-[0.9em] ${isDark ? "bg-white/8 text-zinc-100" : "bg-zinc-100 text-zinc-900"}`}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-sky-500 underline decoration-sky-500/30 underline-offset-2 hover:decoration-sky-500">{link[1]}</a>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={index} href={part} target="_blank" rel="noreferrer" className="text-sky-500 underline decoration-sky-500/30 underline-offset-2 hover:decoration-sky-500">{part}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function CodeBlock({
  language,
  code,
  isDark,
}: {
  language: string;
  code: string;
  isDark: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`my-3 overflow-hidden rounded-xl border ${isDark ? "border-white/10 bg-black/35" : "border-zinc-200 bg-zinc-950"}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[9px] text-zinc-500">
        <span className="mono">{language}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-200"
        >
          <HugeiconsIcon icon={Copy01Icon} size={11} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-5 text-zinc-200 debug-scroll"><code>{code}</code></pre>
    </div>
  );
}

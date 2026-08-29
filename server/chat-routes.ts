import { Router } from "express";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import { broadcast } from "./broadcast.js";
import { convex } from "./convex-client.js";
import { handleUserMessage } from "./interaction-agent.js";
import { listEnabledIntegrations } from "./integrations/registry.js";
import { getRuntimeConfig } from "./runtime-config.js";

const DESKTOP_PREFIX = "desktop:";
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES = 200;

const imageInput = z.object({
  storageId: z.string().min(1).max(180),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

const sendInput = z
  .object({
    conversationId: z.string().min(1).max(160),
    content: z.string().max(100_000).default(""),
    images: z.array(imageInput).max(4).default([]),
  })
  .refine((value) => value.content.trim().length > 0 || value.images.length > 0, {
    message: "A message or image is required",
  });

function cleanPreview(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function titleFromMessages(
  messages: Array<{ role: string; content: string }>,
): string {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  return firstUserMessage ? cleanPreview(firstUserMessage.content, 54) : "New chat";
}

async function messagesWithImageUrls(conversationId: string) {
  const messages = await convex.query(api.messages.recent, {
    conversationId,
    limit: MAX_MESSAGES,
  });
  return await Promise.all(
    messages.map(async (message) => ({
      ...message,
      imageUrls: (
        await Promise.all(
          (message.imageStorageIds ?? []).map((storageId) =>
            convex.query(api.messages.getStorageUrl, { storageId }).catch(() => null),
          ),
        )
      ).filter((url): url is string => Boolean(url)),
    })),
  );
}

export function createChatRouter(): Router {
  const router = Router();

  router.get("/conversations", async (_request, response) => {
    try {
      const rows = (await convex.query(api.conversations.list, {}))
        .filter((conversation) => conversation.conversationId.startsWith(DESKTOP_PREFIX))
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
        .slice(0, MAX_CONVERSATIONS);
      const conversations = await Promise.all(
        rows.map(async (conversation) => {
          const recent = await convex.query(api.messages.recent, {
            conversationId: conversation.conversationId,
            limit: MAX_MESSAGES,
          });
          const latest = [...recent]
            .reverse()
            .find((message) => message.role !== "system" && message.content.trim().length > 0);
          return {
            conversationId: conversation.conversationId,
            title: conversation.title?.trim() || titleFromMessages(recent),
            preview: latest ? cleanPreview(latest.content, 88) : "",
            messageCount: conversation.messageCount,
            lastActivityAt: conversation.lastActivityAt,
          };
        }),
      );
      response.setHeader("Cache-Control", "no-store");
      response.json({ conversations });
    } catch (error) {
      console.error("[chat] conversation list failed", error);
      response.status(500).json({ error: "Conversation history is unavailable" });
    }
  });

  router.get("/messages", async (request, response) => {
    const conversationId = String(request.query.conversationId ?? "");
    if (!conversationId.startsWith(DESKTOP_PREFIX) || conversationId.length > 160) {
      response.status(400).json({ error: "Invalid desktop conversation" });
      return;
    }
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json({ messages: await messagesWithImageUrls(conversationId) });
    } catch (error) {
      console.error("[chat] message history failed", error);
      response.status(500).json({ error: "Message history is unavailable" });
    }
  });

  router.get("/capabilities", async (_request, response) => {
    try {
      const [runtime, integrations] = await Promise.all([
        getRuntimeConfig(),
        listEnabledIntegrations(),
      ]);
      response.setHeader("Cache-Control", "no-store");
      response.json({
        runtime,
        integrations: integrations.map(({ name, description }) => ({ name, description })),
      });
    } catch (error) {
      console.error("[chat] capabilities failed", error);
      response.status(500).json({ error: "Connected tools are unavailable" });
    }
  });

  router.post("/upload-url", async (_request, response) => {
    try {
      const uploadUrl = await convex.mutation(api.messages.generateUploadUrl, {});
      response.json({ uploadUrl });
    } catch (error) {
      console.error("[chat] upload URL failed", error);
      response.status(500).json({ error: "Image upload is unavailable" });
    }
  });

  router.post("/", async (request, response) => {
    const parsed = sendInput.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid chat message" });
      return;
    }

    const { conversationId, content, images } = parsed.data;
    if (!conversationId.startsWith(DESKTOP_PREFIX)) {
      response.status(400).json({ error: "Desktop chats must use a desktop conversation" });
      return;
    }

    broadcast("assistant_status", { conversationId, state: "thinking" });
    try {
      const reply = await handleUserMessage({
        conversationId,
        content: content.trim(),
        images,
        persistAssistantReply: true,
        onThinking: (chunk) => {
          if (chunk) broadcast("assistant_delta", { conversationId, content: chunk });
        },
      });
      response.json({ conversationId, reply });
    } catch (error) {
      console.error("[chat] turn failed", error);
      response.status(500).json({ error: "Lumi couldn't complete that message" });
    } finally {
      broadcast("assistant_status", { conversationId, state: "idle" });
    }
  });

  return router;
}

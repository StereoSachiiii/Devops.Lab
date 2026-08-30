import type { FastifyInstance } from "fastify";
import { requireEnv } from "@devops/observability";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

interface ChatRequest {
  Body: {
    messages: ChatMessage[];
    challengeId?: string;
    challengeTitle?: string;
    challengeDescription?: string;
  };
}

export async function assistantRoutes(fastify: FastifyInstance) {
  const apiKey = requireEnv("GEMINI_API_KEY");

  // Initialize Gemini if key exists
  const ai = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  fastify.post<ChatRequest>("/assistant/chat", async (req, reply) => {
    if (!ai) {
      return reply.code(500).send({
        error: "AI Assistant is not configured. GEMINI_API_KEY is missing on the server.",
      });
    }

    const body = req.body as any;
    let messages = body?.messages;
    if (!messages && typeof body?.message === "string") {
      messages = [{ role: "user", content: body.message }];
    }

    const { challengeTitle, challengeDescription } = body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({ error: "messages array or message string is required" });
    }

    try {
      const model = ai.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: `You are DevOps.lab AI Mentor, an expert DevOps engineer who assists students working on practical cloud and infrastructure challenges.
Your goal is to guide students to the solution using educational, progressive hints. 
RULES:
1. NEVER output the full solution script or full config file immediately.
2. Give guidance, explain *why* errors occur, and provide small, precise snippets to point them in the right direction.
3. Keep answers concise, highly structured, and use Markdown for formatting and code.
4. If a challenge context is provided below, tailor your advice specifically to that scenario.
${challengeTitle ? `Current Challenge: "${challengeTitle}"` : ""}
${challengeDescription ? `Challenge Goal: "${challengeDescription}"` : ""}`,
      });

      // Format history for Gemini API (user -> user, model -> model/assistant)
      const chatHistory = messages.slice(0, -1).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const latestMessage = messages[messages.length - 1]?.content || "";

      const chat = model.startChat({
        history: chatHistory,
      });

      const result = await chat.sendMessage(latestMessage);
      const text = result.response.text();

      return reply.send({ content: text });
    } catch (err) {
      fastify.log.error({ err }, "Gemini API execution failed");
      return reply.code(500).send({ error: "Failed to generate response from AI Assistant" });
    }
  });
}

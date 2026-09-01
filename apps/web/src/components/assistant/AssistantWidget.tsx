"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Sparkles, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

interface Message {
  role: "user" | "model";
  content: string;
}

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "Hi! I'm your DevOps Mentor. Stuck on a challenge, need help understanding Docker runtimes, or have an error? Ask me anything!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const chatHistory = [...messages, userMessage];
      const res = await apiClient.post<{ content: string }>("/api/assistant/chat", {
        messages: chatHistory,
      });

      setMessages((prev) => [...prev, { role: "model", content: res.content }]);
    } catch (err: any) {
      setError(err?.message || "Failed to connect to assistant. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-inter">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="mb-4 w-[360px] sm:w-[400px] h-[500px] bg-primary text-primary-foreground border border-zinc-200 shadow-2xl rounded-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-black text-foreground px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-zinc-800 rounded-lg">
                  <Sparkles size={16} className="text-foreground" />
                </div>
                <span className="font-extrabold font-outfit text-lg tracking-tight">
                  DevOps Mentor
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-50">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm font-light ${
                      msg.role === "user"
                        ? "bg-black text-foreground rounded-tr-none"
                        : "bg-primary text-primary-foreground text-zinc-900 border border-zinc-200 rounded-tl-none"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-primary text-primary-foreground border border-zinc-200 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm">
                    <div className="flex space-x-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-zinc-150 p-4 bg-primary text-primary-foreground flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your mentor a question..."
                className="flex-1 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-black hover:bg-zinc-800 disabled:bg-zinc-200 text-foreground rounded-xl p-2.5 transition-colors shadow-sm disabled:shadow-none"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bubble Toggle Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black text-foreground hover:bg-zinc-800 p-4 rounded-full shadow-2xl flex items-center justify-center border border-zinc-800 cursor-pointer"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </motion.button>
    </div>
  );
}

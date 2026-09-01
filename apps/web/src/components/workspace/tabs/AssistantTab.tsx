import { Send } from "lucide-react";

export function AssistantTab({
  chatMessages,
  chatInput,
  setChatInput,
  handleSendChat,
  isChatLoading,
  chatEndRef,
}: {
  chatMessages: { role: "user" | "assistant"; content: string }[];
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (msg: string) => void;
  isChatLoading: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex-1 flex flex-col border border-panel-border rounded-[10px] overflow-hidden min-h-[280px] bg-bg">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`px-3 py-2 rounded-[8px] max-w-[85%] font-mono text-[11px] leading-[1.5] border ${
              msg.role === "user"
                ? "self-end bg-panel-2 border-panel-border text-panel-muted"
                : "self-start bg-panel border-teal/25 text-teal"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {isChatLoading && (
          <div className="self-start font-mono text-[11px] text-panel-muted-dim">
            <span className="animate-[dotBlink_1s_infinite]">Assistant is typing...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-2.5 border-t border-panel-border bg-panel flex flex-col gap-2">
        {/* Contextual chips */}
        {chatMessages.length === 1 && (
          <div className="flex gap-1.5 flex-wrap mb-1">
            {["Explain this error", "What's next?", "Give me a hint"].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendChat(chip)}
                className="bg-panel-2 border border-panel-border text-panel-muted px-2.5 py-1 rounded-[5px] text-[10.5px] font-mono cursor-pointer transition-colors duration-200 hover:text-teal hover:border-teal/40"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendChat(chatInput);
            }}
            placeholder="Ask about the challenge..."
            className="flex-1 bg-bg border border-panel-border rounded-[6px] px-2.5 py-2 text-panel-text font-mono text-[11px] outline-none focus:border-teal/40 transition-colors"
          />
          <button
            onClick={() => handleSendChat(chatInput)}
            disabled={!chatInput.trim() || isChatLoading}
            className={`border-none rounded-[6px] px-3 flex items-center justify-center transition-colors duration-200 ${
              chatInput.trim() && !isChatLoading
                ? "bg-teal text-bg cursor-pointer font-bold"
                : "bg-panel-2 text-panel-muted-dim cursor-not-allowed"
            }`}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

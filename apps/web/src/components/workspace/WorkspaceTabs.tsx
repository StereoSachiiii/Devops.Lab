import { DescriptionTab } from "./tabs/DescriptionTab";
import { HintsTab } from "./tabs/HintsTab";
import { EditorialTab } from "./tabs/EditorialTab";
import { ConfigTab } from "./tabs/ConfigTab";
import { AssistantTab } from "./tabs/AssistantTab";
import { DiscussionTab } from "@/components/challenge/DiscussionTab";

import { HistoryLog } from "@/components/dashboard/HistoryLog";
import { SegmentTabs } from "@/components/ui/SegmentTabs";

const WORKSPACE_TABS = [
  { id: "description", label: "description" },
  { id: "hints", label: "hints" },
  { id: "editorial", label: "editorial" },
  { id: "discussion", label: "discussion" },
  { id: "config", label: "config" },
  { id: "ask-ai", label: "ask ai" },
  { id: "history", label: "history" },
] as const;

export function WorkspaceTabs({
  activeTab,
  setActiveTab,
  challenge,
  hintsRevealed,
  setHintsRevealed,
  chatMessages,
  chatInput,
  setChatInput,
  handleSendChat,
  isChatLoading,
  chatEndRef,
  history,
}: {
  activeTab: "description" | "hints" | "editorial" | "discussion" | "config" | "ask-ai" | "history";
  setActiveTab: React.Dispatch<
    React.SetStateAction<"description" | "hints" | "editorial" | "discussion" | "config" | "ask-ai" | "history">
  >;
  challenge: any;
  hintsRevealed: boolean[];
  setHintsRevealed: React.Dispatch<React.SetStateAction<boolean[]>>;
  chatMessages: { role: "user" | "assistant"; content: string }[];
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (msg: string) => void;
  isChatLoading: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  history?: any[];
}) {
  return (
    <>
      <SegmentTabs
        options={WORKSPACE_TABS}
        activeTab={activeTab}
        onChange={setActiveTab as any}
        className="mb-4"
      />

      {activeTab === "description" && <DescriptionTab challenge={challenge} />}
      {activeTab === "hints" && (
        <HintsTab hintsRevealed={hintsRevealed} setHintsRevealed={setHintsRevealed} />
      )}
      {activeTab === "editorial" && <EditorialTab challengeId={challenge?.id} />}
      {activeTab === "discussion" && <DiscussionTab challengeId={challenge?.id} />}
      {activeTab === "config" && <ConfigTab challenge={challenge} />}
      {activeTab === "ask-ai" && (
        <AssistantTab
          chatMessages={chatMessages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          handleSendChat={handleSendChat}
          isChatLoading={isChatLoading}
          chatEndRef={chatEndRef}
        />
      )}
      {activeTab === "history" && history && (
        <div className="bg-panel border border-panel-border rounded-[10px] p-5 h-[calc(100vh-220px)] overflow-y-auto">
          <HistoryLog items={history} title="Test History" />
        </div>
      )}
    </>
  );
}

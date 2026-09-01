"use client";

import { useEffect, useState } from "react";
import { Bookmark, Plus, Check, X, FolderPlus, Lock, Globe, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

interface CustomList {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  items: Array<{ challengeId: string }>;
}

interface SaveToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  challengeId: string;
  challengeTitle?: string;
}

export function SaveToListModal({ isOpen, onClose, challengeId, challengeTitle }: SaveToListModalProps) {
  const [lists, setLists] = useState<CustomList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListPublic, setNewListPublic] = useState(false);
  const [savingListId, setSavingListId] = useState<string | null>(null);

  const fetchLists = async () => {
    try {
      const res = await apiClient.get<{ lists: CustomList[] }>("/api/lists");
      setLists(res.lists || []);
    } catch (err) {
      console.error("Failed to load custom lists", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLists();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    setCreating(true);
    try {
      const created = await apiClient.post<CustomList>("/api/lists", {
        name: newListName.trim(),
        isPublic: newListPublic,
      });

      // Add the challenge immediately to the new list
      await apiClient.post(`/api/lists/${created.id}/items`, { challengeId });

      setNewListName("");
      setNewListPublic(false);
      await fetchLists();
    } catch (err) {
      console.error("Failed to create list", err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleItem = async (list: CustomList) => {
    const isIncluded = list.items.some((i) => i.challengeId === challengeId);
    setSavingListId(list.id);

    try {
      if (isIncluded) {
        await apiClient.delete(`/api/lists/${list.id}/items/${challengeId}`);
      } else {
        await apiClient.post(`/api/lists/${list.id}/items`, { challengeId });
      }
      await fetchLists();
    } catch (err) {
      console.error("Failed to update list item", err);
    } finally {
      setSavingListId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-panel border border-panel-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-panel-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-center text-teal">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-space font-bold text-panel-text text-sm">Add to Custom List</h3>
              <p className="text-[11px] text-panel-muted truncate max-w-[280px]">
                {challengeTitle || "Save this challenge to a study track"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-panel-muted hover:text-panel-text transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Lists */}
        <div className="p-5 space-y-3 max-h-60 overflow-y-auto">
          {loading ? (
            <div className="py-6 text-center text-panel-muted text-xs font-mono animate-pulse">
              Loading collections...
            </div>
          ) : lists.length === 0 ? (
            <div className="py-6 text-center text-panel-muted space-y-1">
              <FolderPlus className="w-6 h-6 mx-auto opacity-40" />
              <p className="text-xs">No lists created yet.</p>
            </div>
          ) : (
            lists.map((list) => {
              const isIncluded = list.items.some((i) => i.challengeId === challengeId);
              const isProcessing = savingListId === list.id;

              return (
                <div
                  key={list.id}
                  onClick={() => !isProcessing && handleToggleItem(list)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isIncluded
                      ? "bg-teal/10 border-teal/40 text-teal"
                      : "bg-panel-2/40 border-panel-border hover:border-panel-border/80 text-panel-text"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        isIncluded ? "bg-teal border-teal text-black" : "border-panel-muted"
                      }`}
                    >
                      {isIncluded && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-panel-text flex items-center gap-1.5">
                        <span>{list.name}</span>
                        {list.isPublic ? (
                          <Globe className="w-3 h-3 text-panel-muted" />
                        ) : (
                          <Lock className="w-3 h-3 text-panel-muted" />
                        )}
                      </div>
                      <span className="text-[10px] text-panel-muted font-mono">
                        {list.itemCount} challenges
                      </span>
                    </div>
                  </div>

                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal" />}
                </div>
              );
            })
          )}
        </div>

        {/* Create New List Form */}
        <form onSubmit={handleCreateList} className="p-5 border-t border-panel-border bg-panel-2/30 space-y-3">
          <span className="text-xs font-mono font-semibold text-panel-text uppercase tracking-wider block">
            Create New Collection
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. SRE Incident Prep, Blind 75"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-panel border border-panel-border focus:border-teal outline-none text-xs text-panel-text transition-colors"
            />
            <button
              type="submit"
              disabled={creating || !newListName.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{creating ? "Creating..." : "Create & Add"}</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-panel-muted cursor-pointer">
            <input
              type="checkbox"
              checked={newListPublic}
              onChange={(e) => setNewListPublic(e.target.checked)}
              className="rounded border-panel-border text-teal focus:ring-0"
            />
            <span>Make collection public for peer sharing</span>
          </label>
        </form>
      </div>
    </div>
  );
}

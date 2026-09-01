"use client";

import { useEffect, useState } from "react";
import { MessageSquare, ThumbsUp, ThumbsDown, Send, CornerDownRight, Pin, Trash2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

interface CommentAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  role: string;
}

interface CommentItem {
  id: string;
  challengeId: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: CommentAuthor;
  score: number;
  userVote: number;
  replyCount?: number;
  replies?: CommentItem[];
}

interface DiscussionTabProps {
  challengeId: string;
}

export function DiscussionTab({ challengeId }: DiscussionTabProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const fetchComments = async () => {
    try {
      const res = await apiClient.get<{ comments: CommentItem[] }>(`/api/challenges/${challengeId}/comments`);
      setComments(res.comments || []);
    } catch (err) {
      console.error("Failed to load comments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [challengeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePostComment = async (parentId?: string) => {
    const text = parentId ? replyContent : newComment;
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      await apiClient.post(`/api/challenges/${challengeId}/comments`, {
        content: text.trim(),
        parentId,
      });

      if (parentId) {
        setReplyContent("");
        setReplyingToId(null);
      } else {
        setNewComment("");
      }
      await fetchComments();
    } catch (err) {
      console.error("Failed to post comment", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (commentId: string, currentVote: number, targetVote: number) => {
    const nextVote = currentVote === targetVote ? 0 : targetVote;
    try {
      const res = await apiClient.post<{ score: number; userVote: number }>(`/api/comments/${commentId}/vote`, {
        vote: nextVote,
      });

      // Update state locally
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return { ...c, score: res.score, userVote: res.userVote };
          }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map((r) =>
                r.id === commentId ? { ...r, score: res.score, userVote: res.userVote } : r
              ),
            };
          }
          return c;
        })
      );
    } catch (err) {
      console.error("Failed to vote", err);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      await apiClient.delete(`/api/comments/${commentId}`);
      await fetchComments();
    } catch (err) {
      console.error("Failed to delete comment", err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden text-sm">
      {/* Discussion Header */}
      <div className="p-4 border-b border-panel-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal" />
          <h3 className="font-space font-bold text-panel-text">Community Discussion</h3>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-panel-2 border border-panel-border text-panel-muted">
            {comments.length}
          </span>
        </div>
      </div>

      {/* Post Top-Level Comment */}
      <div className="p-4 border-b border-panel-border bg-panel-2/30">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Share your troubleshooting insight, solution tips, or ask a question..."
          rows={2}
          className="w-full p-2.5 rounded-lg bg-panel border border-panel-border focus:border-teal outline-none text-xs text-panel-text resize-none transition-colors"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => handlePostComment()}
            disabled={submitting || !newComment.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>{submitting ? "Posting..." : "Post Comment"}</span>
          </button>
        </div>
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="py-8 text-center text-panel-muted font-mono text-xs animate-pulse">
            Loading discussions...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center text-panel-muted">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No comments yet. Start the conversation!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              {/* Top-Level Card */}
              <div className="p-3.5 rounded-xl bg-panel-2/40 border border-panel-border/70 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-teal/20 border border-teal/40 text-teal flex items-center justify-center font-bold text-[10px]">
                      {comment.author.name?.slice(0, 1) || comment.author.username?.slice(0, 1) || "U"}
                    </div>
                    <span className="font-semibold text-panel-text">{comment.author.name || `@${comment.author.username}`}</span>
                    {comment.isPinned && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber/10 text-amber border border-amber/20 font-mono">
                        <Pin className="w-2.5 h-2.5" /> Pinned
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-panel-muted font-mono">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-xs text-panel-text whitespace-pre-wrap leading-relaxed">{comment.content}</p>

                {/* Actions: Vote, Reply, Delete */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-panel-border/40">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center bg-panel rounded-lg border border-panel-border overflow-hidden">
                      <button
                        onClick={() => handleVote(comment.id, comment.userVote, 1)}
                        className={`p-1 hover:text-teal transition-colors cursor-pointer ${
                          comment.userVote === 1 ? "text-teal bg-teal/10" : "text-panel-muted"
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <span className="px-1.5 text-[11px] font-mono font-bold text-panel-text">
                        {comment.score}
                      </span>
                      <button
                        onClick={() => handleVote(comment.id, comment.userVote, -1)}
                        className={`p-1 hover:text-rose-400 transition-colors cursor-pointer ${
                          comment.userVote === -1 ? "text-rose-400 bg-rose-500/10" : "text-panel-muted"
                        }`}
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-panel-muted hover:text-panel-text transition-colors cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>Reply</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-panel-muted hover:text-rose-400 transition-colors p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Reply Box */}
              {replyingToId === comment.id && (
                <div className="ml-6 p-3 rounded-lg bg-panel-2/70 border border-panel-border space-y-2">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={`Reply to ${comment.author.name || comment.author.username}...`}
                    rows={2}
                    className="w-full p-2 rounded bg-panel border border-panel-border focus:border-teal outline-none text-xs text-panel-text resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setReplyingToId(null);
                        setReplyContent("");
                      }}
                      className="px-2.5 py-1 rounded bg-panel border border-panel-border text-panel-muted text-[11px] hover:text-panel-text cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handlePostComment(comment.id)}
                      disabled={submitting || !replyContent.trim()}
                      className="px-2.5 py-1 rounded bg-teal text-black font-semibold text-[11px] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? "Replying..." : "Reply"}
                    </button>
                  </div>
                </div>
              )}

              {/* Nested Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-6 space-y-2 border-l-2 border-panel-border/60 pl-3">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="p-3 rounded-lg bg-panel-2/20 border border-panel-border/40 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-panel-text text-[11px]">{reply.author.name || `@${reply.author.username}`}</span>
                        </div>
                        <span className="text-[10px] text-panel-muted font-mono">
                          {new Date(reply.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-panel-text whitespace-pre-wrap">{reply.content}</p>
                      <div className="flex items-center justify-between pt-1">
                        <div className="inline-flex items-center gap-1 bg-panel rounded px-1.5 py-0.5 border border-panel-border text-[10px] font-mono">
                          <ThumbsUp className="w-2.5 h-2.5 text-teal" />
                          <span>{reply.score}</span>
                        </div>
                        <button
                          onClick={() => handleDelete(reply.id)}
                          className="text-panel-muted hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

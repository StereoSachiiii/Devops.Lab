import { CheckCircle2, Circle, MoreVertical, TerminalSquare, Plus, Mail } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  orgRole: string;
  status: string;
  currentSandbox: string;
  score: number;
}

export function TeamMembersList({ myRole }: { myRole?: string }) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const canInvite = myRole === "OWNER" || myRole === "ADMIN";

  const { data: members, error, isLoading } = useSWR<TeamMember[]>(
    "/api/orgs/me/members",
    () => apiClient.get<TeamMember[]>("/api/orgs/me/members")
  );

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsSubmitting(true);
    setInviteMessage("");

    try {
      await apiClient.post("/api/orgs/me/invites", {
        email: inviteEmail,
        orgRole: inviteRole,
      });
      setInviteMessage("Invitation sent successfully!");
      setInviteEmail("");
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteMessage("");
      }, 2000);
    } catch (err) {
      setInviteMessage("Failed to send invitation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-panel border border-panel-border rounded-xl overflow-hidden mb-8 relative">
      <div className="px-6 py-5 border-b border-panel-border flex items-center justify-between bg-panel-2">
        <h2 className="font-space font-semibold text-panel-text text-[18px]">Team Roster</h2>
        {canInvite && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="text-[13px] font-medium bg-amber/10 text-amber px-3 py-1.5 rounded-lg border border-amber/20 hover:bg-amber/20 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Invite Members
          </button>
        )}
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-panel-border rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-[popIn_200ms_ease-out]">
            <div className="px-6 py-5 border-b border-panel-border bg-panel-2 flex items-center justify-between">
              <h3 className="font-space font-semibold text-panel-text text-[17px]">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-panel-muted hover:text-panel-text cursor-pointer text-[18px] font-mono border-none bg-transparent"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleInviteSubmit} className="p-6">
              <div className="mb-4">
                <label className="block text-[13px] font-medium text-panel-muted mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-panel-muted-dim" />
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="engineer@company.com"
                    className="w-full bg-panel-2 border border-panel-border rounded-lg pl-9 pr-4 py-2.5 text-[14px] text-panel-text focus:outline-none focus:border-teal transition-colors"
                  />
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-[13px] font-medium text-panel-muted mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-panel-2 border border-panel-border rounded-lg px-3 py-2.5 text-[14px] text-panel-text focus:outline-none focus:border-teal transition-colors"
                >
                  <option value="MEMBER">Member (Learner)</option>
                  <option value="ADMIN">Admin (Manager)</option>
                </select>
              </div>
              {inviteMessage && (
                <div className={`mb-4 p-3 rounded-lg text-[13px] font-medium text-center ${
                  inviteMessage.includes("success") ? "bg-teal/10 text-teal" : "bg-red-auth/10 text-red-auth"
                }`}>
                  {inviteMessage}
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-panel-border pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold text-panel-muted hover:text-panel-text border border-panel-border bg-transparent hover:bg-panel-2 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-teal text-bg hover:bg-teal/90 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-panel-border text-[13px] text-panel-muted font-medium bg-panel/50">
              <th className="py-3 px-6 font-medium">Engineer</th>
              <th className="py-3 px-6 font-medium">Role</th>
              <th className="py-3 px-6 font-medium">Current Sandbox</th>
              <th className="py-3 px-6 font-medium">Skill Score</th>
              <th className="py-3 px-6 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[14px] text-panel-muted font-mono">
                  Loading members roster...
                </td>
              </tr>
            ) : error || !members ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[14px] text-red-auth font-mono">
                  Failed to load team roster.
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[14px] text-panel-muted font-mono">
                  No active engineers in organization.
                </td>
              </tr>
            ) : (
              members.map((member, i) => (
                <tr key={member.id || i} className="border-b border-panel-border last:border-0 hover:bg-panel-2/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-panel-2 border border-panel-border flex items-center justify-center font-space font-bold text-teal text-[13px]">
                        {member.name ? member.name.charAt(0) : "U"}
                      </div>
                      <div>
                        <div className="text-[14.5px] font-medium text-panel-text">{member.name || "Unknown User"}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {member.status === "Active" ? (
                            <CheckCircle2 className="w-3 h-3 text-teal" />
                          ) : (
                            <Circle className="w-3 h-3 text-panel-muted" />
                          )}
                          <span className="text-[12px] text-panel-muted">{member.status}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-[14px] text-panel-muted">{member.role} ({member.orgRole})</td>
                  <td className="py-4 px-6">
                    {member.currentSandbox && member.currentSandbox !== "-" ? (
                      <div className="flex items-center gap-2">
                        <TerminalSquare className="w-4 h-4 text-amber" />
                        <span className="text-[14px] text-panel-text">{member.currentSandbox}</span>
                      </div>
                    ) : (
                      <span className="text-[14px] text-panel-muted">-</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-[14px] font-mono text-panel-text">{member.score}</td>
                  <td className="py-4 px-6 text-right">
                    <button className="p-1.5 text-panel-muted hover:text-panel-text hover:bg-panel-2 rounded-md transition-colors cursor-pointer border-none bg-transparent">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

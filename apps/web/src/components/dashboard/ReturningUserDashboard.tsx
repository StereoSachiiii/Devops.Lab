import Link from "next/link";
import { DashboardData } from "@/lib/api-types";
import { CategoryIcon } from "./CategoryIcon";
import { CountUp } from "@/components/landing/StatsRow";
import { CheckCircle2, ChevronRight, Zap, Target, Users, Layout } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SocialActivityFeed } from "./SocialActivityFeed";

export function ReturningUserDashboard({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-12">
      {/* Social Feed */}
      <section>
        <SocialActivityFeed />
      </section>

      {/* 3.1 Continue learning */}
      {data.inProgress.length > 0 && (
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-space text-panel-text font-medium">Continue learning</h2>
            {data.inProgress.length > 4 && (
              <Link
                href="/profile"
                className="text-sm text-panel-muted hover:text-amber transition-colors flex items-center"
              >
                View all in progress <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            )}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {data.inProgress.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="min-w-[280px] sm:min-w-[320px] max-w-[320px] snap-start bg-panel border border-panel-border rounded-xl p-5 flex flex-col hover:border-amber transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CategoryIcon category={item.category} size={16} className="text-panel-muted" />
                    <span className="text-xs font-mono uppercase text-panel-muted tracking-wider">
                      {item.type}
                    </span>
                  </div>
                </div>
                <h3 className="font-space font-medium text-panel-text mb-4 line-clamp-1">
                  {item.title}
                </h3>

                <div className="mt-auto">
                  <div className="flex justify-between text-xs font-mono text-panel-muted mb-2">
                    <span>Progress</span>
                    <span>
                      {item.completed} of {item.total} complete
                    </span>
                  </div>
                  <div className="h-1.5 bg-panel-2 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-amber rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(5, (item.completed / item.total) * 100)}%` }}
                    />
                  </div>
                  <Link
                    href={
                      item.type === "roadmap" ? `/roadmaps/${item.id}` : `/challenges/${item.id}`
                    }
                    className="inline-flex items-center text-sm font-mono text-amber hover:text-amber/80 transition-colors"
                  >
                    Resume{" "}
                    <span className="ml-1 transform transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-12">
          {/* 3.4 Recommended next */}
          {data.recommendedNext && (
            <section>
              <h2 className="text-xl font-space text-panel-text font-medium mb-4">
                Recommended for you
              </h2>
              <Link href={data.recommendedNext.link} className="block group">
                <div className="bg-panel-2 border border-panel-border rounded-xl p-6 relative overflow-hidden hover:border-amber transition-colors">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-panel border border-panel-border flex items-center justify-center shrink-0 shadow-sm">
                      <Target className="w-6 h-6 text-amber" />
                    </div>
                    <div>
                      <h3 className="font-space font-semibold text-panel-text text-lg mb-1 group-hover:text-amber transition-colors">
                        {data.recommendedNext.title}
                      </h3>
                      <p className="text-panel-muted text-sm mb-3">
                        {data.recommendedNext.description}
                      </p>
                      <span className="inline-flex items-center text-xs font-mono text-panel-text bg-panel border border-panel-border px-3 py-1.5 rounded-md group-hover:border-amber/50 transition-colors">
                        Start <ChevronRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {/* 3.2 Today's challenge */}
          <section>
            <h2 className="text-xl font-space text-panel-text font-medium mb-4">Daily Challenge</h2>
            {data.todayChallenge ? (
              <div className="bg-panel border border-panel-border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg border flex items-center justify-center ${data.todayChallenge.completedToday ? "bg-amber/10 border-amber/20" : "bg-panel-2 border-panel-border"}`}
                  >
                    {data.todayChallenge.completedToday ? (
                      <CheckCircle2 className="w-5 h-5 text-amber" />
                    ) : (
                      <Zap className="w-5 h-5 text-amber" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-space font-medium text-panel-text">
                      {data.todayChallenge.title}
                    </h3>
                    <p className="text-panel-muted text-xs font-mono mt-0.5">~15 min</p>
                  </div>
                </div>

                {data.todayChallenge.completedToday ? (
                  <div className="text-sm font-mono text-panel-muted flex items-center bg-panel-2 px-4 py-2 rounded-lg border border-panel-border">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-amber" /> Solved today — back
                    tomorrow
                  </div>
                ) : (
                  <Link
                    href={`/challenges/${data.todayChallenge.id}`}
                    className="bg-amber text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber/90 transition-colors shrink-0"
                  >
                    Solve today's outage →
                  </Link>
                )}
              </div>
            ) : null}
          </section>

          {/* 3.3 Stats strip */}
          <section>
            <h2 className="text-xl font-space text-panel-text font-medium mb-4">Your Progress</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total XP" value={data.stats.xp} fallback="0" />
              <StatCard
                label="Current Streak"
                value={data.stats.streak}
                fallback="0"
                suffix={data.stats.streak === 1 ? " day" : " days"}
              />
              <StatCard label="Roadmaps Done" value={data.stats.roadmapsCompleted} fallback="0" />
              <StatCard label="Badges Earned" value={data.stats.badgesEarned} fallback="0" />
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* 3.7 Team widget */}
          {data.org && (
            <section className="bg-panel border border-panel-border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-panel-muted" />
                <h3 className="font-space font-medium text-panel-text line-clamp-1">
                  {data.org.name}
                </h3>
              </div>
              <p className="text-sm text-panel-muted">
                {data.org.teammateCount} teammate{data.org.teammateCount !== 1 ? "s" : ""} learning
                with you
              </p>
            </section>
          )}

          {/* 3.5 Recent badges */}
          {data.recentBadges.length > 0 && (
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-mono uppercase text-panel-muted tracking-wider">
                  Recent Badges
                </h2>
              </div>
              <div className="flex gap-2 flex-wrap">
                {data.recentBadges.map((badge) => (
                  <div key={badge.id} className="group relative" title={badge.title}>
                    <div className="w-12 h-12 rounded-lg bg-panel-2 border border-panel-border flex items-center justify-center hover:border-amber transition-colors">
                      <span className="text-xl">{badge.icon}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3.6 Recent activity */}
          {data.recentActivity.length > 0 && (
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-mono uppercase text-panel-muted tracking-wider">
                  Recent Activity
                </h2>
              </div>
              <div className="space-y-4">
                {data.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded bg-panel-2 border border-panel-border flex items-center justify-center shrink-0 mt-0.5">
                      <Layout className="w-4 h-4 text-panel-muted" />
                    </div>
                    <div>
                      <p className="text-sm text-panel-text line-clamp-2">{activity.description}</p>
                      <p className="text-xs text-panel-muted mt-1 font-mono">
                        {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  fallback,
  suffix = "",
}: {
  label: string;
  value: number;
  fallback: string;
  suffix?: string;
}) {
  return (
    <div className="bg-panel border border-panel-border rounded-xl p-4 flex flex-col justify-center text-center">
      <div className="font-space font-bold text-2xl text-amber mb-1">
        <CountUp num={value} fallback={fallback} suffix={suffix} />
      </div>
      <div className="text-panel-muted text-xs font-mono uppercase tracking-wider">{label}</div>
    </div>
  );
}

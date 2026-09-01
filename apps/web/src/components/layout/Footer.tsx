import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-panel-border py-10 px-6 bg-bg mt-auto">
      <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-4">
        <div className="font-mono text-[12.5px] text-panel-muted-dim">
          DevOps.lab - where &quot;it works on my machine&quot; gets tested.
        </div>
        <div className="flex gap-[22px]">
          {(
            [
              ["/challenges", "Challenges"],
              ["/roadmaps", "Roadmaps"],
              ["/quizzes", "Quizzes"],
              ["/login", "Sign in"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={label}
              href={href}
              className="text-[13px] text-panel-muted no-underline transition-colors hover:text-panel-text"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

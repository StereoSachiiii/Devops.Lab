import { Button } from "@/components/ui/Button";

export function ContributeCta() {
  return (
    <section className="py-[100px] relative z-10 border-t border-panel-border">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
          
          {/* Left Sub-container: Text */}
          <div className="flex-1 md:pr-10 text-left">
            <div className="font-mono text-[12px] tracking-[0.14em] uppercase text-amber flex items-center gap-[9px] mb-[14px]">
              <span className="w-[6px] h-[6px] rounded-full bg-amber shadow-[0_0_8px_var(--color-amber)] shrink-0" />
              open source
            </div>

            <h2 className="font-heading text-[32px] md:text-[40px] font-bold tracking-[-0.015em] mb-4 text-panel-text leading-tight">
              Fixed a disaster at work today?{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber to-teal">
                Share it.
              </span>
            </h2>

            <p className="text-panel-muted text-[15.5px] leading-[1.6] max-w-[600px] mb-0">
              DevOps.lab is built by the community, for the community. If you just spent 4 hours
              tracing a weird DNS loop or an edge-case permissions bug, anonymize it and turn it into
              a challenge.
            </p>
          </div>

          {/* Right Sub-container: Button */}
          <div className="shrink-0 flex justify-start md:justify-end">
            <Button
              href="https://github.com/your-org/devops-lab-blueprints"
              asExternal
              variant="primary"
              size="lg"
              className="rounded-xl group/btn"
            >
              <svg
                className="w-5 h-5 text-current"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              Submit a blueprint
              <span className="group-hover/btn:translate-x-1 transition-transform ml-1">→</span>
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}


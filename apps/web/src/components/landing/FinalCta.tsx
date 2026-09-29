import { Button } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section className="py-[100px] text-center relative z-10">
      <div className="max-w-[1440px] xl:max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-6 md:px-8 xl:px-12">
        <h2 className="font-heading text-[34px] font-bold tracking-[-0.015em] mb-[14px]">
          Your next outage is a practice run.
        </h2>
        <p className="text-panel-muted mb-7">
          Create an account and get your first sandbox in under a minute.
        </p>
        <Button href="/register" variant="primary" size="lg">
          Create free account
        </Button>
      </div>
    </section>
  );
}


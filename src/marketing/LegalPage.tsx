import { PublicNav } from "./PublicNav";
import { PublicFooter } from "./PublicFooter";

export function LegalPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <PublicNav />
      <main className="mx-auto max-w-[760px] px-5 py-20 md:px-8">
        <h1 className="font-display text-[44px] font-extrabold tracking-[-0.04em]">{title}</h1>
        <p className="mt-6 text-[17px] leading-relaxed text-text-secondary">
          The full {title.toLowerCase()} for AutoSocials is being finalised and will be published here.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

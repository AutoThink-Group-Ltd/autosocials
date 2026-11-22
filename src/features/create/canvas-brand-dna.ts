import type { canvasDna } from "@/lib/brand-dna-creative.server";
type Kit = Awaited<ReturnType<typeof canvasDna>>;
export type CanvasDna = NonNullable<Kit> & {
  headingFamily?: string | undefined;
  bodyFamily?: string | undefined;
};
const loaded = new Map<string, Promise<string>>();
export async function loadCanvasDna(kit: Kit): Promise<CanvasDna | undefined> {
  if (!kit) return undefined;
  async function register(face: NonNullable<Kit>["heading"], role: string) {
    if (!face?.url) return undefined;
    const name = "BrandDNA-" + kit!.id + "-" + role;
    let task = loaded.get(name);
    if (!task) {
      const f = new FontFace(name, "url(" + JSON.stringify(face.url) + ")");
      task = f
        .load()
        .then((font) => {
          document.fonts.add(font);
          return '"' + name + '"';
        })
        .catch(() => {
          loaded.delete(name);
          throw new Error("Could not load the brand font. Retry the export.");
        });
      loaded.set(name, task);
    }
    return task;
  }
  const [headingFamily, bodyFamily] = await Promise.all([
    register(kit.heading, "heading"),
    register(kit.body, "body"),
  ]);
  return { ...kit, headingFamily, bodyFamily };
}

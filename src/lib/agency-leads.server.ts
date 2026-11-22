import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { canManageAgency, type AgencyStaffRole } from "./invites";
import { parseClientSocialProfile } from "./client-social-profiles";
import { publicBrandWebsite, queueAutomaticBrandDiscovery } from "./brand-discovery.server";
import { offerAssetKey, offerDecisionSchema, type leadInputSchema, type OfferAsset, type offerInputSchema } from "./agency-leads";

type Admin = ReturnType<typeof getAdminClient>;
type Sample = { key: string; type: OfferAsset["type"]; title: string; text?: string; paths?: string[]; videoPath?: string };
type Offer = {
  id: string; token: string; title: string; description: string; next_steps: string; agency_name: string; recipient_name: string;
  price_minor: number; currency: string; cadence: string; samples: Sample[]; created_at: string;
  revoked_at: string | null; decision: "accepted" | "declined" | null; decided_at: string | null;
};

// The unpublished migration adds these service-only tables and RPCs.
const leadDb = (admin: Admin) => admin as unknown as import("@supabase/supabase-js").SupabaseClient;
const shareUrl = (token: string) => `https://autosocials.com/agency-offer/${token}`;
const offerFields = "id,title,description,next_steps,agency_name,recipient_name,price_minor,currency,cadence,samples,decision";

async function agency() {
  const user = await requireUser();
  const admin = getAdminClient();
  const [owner, role] = await Promise.all([
    admin.rpc("agency_staff_owner", { _user_id: user.id }),
    admin.rpc("agency_staff_role", { _user_id: user.id }),
  ]);
  if (owner.error || role.error || !owner.data || !canManageAgency(role.data as AgencyStaffRole)) {
    throw new Error("Only agency owners and admins can manage leads and offers.");
  }
  return { user, admin, owner: owner.data };
}

async function ownedLead(id: string) {
  const ctx = await agency();
  const result = await ctx.admin.from("agency_clients").select("id,workspace_id,client_name,client_contact_name")
    .eq("id", id).eq("agency_user_id", ctx.owner).eq("workspace_kind", "lead").eq("status", "active").maybeSingle();
  if (result.error || !result.data) throw new Error("This lead is unavailable.");
  const access = await ctx.admin.rpc("can_access_workspace", { _user_id: ctx.user.id, _workspace_id: result.data.workspace_id });
  if (access.error || !access.data) throw new Error("This lead workspace is unavailable.");
  return { ...ctx, lead: result.data };
}

export async function addLead(input: z.infer<typeof leadInputSchema>) {
  const { user, admin } = await agency();
  const website = publicBrandWebsite(input.website);
  if (input.website && !website) throw new Error("Enter a public HTTPS company website.");
  const profile = input.linkedin ? parseClientSocialProfile(input.linkedin) : null;
  const profileUrl = profile?.url ? new URL(profile.url) : null;
  if (input.linkedin && (!profileUrl || profile?.platform !== "linkedin" || profileUrl.protocol !== "https:" ||
    profileUrl.username || profileUrl.password || profileUrl.port || !/^\/(in|company)\/[^/]+\/?$/i.test(profileUrl.pathname))) {
    throw new Error("Enter a LinkedIn personal profile or company page URL.");
  }
  if (profileUrl && profile) {
    profileUrl.search = "";
    profileUrl.hash = "";
    profile.url = profileUrl.href;
  }
  const { data, error } = await leadDb(admin).rpc("create_agency_lead", {
    _actor: user.id, _lead: input.leadId, _name: input.company || input.contact, _contact: input.contact,
    _website: website, _profiles: profile ? [profile] : [],
  });
  if (error || typeof data !== "string") throw new Error("Could not add this lead. Please try again.");
  queueAutomaticBrandDiscovery(data, user.id);
  return { id: input.leadId, workspaceId: data };
}

export async function listLeads() {
  const { admin, owner } = await agency();
  const { data, error } = await admin.from("agency_clients").select("id,workspace_id,client_name,client_contact_name,social_profiles,workspaces(website)")
    .eq("agency_user_id", owner).eq("workspace_kind", "lead").eq("status", "active").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your leads.");
  return (data ?? []).map((row) => ({
    id: row.id, workspaceId: row.workspace_id, name: row.client_name, contact: row.client_contact_name,
    website: row.workspaces?.website ?? null,
    linkedin: Array.isArray(row.social_profiles) && row.social_profiles.length ? parseClientSocialProfile(String((row.social_profiles[0] as { url?: string })?.url ?? ""))?.url ?? null : null,
  }));
}

function ownedPath(path: string, workspaceId: string) {
  return path.startsWith(workspaceId + "/") && !path.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"));
}

export async function listSamples(leadId: string) {
  const { admin, lead } = await ownedLead(leadId);
  const ws = lead.workspace_id;
  const [files, videos, posts] = await Promise.all([
    admin.from("brand_files").select("id,name,source").eq("workspace_id", ws).in("source", ["social_tile", "linkedin_carousel"]).order("created_at", { ascending: false }),
    admin.from("render_jobs").select("id,version,creative_variants(hook)").eq("workspace_id", ws).eq("status", "done").not("storage_path", "is", null).order("created_at", { ascending: false }),
    admin.from("posts").select("id,caption,created_via,post_media(id)").eq("workspace_id", ws).is("variant_id", null)
      .in("status", ["draft", "scheduled", "published", "partially_published"]).order("created_at", { ascending: false }),
  ]);
  if (files.error || videos.error || posts.error) throw new Error("Could not load the lead’s samples.");
  const samples: (OfferAsset & { title: string })[] = [
    ...files.data.map((file) => ({ type: file.source === "social_tile" ? "tile" as const : "carousel" as const, id: file.id, title: file.name.replace(/\.(png|jpg|jpeg|json)$/i, "") })),
    ...videos.data.map((video) => ({ type: "video" as const, id: video.id, title: `${video.creative_variants?.hook || "Video"}${video.version ? ` · Version ${video.version}` : ""}` })),
    ...posts.data.filter((post) => post.caption.trim() && !post.post_media.length && !post.created_via?.startsWith("written_post:"))
      .map((post) => ({ type: "written" as const, id: post.id, title: post.caption.trim().slice(0, 100) })),
  ];
  return samples;
}

async function snapshotSample(admin: Admin, ws: string, asset: OfferAsset, captions: Record<string, { caption: string }>): Promise<Sample> {
  const base = { key: offerAssetKey(asset), type: asset.type };
  if (asset.type === "carousel") {
    const snapshot = await (await import("./linkedin-carousel.server")).carouselOfferSample(admin, { workspace_id: ws, id: asset.id });
    return { ...base, ...snapshot };
  }
  if (asset.type === "tile") {
    const { data, error } = await admin.from("brand_files").select("name,storage_path,mime")
      .eq("workspace_id", ws).eq("id", asset.id).eq("source", "social_tile").maybeSingle();
    if (error || !data || !ownedPath(data.storage_path, ws) || !["image/png", "image/jpeg"].includes(data.mime ?? "")) throw new Error("A selected tile is unavailable.");
    const text = captions[asset.id]?.caption;
    return { ...base, title: data.name.replace(/\.(png|jpg|jpeg)$/i, ""), paths: [data.storage_path], ...(text ? { text } : {}) };
  }
  if (asset.type === "video") {
    const { data, error } = await admin.from("render_jobs").select("storage_path,creative_variants(hook,caption)")
      .eq("workspace_id", ws).eq("id", asset.id).eq("status", "done").maybeSingle();
    const path = data?.storage_path;
    if (error || !data || !path || (!path.startsWith("autotoast:") && !ownedPath(path, ws))) throw new Error("A selected video is unavailable.");
    return { ...base, title: data.creative_variants?.hook || "Video", videoPath: path };
  }
  const { data, error } = await admin.from("posts").select("caption,created_via,post_media(id)")
    .eq("workspace_id", ws).eq("id", asset.id).is("variant_id", null)
    .in("status", ["draft", "scheduled", "published", "partially_published"]).maybeSingle();
  if (error || !data?.caption.trim() || data.post_media.length || data.created_via?.startsWith("written_post:")) {
    throw new Error("A selected written post is unavailable.");
  }
  return { ...base, title: "Written post", text: data.caption };
}

export async function shareOffer(input: z.infer<typeof offerInputSchema>) {
  const { admin, user, owner, lead } = await ownedLead(input.leadId);
  const db = leadDb(admin);
  const existing = await db.from("agency_lead_offers").select("token,revoked_at").eq("id", input.offerId).eq("lead_id", lead.id).maybeSingle();
  if (existing.error) throw new Error("Could not check the offer.");
  if (existing.data && !existing.data.revoked_at) return { url: shareUrl(existing.data.token) };
  if (existing.data) throw new Error("This offer link has already been revoked.");

  const tileIds = input.assets.filter((asset) => asset.type === "tile").map((asset) => asset.id);
  const [profile, captions] = await Promise.all([
    admin.from("agency_profiles").select("agency_name").eq("user_id", owner).maybeSingle(),
    tileIds.length ? (await import("./creation-schedule.functions")).findTileCaptions(admin, lead.workspace_id, tileIds) : {},
  ]);
  if (profile.error) throw new Error("Could not load the agency name.");
  const samples = await Promise.all(input.assets.map((asset) => snapshotSample(admin, lead.workspace_id, asset, captions)));
  const row = {
    id: input.offerId, lead_id: lead.id, created_by: user.id, token: randomBytes(32).toString("hex"),
    agency_name: profile.data?.agency_name || "Your agency", recipient_name: lead.client_contact_name || lead.client_name,
    title: input.title, description: input.description, next_steps: input.nextSteps, price_minor: input.priceMinor, currency: input.currency,
    cadence: input.cadence, samples,
  };
  const inserted = await db.from("agency_lead_offers").insert(row);
  if (inserted.error?.code === "23505") {
    const raced = await db.from("agency_lead_offers").select("token").eq("id", row.id).eq("lead_id", lead.id).is("revoked_at", null).maybeSingle();
    if (!raced.error && raced.data) return { url: shareUrl(raced.data.token) };
  }
  if (inserted.error) throw new Error("Could not create the offer link. Please try again.");
  return { url: shareUrl(row.token) };
}

export async function listOffers(leadId: string) {
  const { admin } = await ownedLead(leadId);
  const db = leadDb(admin);
  const { data, error } = await db.from("agency_lead_offers").select("id,token,title,price_minor,currency,cadence,created_at,revoked_at,decision,decided_at")
    .eq("lead_id", leadId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load offers.");
  const offers = (data ?? []) as Omit<Offer, "samples" | "description" | "next_steps" | "agency_name" | "recipient_name">[];
  if (!offers.length) return [];
  const stats = await db.rpc("agency_lead_offer_stats", { _offers: offers.map((offer) => offer.id) });
  if (stats.error) throw new Error("Could not load offer activity.");
  const counts = new Map<string, { views: number; sample_clicks: number }>((stats.data ?? []).map((entry: { offer_id: string; views: number; sample_clicks: number }) => [entry.offer_id, entry]));
  return offers.map(({ token, ...offer }) => ({
    ...offer, url: offer.revoked_at ? null : shareUrl(token),
    views: counts.get(offer.id)?.views ?? 0, clicks: counts.get(offer.id)?.sample_clicks ?? 0,
  }));
}

export async function revokeOffer(leadId: string, offerId: string) {
  const { admin } = await ownedLead(leadId);
  const { error } = await leadDb(admin).from("agency_lead_offers").update({ revoked_at: new Date().toISOString() })
    .eq("lead_id", leadId).eq("id", offerId).is("revoked_at", null);
  if (error) throw new Error("Could not revoke this link.");
}

export async function readOffer(token: string) {
  const admin = getAdminClient();
  const { data, error } = await leadDb(admin).from("agency_lead_offers")
    .select(`${offerFields},agency_clients!inner(workspace_id)`)
    .eq("token", token).is("revoked_at", null).eq("agency_clients.status", "active").eq("agency_clients.workspace_kind", "lead").maybeSingle();
  if (error) throw new Error("Could not load this offer.");
  if (!data) return null;
  const row = data as unknown as Offer & { agency_clients: { workspace_id: string } };
  const ws = row.agency_clients.workspace_id;
  const sign = async (path: string) => {
    if (!ownedPath(path, ws)) return null;
    const { data } = await admin.storage.from("brand-assets-private").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  };
  const samples = await Promise.all(row.samples.map(async ({ key, title, type, text, paths, videoPath }) => {
    const images = paths ? (await Promise.all(paths.map(sign))).filter((url): url is string => !!url) : [];
    let video: string | null = null;
    if (videoPath) {
      try {
        if (videoPath.startsWith("autotoast:")) {
          const media = await (await import("./render.server")).getMedia(videoPath.slice(10));
          const url = media.playback_url || media.download_url;
          if (media.workspace_id === ws && media.status === "ready" && url && new URL(url).protocol === "https:") video = url;
        } else video = await sign(videoPath);
      } catch { /* A missing sample does not hide the rest of the offer. */ }
    }
    return { key, title, type, text, images, video };
  }));
  return { agency: row.agency_name, recipient: row.recipient_name, title: row.title, description: row.description,
    priceMinor: row.price_minor, currency: row.currency, cadence: row.cadence, decision: row.decision, samples,
    nextSteps: row.decision === "accepted" ? row.next_steps : "" };
}

export async function trackOffer(token: string, visitId: string, sampleKey?: string) {
  const { data, error } = await leadDb(getAdminClient()).rpc("record_agency_lead_offer_event", {
    _token: token, _visit: visitId, _event: sampleKey ? "sample_click" : "view", _sample: sampleKey ?? "",
  });
  if (error) throw new Error("Could not record activity.");
  return data === true;
}

export async function respondToOffer(token: string, decision: "accepted" | "declined") {
  const { data, error } = await leadDb(getAdminClient()).rpc("respond_to_agency_lead_offer", { _token: token, _decision: decision });
  if (error) throw new Error("Could not save your response. Please try again.");
  if (data === null) return null;
  return offerDecisionSchema.parse(data);
}

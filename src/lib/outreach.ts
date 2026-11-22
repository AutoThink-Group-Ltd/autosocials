export type OutreachInterest = "unknown" | "interested" | "not_interested";
export type OutreachCreatorInput = { creatorProfileId?: string | undefined; name: string; username?: string | null | undefined; platform?: string | null | undefined; email?: string | null | undefined; contactSource?: string | null | undefined; profileUrl?: string | null | undefined; bio?: string | null | undefined };
export type OutreachReviewSnapshot = { sender: { id: string | null; name: string; email: string }; signature: string; creators: Array<{ id: string; version: number; name: string; email: string; subject: string; body: string }> };
export function validateReview(snapshot: OutreachReviewSnapshot): string | null {
 if (!snapshot.sender.email || !snapshot.sender.name) return "Choose a verified sender.";
 if (!snapshot.creators.length) return "Choose at least one creator.";
 if (new Set(snapshot.creators.map(c => c.id)).size !== snapshot.creators.length) return "A creator was selected more than once.";
 if (snapshot.creators.some(c => !c.email || !c.subject.trim() || !c.body.trim())) return "Every selected creator needs an email, subject and message.";
 return null;
}

export type OutreachCampaignRow = { id:string; workspace_id:string; name:string; brief:string; created_at:string; updated_at:string };
export type OutreachCreatorRow = { id:string; workspace_id:string; campaign_id:string; creator_profile_id:string|null; name:string; username:string|null; platform:string|null; email:string|null; contact_source:string|null; profile_url:string|null; bio:string|null; subject:string; body:string; version:number; interest:OutreachInterest };
export type OutreachBatchRow = { id:string; campaign_id:string; status:string; created_at:string };
export type OutreachJobRow = { id:string; campaign_id:string; creator_id:string; batch_id:string; status:string; subject:string; body:string; to_email:string; created_at:string };
export type OutreachReplyRow = { id:string; outreach_job_id:string|null; from_email:string; from_name:string|null; subject:string|null; body_text:string|null; received_at:string|null; is_read:boolean };
export type OutreachList = {campaigns:OutreachCampaignRow[];creators:OutreachCreatorRow[];batches:OutreachBatchRow[];jobs:OutreachJobRow[];senderIdentities:{id:string;sender_name:string;sender_email:string;is_verified:boolean}[]};
export type OutreachInbox = {creators:OutreachCreatorRow[];jobs:OutreachJobRow[];replies:OutreachReplyRow[]};


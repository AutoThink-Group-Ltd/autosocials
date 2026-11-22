import { ProviderError } from './delivery.ts';
import { companyIdFromExternal } from '../_shared/linkedin-company.ts';
import { publishLinkedInDocument } from './linkedin-document-publisher.ts';
import { publishLinkedInCompany } from './linkedin-company-publisher.ts';
import { LinkedInVideoProcessingError, linkedInUploadUrl, readLinkedInMedia, type LinkedInDeliveryContext } from './linkedin-media.ts';
export { LinkedInVideoProcessingError } from './linkedin-media.ts';

export async function publishLinkedIn(account: any, post: any, media: any[], context: LinkedInDeliveryContext, supabaseUrl: string): Promise<{ id: string; permalink: string }> {
  const text = String(post.caption ?? '');
  if ((!text.trim() && !media.length) || text.length > 3000) throw new ProviderError('LinkedIn needs content and supports captions up to 3,000 characters.');
  if (String(post.first_comment ?? '').trim()) throw new ProviderError('LinkedIn first comments are not supported. Remove the first comment before publishing.');
  if (media.length > 1) throw new ProviderError('LinkedIn supports one image, video or PDF per post in this workflow.');
  const organization = companyIdFromExternal(account.external_id);
  if (!organization && !/^[A-Za-z0-9_-]+$/.test(account.external_id ?? '')) throw new ProviderError('Invalid LinkedIn publishing account.');
  const author = organization ? `urn:li:organization:${organization}` : `urn:li:person:${account.external_id}`;
  if (media[0]?.kind === 'document') {
    if (media[0].mime !== 'application/pdf') throw new ProviderError('LinkedIn carousels require a PDF.');
    return publishLinkedInDocument(author, account.access_token, text, media[0], context, supabaseUrl);
  }
  if (media.length && !(media[0].kind === 'image' && ['image/jpeg','image/png','image/gif'].includes(media[0].mime)) && !(media[0].kind === 'video' && media[0].mime === 'video/mp4')) throw new ProviderError('LinkedIn supports JPEG, PNG, GIF or MP4 for this post.');
  if (organization) return publishLinkedInCompany(organization, account.access_token, text, media[0], context, supabaseUrl);
  const auth = { Authorization: `Bearer ${account.access_token}`, 'X-Restli-Protocol-Version': '2.0.0' };
  let assetId = context.containerId ?? undefined;
  if (assetId && !/^urn:li:digitalmediaAsset:[A-Za-z0-9_-]+$/.test(assetId)) throw new ProviderError('Invalid LinkedIn media checkpoint.');
  if (assetId && media.length !== 1) throw new ProviderError('LinkedIn media changed after upload. Review this post before retrying.');
  if (media.length && !assetId) {
    const asset = media[0];
    const bytes = await readLinkedInMedia(asset.url, supabaseUrl);
    const registered = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', { method:'POST', headers: { ...auth, 'Content-Type':'application/json' }, body: JSON.stringify({ registerUploadRequest: { recipes:[`urn:li:digitalmediaRecipe:feedshare-${asset.kind}`], owner:author, serviceRelationships:[{ relationshipType:'OWNER', identifier:'urn:li:userGeneratedContent' }] } }), signal:AbortSignal.timeout(30_000) });
    const data = await registered.json().catch(() => ({}));
    const upload = data.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    assetId = data.value?.asset;
    if (!registered.ok || typeof upload !== 'string' || typeof assetId !== 'string' || !assetId.startsWith('urn:li:digitalmediaAsset:')) throw new ProviderError(`LinkedIn could not prepare media (${registered.status}).`, registered.status === 429 || registered.status >= 500);
    const uploadUrl = linkedInUploadUrl(upload);
    const uploaded = await fetch(uploadUrl, { method:'PUT', redirect:'error', headers:{ Authorization: auth.Authorization, 'Content-Type':'application/octet-stream' }, body:bytes, signal:AbortSignal.timeout(120_000) });
    if (!uploaded.ok) throw new ProviderError(`LinkedIn media upload failed (${uploaded.status}).`, uploaded.status === 429 || uploaded.status >= 500);
    await context.checkpoint({ provider_container_id: assetId });
  }
  if (assetId && media[0]?.kind === 'video') {
    const id = assetId.slice('urn:li:digitalmediaAsset:'.length);
    const statusResponse = await fetch(`https://api.linkedin.com/v2/assets/${encodeURIComponent(id)}`, { headers:auth, signal:AbortSignal.timeout(30_000) });
    const status = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new ProviderError(`LinkedIn video status could not be checked (${statusResponse.status}).`, statusResponse.status === 429 || statusResponse.status >= 500);
    const recipeStatus = status.recipes?.find((recipe: { recipe?: string }) => recipe.recipe === 'urn:li:digitalmediaRecipe:feedshare-video')?.status;
    if (['NEW','PROCESSING','WAITING_UPLOAD'].includes(recipeStatus)) throw new LinkedInVideoProcessingError();
    if (recipeStatus !== 'AVAILABLE') throw new ProviderError('LinkedIn could not process this video.');
  }
  const share = { shareCommentary:{ text }, shareMediaCategory:media.length ? media[0].kind.toUpperCase() : 'NONE', ...(assetId ? { media:[{ status:'READY', media:assetId }] } : {}) };
  await context.checkpoint({ submission_started_at:new Date().toISOString() });
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', { method:'POST', headers:{ ...auth, 'Content-Type':'application/json' }, body:JSON.stringify({ author, lifecycleState:'PUBLISHED', specificContent:{ 'com.linkedin.ugc.ShareContent':share }, visibility:{ 'com.linkedin.ugc.MemberNetworkVisibility':'PUBLIC' } }), signal:AbortSignal.timeout(30_000) });
  if (!response.ok) throw new ProviderError(`LinkedIn could not publish this post (${response.status}).`, response.status === 429, response.status < 500);
  const id = response.headers.get('x-restli-id');
  if (!id || !/^urn:li:(ugcPost|share):\d+$/.test(id)) throw new ProviderError('LinkedIn did not confirm the post ID. Check LinkedIn before retrying.', false, false);
  return { id, permalink:`https://www.linkedin.com/feed/update/${id}/` };
}

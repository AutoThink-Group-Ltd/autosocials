import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishLinkedIn } from '../../supabase/functions/publish-scheduled-posts/linkedin-publisher';

const account = { external_id: 'member123', access_token: 'token' };
const base = 'https://project.supabase.co';
afterEach(() => vi.unstubAllGlobals());

describe('LinkedIn publishing', () => {
  const company = { ...account, external_id: 'organization:2414183' };
  const stored = (kind: 'image' | 'video') => ({ kind, mime: kind === 'image' ? 'image/png' : 'video/mp4', url: `${base}/storage/v1/object/sign/post-media/workspace/${kind}` });
  it('submits scheduled text only as the selected Company Page using the Posts API', async () => {
    const checkpoint = vi.fn(async () => {});
    const fetcher = vi.fn(async (url: string, request: RequestInit) => {
      expect(url).toBe('https://api.linkedin.com/rest/posts');
      expect(new Headers(request.headers).get('LinkedIn-Version')).toBe('202610');
      expect(JSON.parse(String(request.body))).toMatchObject({
        author: 'urn:li:organization:2414183', commentary: 'Approved Company Page post', lifecycleState: 'PUBLISHED',
      });
      expect(checkpoint).toHaveBeenCalledWith({ submission_started_at: expect.any(String) });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(publishLinkedIn(company, { caption: 'Approved Company Page post' }, [], { checkpoint }, base)).resolves.toMatchObject({ id: 'urn:li:share:123' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('uploads a private image for the company and publishes its confirmed image URN', async () => {
    const checkpoint = vi.fn(async () => {});
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(base)) return new Response(new Uint8Array([1,2,3]), { headers: { 'content-length': '3' } });
      if (url.endsWith('images?action=initializeUpload')) {
        expect(JSON.parse(String(init?.body)).initializeUploadRequest.owner).toBe('urn:li:organization:2414183');
        return Response.json({ value: { image: 'urn:li:image:image1', uploadUrl: 'https://www.linkedin.com/dms-uploads/image1' } });
      }
      if (url.includes('dms-uploads')) {
        expect(init?.method).toBe('PUT');
        return new Response(null, { status: 201 });
      }
      if (url.includes('/rest/images/')) return Response.json({ status: 'AVAILABLE' });
      expect(JSON.parse(String(init?.body)).content).toEqual({ media: { id: 'urn:li:image:image1' } });
      expect(checkpoint).toHaveBeenCalledTimes(2);
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
    }));
    await publishLinkedIn(company, { caption: 'Image' }, [stored('image')], { checkpoint }, base);
    expect(checkpoint).toHaveBeenNthCalledWith(1, { provider_container_id: 'urn:li:image:image1' });
  });

  it('checkpoints completed Company Page video uploads and waits before submitting', async () => {
    const checkpoint = vi.fn(async () => {});
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(base)) return new Response(new Uint8Array([1,2,3]), { headers: { 'content-length': '3' } });
      if (url.endsWith('videos?action=initializeUpload')) return Response.json({ value: {
        video: 'urn:li:video:video1', uploadToken: 'upload',
        uploadInstructions: [
          { firstByte: 0, lastByte: 1, uploadUrl: 'https://www.linkedin.com/dms-uploads/one' },
          { firstByte: 2, lastByte: 2, uploadUrl: 'https://www.linkedin.com/dms-uploads/two' },
        ],
      } });
      if (url.includes('dms-uploads')) {
        expect(Array.from(init?.body as Uint8Array)).toEqual(url.endsWith('one') ? [1,2] : [3]);
        return new Response(null, { status: 200, headers: { etag: url.endsWith('one') ? '"one"' : '"two"' } });
      }
      if (url.endsWith('videos?action=finalizeUpload')) {
        expect(JSON.parse(String(init?.body)).finalizeUploadRequest).toMatchObject({ uploadToken: 'upload', uploadedPartIds: ['one', 'two'] });
        return new Response(null, { status: 200 });
      }
      if (url.includes('/rest/videos/')) return Response.json({ status: 'PROCESSING' });
      throw new Error('Unexpected post submission');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(publishLinkedIn(company, { caption: 'Video' }, [stored('video')], { checkpoint }, base)).rejects.toMatchObject({ retryable: true });
    expect(checkpoint).toHaveBeenCalledExactlyOnceWith({ provider_container_id: 'urn:li:video:video1' });
    fetcher.mockClear();
    await expect(publishLinkedIn(company, { caption: 'Video' }, [stored('video')], { containerId: 'urn:li:video:video1', checkpoint }, base)).rejects.toMatchObject({ retryable: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('publishes approved text as the connected member and checkpoints before submission', async () => {
    const checkpoint = vi.fn(async () => {});
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(checkpoint).toHaveBeenCalledOnce();
      expect(JSON.parse(String(init.body))).toMatchObject({ author: 'urn:li:person:member123', lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: 'Approved text' }, shareMediaCategory: 'NONE' } } });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await publishLinkedIn(account, { caption: 'Approved text' }, [], { checkpoint }, base);
    expect(result).toEqual({ id: 'urn:li:share:123', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:123/' });
  });

  it('rejects external media before sending credentials or making any request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(publishLinkedIn(account, { caption: 'Text' }, [{ kind: 'image', mime: 'image/png', url: 'https://example.com/file.png' }], { checkpoint: vi.fn() }, base)).rejects.toThrow('private post media');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a successful response without a post ID as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));
    await expect(publishLinkedIn(account, { caption: 'Text' }, [], { checkpoint: vi.fn() }, base)).rejects.toMatchObject({ definitive: false });
  });

  it('registers and uploads a private image before submitting it', async () => {
    const calls: string[] = [];
    const checkpoint = vi.fn(async () => {});
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith(base)) return new Response(new Uint8Array([1,2,3]), { headers:{ 'content-length':'3' } });
      if (url.includes('registerUpload')) return Response.json({ value:{ asset:'urn:li:digitalmediaAsset:asset123', uploadMechanism:{ 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest':{ uploadUrl:'https://api.linkedin.com/mediaUpload/example' } } } });
      if (url.includes('mediaUpload')) { expect(init?.method).toBe('PUT'); expect(init?.redirect).toBe('error'); return new Response(null, { status:201 }); }
      expect(checkpoint).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(init?.body)).specificContent['com.linkedin.ugc.ShareContent'].media[0].media).toBe('urn:li:digitalmediaAsset:asset123');
      return new Response(null, { status:201, headers:{ 'x-restli-id':'urn:li:ugcPost:456' } });
    }));
    await publishLinkedIn(account, { caption:'Image post' }, [{ kind:'image', mime:'image/png', url:`${base}/storage/v1/object/sign/post-media/workspace/image` }], { checkpoint }, base);
    expect(calls).toHaveLength(4);
  });
  it('waits for a checkpointed video to finish processing without submitting it', async () => {
    const fetcher = vi.fn(async () => Response.json({ recipes:[{ recipe:'urn:li:digitalmediaRecipe:feedshare-video', status:'PROCESSING' }] }));
    vi.stubGlobal('fetch', fetcher);
    const checkpoint = vi.fn();
    await expect(publishLinkedIn(account, { caption:'Video' }, [{ kind:'video', mime:'video/mp4' }], { containerId:'urn:li:digitalmediaAsset:asset123', checkpoint }, base)).rejects.toMatchObject({ retryable:true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
  });
});

describe("LinkedIn carousel PDFs", () => {
  const documentId = "urn:li:document:deck123";
  const media = [{
    kind: "document", mime: "application/pdf", alt_text: "The shopper’s question",
    url: `${base}/storage/v1/object/sign/post-media/workspace/deck.pdf`,
  }];
  const post = { caption: "Reviewed carousel caption" };

  it.each([
    ["member123", "urn:li:person:member123"],
    ["organization:2414183", "urn:li:organization:2414183"],
  ])("publishes a PDF document with the reviewed caption for %s", async (external_id, author) => {
    const checkpoint = vi.fn(async () => {});
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, request?: RequestInit) => {
      const url = String(input);
      if (url === media[0]!.url) return new Response("%PDF-1.7", { headers: { "content-length": "8" } });
      if (url.endsWith("documents?action=initializeUpload")) {
        expect(JSON.parse(String(request?.body))).toEqual({ initializeUploadRequest: { owner: author } });
        expect(new Headers(request?.headers).get("LinkedIn-Version")).toBe("202610");
        return Response.json({ value: { document: documentId, uploadUrl: "https://www.linkedin.com/dms-uploads/deck" } });
      }
      if (url === "https://www.linkedin.com/dms-uploads/deck") {
        expect(request?.method).toBe("PUT");
        expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer token");
        return new Response(null, { status: 201 });
      }
      if (url === `https://api.linkedin.com/rest/documents/${encodeURIComponent(documentId)}`) {
        expect(checkpoint).toHaveBeenCalledWith({ provider_container_id: documentId });
        return Response.json({ id: documentId, status: "AVAILABLE" });
      }
      expect(url).toBe("https://api.linkedin.com/rest/posts");
      expect(checkpoint).toHaveBeenCalledWith({ submission_started_at: expect.any(String) });
      expect(JSON.parse(String(request?.body))).toMatchObject({
        author, commentary: post.caption, content: { media: { id: documentId, title: media[0]!.alt_text } },
      });
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:ugcPost:123" } });
    }));
    await expect(publishLinkedIn({ ...account, external_id }, post, media, { checkpoint }, base)).resolves.toMatchObject({
      permalink: "https://www.linkedin.com/feed/update/urn:li:ugcPost:123/",
    });
  });

  it("checks the existing upload while LinkedIn processes it and submits no post", async () => {
    const checkpoint = vi.fn(async () => {});
    const fetcher = vi.fn(async () => Response.json({ id: documentId, status: "PROCESSING" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(publishLinkedIn(account, post, media, { containerId: documentId, checkpoint }, base)).rejects.toMatchObject({
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
  });
});

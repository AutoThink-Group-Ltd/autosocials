import { prepareDesignItems } from "./social-design-planning.server";
import { wantsQuotations } from "./social-quote-sources";
import type { ContentCampaign } from "./content-campaign";

/** Verify proposed quotes and keep mixed calendars' non-quote slots original. */
export async function prepareCampaignTile(post: ContentCampaign["posts"][number], brief: string, forceQuote = false) {
  if (post.format !== "tiles") return post;
  const quoteSlot = forceQuote || !!post.quote || wantsQuotations(`${post.title} ${post.brief}`);
  const [prepared] = await prepareDesignItems([{ headline: post.title.slice(0,80), supporting: "", direction: post.brief.slice(0,220), ...(post.design ? { design: post.design } : {}), ...(post.quote ? { quote: post.quote } : {}) }], quoteSlot ? brief : "", []);
  if (!prepared) return post;
  const candidate = post.quote;
  const changedQuote = candidate && (!prepared.quote || prepared.quote.text !== candidate.text || prepared.quote.speaker !== candidate.speaker);
  const captionContainsCandidate = candidate && (post.caption.toLowerCase().includes(candidate.text.toLowerCase()) || post.caption.toLowerCase().includes(candidate.speaker.toLowerCase()));
  const { quote: _oldQuote, quoteNotice: _oldNotice, ...rest } = post;
  return { ...rest, title: prepared.headline === post.title.slice(0,80) ? post.title : prepared.headline, caption: changedQuote && captionContainsCandidate ? "Consider one idea you can put into practice this week." : post.caption, design: prepared.design, ...(prepared.quote ? { quote: prepared.quote } : {}), ...(prepared.quoteNotice ? { quoteNotice: prepared.quoteNotice } : (!candidate && _oldNotice ? { quoteNotice: _oldNotice } : {})) };
}

export type PublishingGrant = {
  connectionId: string;
  accountIds: string[];
  expiresAt: string;
  maxCount: number;
  publishNowAccountIds: string[];
  publishNowMaxCount: number;
};
export function validatePublishingGrant(
  grant: PublishingGrant,
  now = Date.now(),
): string | null {
  const expiry = Date.parse(grant.expiresAt);
  if (
    !grant.connectionId ||
    !grant.accountIds.length ||
    grant.accountIds.length > 20 ||
    new Set(grant.accountIds).size !== grant.accountIds.length
  )
    return "Select a connection and at least one account.";
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 90 * 86400000)
    return "Choose an expiry within the next 90 days.";
  if (
    !Number.isInteger(grant.maxCount) ||
    grant.maxCount < 1 ||
    grant.maxCount > 1000
  )
    return "Choose a total limit between 1 and 1000.";
  if (
    new Set(grant.publishNowAccountIds).size !==
      grant.publishNowAccountIds.length ||
    grant.publishNowAccountIds.some((id) => !grant.accountIds.includes(id))
  )
    return "Immediate accounts must be included in the selected accounts.";
  if (
    !Number.isInteger(grant.publishNowMaxCount) ||
    (grant.publishNowAccountIds.length === 0
      ? grant.publishNowMaxCount !== 0
      : grant.publishNowMaxCount < 1 ||
        grant.publishNowMaxCount > grant.maxCount)
  )
    return "Choose an immediate limit within the total limit.";
  return null;
}

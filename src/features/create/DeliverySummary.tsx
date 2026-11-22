import { CircleHelp } from "lucide-react";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/client-social-profiles";
import {
  publishedPostLink,
  type AssetChannelStatus,
} from "@/features/schedule/useAssetPublishingStatus";

const commonChannels = ["facebook", "instagram", "linkedin", "x"] as const;
const normalize = (platform: string) =>
  platform.toLowerCase() === "twitter" ? "x" : platform.toLowerCase();
const platformName = (platform: string) =>
  platform === "linkedin"
    ? "LinkedIn"
    : platform === "x"
      ? "X"
      : platform.charAt(0).toUpperCase() + platform.slice(1);
const statusName = (status: string) =>
  ({
    published: "Published",
    pending: "Scheduled",
    awaiting_approval: "Awaiting approval",
    failed: "Failed",
    publishing: "Publishing",
    retrying: "Retrying",
    skipped: "Skipped",
  })[status] ?? status;

export function groupDeliveries(receipts: AssetChannelStatus[]) {
  const groups = new Map<string, AssetChannelStatus[]>();
  for (const receipt of receipts) {
    const time = receipt.date ? Date.parse(receipt.date) : NaN;
    const key = Number.isFinite(time)
      ? String(Math.floor(time / 60_000) * 60_000)
      : "unknown";
    const group = groups.get(key) ?? [];
    group.push(receipt);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "unknown" ? 1 : b === "unknown" ? -1 : Number(a) - Number(b),
  );
}

export function DeliverySummary({
  receipts,
  stage,
  onManage,
}: {
  receipts: AssetChannelStatus[];
  stage: "ready" | "scheduled" | "published";
  onManage: (postId: string) => void;
}) {
  if (!receipts.length) return null;
  const manageable = new Map<
    string,
    "Manage schedule" | "Review failed delivery"
  >();
  for (const receipt of receipts) {
    if (receipt.postStatus === "scheduled" && stage === "scheduled")
      manageable.set(receipt.postId, "Manage schedule");
    else if (receipt.status === "failed" && !manageable.has(receipt.postId))
      manageable.set(receipt.postId, "Review failed delivery");
  }
  return (
    <div className="space-y-3" aria-label="Delivery history">
      {groupDeliveries(receipts).map(([minute, rows]) => {
        const channels = [
          ...new Set<string>([
            ...commonChannels,
            ...rows.map((row) => normalize(row.platform)),
          ]),
        ];
        const needsDetails =
          rows.some((row) => row.status === "failed") ||
          rows.length > 1 ||
          rows.some(
            (row) =>
              !(SOCIAL_PLATFORMS as readonly string[]).includes(
                normalize(row.platform),
              ),
          );
        return (
          <div
            key={minute}
            className="space-y-2 rounded-lg border border-border-control p-3"
          >
            <p className="text-sm font-semibold">
              {minute === "unknown"
                ? "Date unavailable"
                : new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(Number(minute))) + " local time"}
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              aria-label="Channels for this time"
            >
              {channels.map((channel) => {
                const entries = rows.filter(
                  (row) => normalize(row.platform) === channel,
                );
                const active = entries.some((row) =>
                  stage === "published"
                    ? row.status === "published"
                    : stage === "scheduled" &&
                      row.postStatus === "scheduled" &&
                      !["published", "failed", "skipped"].includes(row.status),
                );
                const failed = entries.some((row) => row.status === "failed");
                const label = `${platformName(channel)}: ${entries.length ? entries.map((row) => `${row.account} — ${statusName(row.status)}`).join("; ") : "no delivery"}`;
                const links = [
                  ...new Set(
                    entries
                      .map(publishedPostLink)
                      .filter((link): link is string => !!link),
                  ),
                ];
                const className = `${active ? "bg-ink text-inverse" : "bg-surface-subtle text-muted-foreground"} relative inline-flex size-8 items-center justify-center rounded-full`;
                const icon = (
                  <>
                    {(SOCIAL_PLATFORMS as readonly string[]).includes(
                      channel,
                    ) ? (
                      <SocialChannelIcon
                        platform={channel as SocialPlatform}
                        className="size-4"
                      />
                    ) : (
                      <CircleHelp className="size-4" aria-hidden="true" />
                    )}
                    {failed && (
                      <span
                        className="absolute right-0 top-0 size-2 rounded-full bg-destructive"
                        aria-hidden="true"
                      />
                    )}
                  </>
                );
                return links.length === 1 ? (
                  <a
                    key={channel}
                    href={links[0]}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${label}; open published post`}
                    title={label}
                    className={className}
                  >
                    {icon}
                  </a>
                ) : (
                  <span
                    key={channel}
                    role="img"
                    aria-label={label}
                    title={label}
                    className={className}
                  >
                    {icon}
                  </span>
                );
              })}
            </div>
            {needsDetails && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold">
                  {rows.some((row) => row.status === "failed")
                    ? "Delivery details · needs attention"
                    : "Delivery details"}
                </summary>
                <ul className="mt-2 space-y-1">
                  {rows.map((receipt, index) => {
                    const link = publishedPostLink(receipt);
                    return (
                      <li
                        key={`${receipt.postId}-${receipt.accountId}-${index}`}
                      >
                        <span>
                          {platformName(normalize(receipt.platform))} ·{" "}
                          {receipt.account}: {statusName(receipt.status)}
                        </span>
                        {link && (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                              aria-label={`Open ${platformName(normalize(receipt.platform))} post for ${receipt.account}`}
                            >
                              Open post
                            </a>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        {[...manageable].map(([postId, label]) => (
          <button
            key={postId}
            type="button"
            className="text-xs font-semibold underline"
            aria-label={`${label} for post ${postId}`}
            onClick={() => onManage(postId)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

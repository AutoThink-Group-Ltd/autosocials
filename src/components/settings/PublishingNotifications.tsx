import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPublishNotificationSettings,
  setPublishNotificationSettings,
} from "@/lib/publish-notifications.functions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Change = {
  masterEnabled?: boolean;
  recipientUserId?: string;
  selected?: boolean;
  selfEnabled?: boolean;
};

/** The same server-backed settings are used in the client workspace and agency views. */
export function PublishingNotifications({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { user } = useAuth();
  const getSettings = useServerFn(getPublishNotificationSettings);
  const setSettings = useServerFn(setPublishNotificationSettings);
  const queryClient = useQueryClient();
  const key = ["publish-notification-settings", workspaceId, user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!workspaceId && !!user,
    queryFn: () => getSettings({ data: { workspaceId } }),
  });
  const save = useMutation({
    mutationFn: (change: Change) =>
      setSettings({ data: { workspaceId, ...change } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save notification settings.",
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MailCheck className="h-5 w-5 text-primary" />
          Published post emails
        </CardTitle>
        <CardDescription>
          Choose who can receive an email when a scheduled post is published.
          Changes save automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <div role="status" className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="sr-only">
              Loading publishing notification settings
            </span>
          </div>
        ) : query.isError || !query.data ? (
          <div role="alert" className="space-y-2 text-sm text-muted-foreground">
            <p>Couldn't load publishing notification settings.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  Publishing emails for this workspace
                </p>
                <p className="text-xs text-muted-foreground">
                  Turning this off pauses all publishing-success emails without
                  changing individual choices.
                </p>
              </div>
              <Switch
                aria-label="Publishing emails for this workspace"
                checked={query.data.masterEnabled}
                disabled={!query.data.canManage || save.isPending}
                onCheckedChange={(value) =>
                  save.mutate({ masterEnabled: value })
                }
              />
            </div>
            {!query.data.canManage && (
              <p className="text-xs text-muted-foreground">
                A workspace or agency manager controls the workspace switch and
                recipient list.
              </p>
            )}
            {query.data.canSelf && (
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-medium">
                    Email me when a post is published
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your choice applies only to you. The workspace switch and
                    recipient selection also apply.
                  </p>
                </div>
                <Switch
                  aria-label="Email me when a post is published"
                  checked={query.data.selfEnabled}
                  disabled={save.isPending}
                  onCheckedChange={(value) =>
                    save.mutate({ selfEnabled: value })
                  }
                />
              </div>
            )}
            {query.data.canManage && (
              <div className="space-y-2 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-medium">
                    Selected workspace members
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Selected members receive an email only if they have also
                    opted in. Pending invitations are not recipients.
                  </p>
                </div>
                {query.data.people.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No active workspace members.
                  </p>
                )}
                {query.data.people.map((person) => (
                  <div
                    key={person.userId}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {person.name || person.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {person.email} ·{" "}
                        {person.optedIn ? "Opted in" : "Not opted in"}
                      </p>
                    </div>
                    <Switch
                      aria-label={`Select ${person.email} for published post emails`}
                      checked={person.selected}
                      disabled={save.isPending}
                      onCheckedChange={(value) =>
                        save.mutate({
                          recipientUserId: person.userId,
                          selected: value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            {!query.data.masterEnabled && (
              <p className="text-xs text-muted-foreground">
                Publishing emails are paused for this workspace.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

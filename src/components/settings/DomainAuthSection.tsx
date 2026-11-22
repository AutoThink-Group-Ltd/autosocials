import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Globe, Loader2, CheckCircle2, AlertCircle, Copy, RefreshCw,
} from "lucide-react";

interface DnsRecord {
  type: string;
  host: string;
  data: string;
  valid: boolean;
  name: string;
}

interface DomainRecord {
  id: string;
  workspace_id: string;
  domain: string;
  sendgrid_domain_id: number | null;
  status: string;
  dns_records: DnsRecord[];
}

export function DomainAuthSection() {
  const { currentWorkspace } = useWorkspace();
  const [domainRecord, setDomainRecord] = useState<DomainRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [isProvisioned, setIsProvisioned] = useState(false);

  const workspaceId = currentWorkspace?.id;

  const checkProvisioning = async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("workspace_sendgrid_config")
      .select("id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    setIsProvisioned(!!data);
  };

  const fetchDomain = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("workspace_domains")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    setDomainRecord(data as unknown as DomainRecord | null);
    setLoading(false);
  };

  useEffect(() => {
    checkProvisioning();
    fetchDomain();
  }, [workspaceId]);

  const handleProvision = async () => {
    if (!workspaceId) return;
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-sendgrid-subuser", {
        body: { workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.already_exists ? "Email already set up" : "Email infrastructure provisioned");
      setIsProvisioned(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to provision");
    }
    setProvisioning(false);
  };

  const handleAuthenticate = async () => {
    if (!workspaceId || !newDomain.trim()) {
      toast.error("Enter a domain");
      return;
    }
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(newDomain.trim())) {
      toast.error("Enter a valid domain (e.g. yourbrand.com)");
      return;
    }
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-domain-auth", {
        body: { action: "authenticate", workspace_id: workspaceId, domain: newDomain.trim().toLowerCase() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.inherited || data?.valid) {
        toast.success("Domain already verified — inherited from parent account. No DNS changes needed!");
      } else {
        toast.success("DNS records generated. Add them to your domain provider.");
      }
      setNewDomain("");
      fetchDomain();
    } catch (e: any) {
      toast.error(e.message || "Failed to authenticate domain");
    }
    setProvisioning(false);
  };

  const handleVerify = async () => {
    if (!workspaceId) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-domain-auth", {
        body: { action: "verify", workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.valid) {
        toast.success("Domain verified! Your sender identities are now active.");
      } else {
        toast.info("DNS records not yet propagated. This can take up to 48 hours.");
      }
      fetchDomain();
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    }
    setVerifying(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (!workspaceId) return null;

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" /> Domain Authentication
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Verify your domain to send emails from your own address
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Provision SendGrid subuser */}
        {!isProvisioned && !loading && (
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              First, set up your email infrastructure to start sending emails.
            </p>
            <Button onClick={handleProvision} disabled={provisioning} className="gap-1.5">
              {provisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {provisioning ? "Setting up..." : "Set Up Email"}
            </Button>
          </div>
        )}

        {/* Step 2: Domain authentication */}
        {isProvisioned && !domainRecord && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your domain to generate DNS records for email authentication (DKIM & SPF).
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="yourbrand.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={handleAuthenticate} disabled={provisioning} className="gap-1.5">
                {provisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Authenticate Domain
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: DNS records display */}
        {domainRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{domainRecord.domain}</span>
                {domainRecord.status === "verified" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-amber-600 text-[10px]">
                    <AlertCircle className="w-3 h-3 mr-1" /> Pending Verification
                  </Badge>
                )}
              </div>
              {domainRecord.status !== "verified" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="gap-1.5"
                >
                  {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Verify DNS
                </Button>
              )}
            </div>

            {domainRecord.status !== "verified" && domainRecord.dns_records?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Add these CNAME records at your DNS provider, then click "Verify DNS":
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Host</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-3 py-2 w-10">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(domainRecord.dns_records as DnsRecord[]).map((rec, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono text-muted-foreground">{rec.type}</td>
                          <td className="px-3 py-2 font-mono break-all max-w-[200px]">{rec.host}</td>
                          <td className="px-3 py-2 font-mono break-all max-w-[300px]">{rec.data}</td>
                          <td className="px-3 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(rec.data)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {rec.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  DNS propagation can take up to 48 hours. You can check back anytime.
                </p>
              </div>
            )}

            {domainRecord.status === "verified" && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Your domain is verified. Emails sent from <strong>@{domainRecord.domain}</strong> will be authenticated with DKIM & SPF.
                </p>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

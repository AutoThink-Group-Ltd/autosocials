import { useState } from "react";
import {
  Plus, Trash2, Save, Percent, DollarSign, Layers, ShieldBan,
  ToggleLeft, ToggleRight, Pencil, AlertTriangle, Users, Tag, Hash, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCommissionSettings, CommissionTier, CommissionRule } from "@/hooks/useCommissionSettings";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const CURRENCIES = ["USD", "GBP", "EUR", "AUD", "CAD"];

const RULE_TYPE_OPTIONS = [
  { value: "niche", label: "Niche", icon: Tag },
  { value: "keyword", label: "Keyword", icon: Hash },
  { value: "creator_type", label: "Creator Type", icon: Users },
  { value: "platform", label: "Platform", icon: Globe },
];

function formatFollowers(n: number | null | undefined) {
  if (n === null || n === undefined) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const CommissionsPage = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const {
    settings, tiers, rules, loading,
    saveSettings, saveTier, deleteTier,
    saveRule, deleteRule, toggleRule,
  } = useCommissionSettings();

  // Local form state
  const [localSettings, setLocalSettings] = useState(settings);
  const [tierDialog, setTierDialog] = useState<CommissionTier | null>(null);
  const [ruleDialog, setRuleDialog] = useState<CommissionRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "tier" | "rule"; id: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync settings when loaded
  if (settings && !localSettings) setLocalSettings(settings);
  if (settings && localSettings && settings.id && !localSettings.id) setLocalSettings(settings);

  const updateLocal = (field: string, value: any) =>
    setLocalSettings((s) => s ? { ...s, [field]: value } : s);

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setSaving(true);
    await saveSettings(localSettings);
    setSaving(false);
  };

  const handleSaveTier = async () => {
    if (!tierDialog) return;
    await saveTier(tierDialog);
    setTierDialog(null);
  };

  const handleSaveRule = async () => {
    if (!ruleDialog) return;
    await saveRule(ruleDialog);
    setRuleDialog(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "tier") await deleteTier(deleteTarget.id);
    else await deleteRule(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (loading || !localSettings) {
    return (
      <div className="p-6 md:p-8 flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Commission Management</h1>
        <p className="text-muted-foreground mt-1">
          Define default commission rates, tiered structures, and exclusion rules.
          Templates will automatically use these values.
        </p>
      </div>

      <Tabs defaultValue="defaults" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="defaults" className="gap-1.5">
            <Percent className="w-4 h-4" /> Defaults
          </TabsTrigger>
          <TabsTrigger value="tiers" className="gap-1.5">
            <Layers className="w-4 h-4" /> Tiers
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <ShieldBan className="w-4 h-4" /> Rules & Exclusions
          </TabsTrigger>
        </TabsList>

        {/* ── Default Commission ─────────────────────────────── */}
        <TabsContent value="defaults" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Default Commission</CardTitle>
              <CardDescription>
                This is the commission offered to all creators unless overridden by tiers or rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Commission Type</Label>
                  <Select
                    value={localSettings.commission_type}
                    onValueChange={(v) => updateLocal("commission_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat_fee">Flat Fee</SelectItem>
                      <SelectItem value="both">Both (% + Flat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={localSettings.currency}
                    onValueChange={(v) => updateLocal("currency", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(localSettings.commission_type === "percentage" || localSettings.commission_type === "both") && (
                  <div className="space-y-2">
                    <Label>Default Percentage</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={localSettings.default_percentage}
                        onChange={(e) => updateLocal("default_percentage", parseFloat(e.target.value) || 0)}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                )}
                {(localSettings.commission_type === "flat_fee" || localSettings.commission_type === "both") && (
                  <div className="space-y-2">
                    <Label>Default Flat Fee</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {localSettings.currency === "GBP" ? "£" : localSettings.currency === "EUR" ? "€" : "$"}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={localSettings.default_flat_fee}
                        onChange={(e) => updateLocal("default_flat_fee", parseFloat(e.target.value) || 0)}
                        className="pl-7"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 py-2">
                <Switch
                  checked={localSettings.enable_tiers}
                  onCheckedChange={(v) => updateLocal("enable_tiers", v)}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Enable tiered commissions</p>
                  <p className="text-xs text-muted-foreground">Automatically assign different rates based on follower count</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes (internal)</Label>
                <Textarea
                  value={localSettings.notes || ""}
                  onChange={(e) => updateLocal("notes", e.target.value)}
                  placeholder="Internal notes about your commission strategy..."
                  rows={3}
                />
              </div>

              <Button variant="brand" onClick={handleSaveSettings} disabled={saving}>
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? "Saving..." : "Save Defaults"}
              </Button>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="border-border/60 bg-muted/30">
            <CardContent className="pt-5">
              <p className="text-sm font-medium text-foreground mb-2">Template Preview</p>
              <p className="text-sm text-muted-foreground">
                When a template contains <Badge variant="secondary" className="text-xs mx-0.5">{"{commission}"}</Badge>,
                it will be replaced with:{" "}
                <span className="font-semibold text-foreground">
                  {localSettings.commission_type === "percentage" || localSettings.commission_type === "both"
                    ? `${localSettings.default_percentage}%`
                    : ""}
                  {localSettings.commission_type === "both" ? " + " : ""}
                  {localSettings.commission_type === "flat_fee" || localSettings.commission_type === "both"
                    ? `${localSettings.currency === "GBP" ? "£" : localSettings.currency === "EUR" ? "€" : "$"}${localSettings.default_flat_fee}`
                    : ""}
                </span>
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tiers ──────────────────────────────────────── */}
        <TabsContent value="tiers" className="space-y-4">
          {!localSettings.enable_tiers && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Tiers are disabled</p>
                  <p className="text-xs text-muted-foreground">Enable tiered commissions in the Defaults tab to use follower-based rates.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-foreground">Follower-Based Tiers</h3>
              <p className="text-sm text-muted-foreground">Assign different commission rates based on creator audience size</p>
            </div>
            <Button
              variant="brand"
              size="sm"
              onClick={() => setTierDialog({
                workspace_id: workspaceId,
                min_followers: 0,
                max_followers: null,
                commission_type: "percentage",
                percentage: 10,
                flat_fee: 0,
                label: "",
                position: tiers.length,
              })}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Tier
            </Button>
          </div>

          {tiers.length === 0 ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No tiers yet. Add tiers to offer different rates by follower count.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tiers.map((tier) => (
                <Card key={tier.id} className="border-border/60">
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="bg-primary/10 rounded-lg p-2">
                        <Users className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tier.label || `${formatFollowers(tier.min_followers)} – ${formatFollowers(tier.max_followers)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFollowers(tier.min_followers)} – {formatFollowers(tier.max_followers)} followers
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {tier.commission_type === "percentage"
                        ? `${tier.percentage}%`
                        : `$${tier.flat_fee}`}
                    </Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTierDialog(tier)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ type: "tier", id: tier.id! })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Rules & Exclusions ──────────────────────────── */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-foreground">Exclusion & Override Rules</h3>
              <p className="text-sm text-muted-foreground">Override or exclude commissions for specific niches, keywords, or creator types</p>
            </div>
            <Button
              variant="brand"
              size="sm"
              onClick={() => setRuleDialog({
                workspace_id: workspaceId,
                rule_type: "niche",
                match_value: "",
                action: "override",
                override_type: "percentage",
                override_percentage: 0,
                override_flat_fee: 0,
                is_active: true,
                position: rules.length,
              })}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No rules yet. Add rules to override or exclude commissions for specific creator segments.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const typeOpt = RULE_TYPE_OPTIONS.find(o => o.value === rule.rule_type);
                const TypeIcon = typeOpt?.icon || Tag;
                return (
                  <Card key={rule.id} className={`border-border/60 ${!rule.is_active ? "opacity-50" : ""}`}>
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`rounded-lg p-2 ${rule.action === "zero" ? "bg-destructive/10" : "bg-accent"}`}>
                          <TypeIcon className={`w-4 h-4 ${rule.action === "zero" ? "text-destructive" : "text-accent-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {typeOpt?.label}: <span className="font-normal">{rule.match_value}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {rule.action === "zero"
                              ? "No commission offered"
                              : `Override → ${rule.override_type === "percentage" ? `${rule.override_percentage}%` : `$${rule.override_flat_fee}`}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleRule(rule.id!, !rule.is_active)}
                        >
                          {rule.is_active
                            ? <ToggleRight className="w-4 h-4 text-primary" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRuleDialog(rule)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ type: "rule", id: rule.id! })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Tier Dialog ───────────────────────────────── */}
      <Dialog open={!!tierDialog} onOpenChange={(o) => !o && setTierDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tierDialog?.id ? "Edit Tier" : "New Tier"}</DialogTitle>
          </DialogHeader>
          {tierDialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input value={tierDialog.label} onChange={(e) => setTierDialog({ ...tierDialog, label: e.target.value })} placeholder="e.g. Nano creators" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min Followers</Label>
                  <Input type="number" min={0} value={tierDialog.min_followers} onChange={(e) => setTierDialog({ ...tierDialog, min_followers: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Followers</Label>
                  <Input type="number" min={0} value={tierDialog.max_followers ?? ""} onChange={(e) => setTierDialog({ ...tierDialog, max_followers: e.target.value ? parseInt(e.target.value) : null })} placeholder="∞ (unlimited)" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Commission Type</Label>
                <Select value={tierDialog.commission_type} onValueChange={(v) => setTierDialog({ ...tierDialog, commission_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_fee">Flat Fee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tierDialog.commission_type === "percentage" ? (
                <div className="space-y-2">
                  <Label>Percentage</Label>
                  <div className="relative">
                    <Input type="number" min={0} max={100} step={0.5} value={tierDialog.percentage} onChange={(e) => setTierDialog({ ...tierDialog, percentage: parseFloat(e.target.value) || 0 })} className="pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Flat Fee</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input type="number" min={0} step={1} value={tierDialog.flat_fee} onChange={(e) => setTierDialog({ ...tierDialog, flat_fee: parseFloat(e.target.value) || 0 })} className="pl-7" />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTierDialog(null)}>Cancel</Button>
            <Button variant="brand" onClick={handleSaveTier}>Save Tier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rule Dialog ───────────────────────────────── */}
      <Dialog open={!!ruleDialog} onOpenChange={(o) => !o && setRuleDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ruleDialog?.id ? "Edit Rule" : "New Rule"}</DialogTitle>
          </DialogHeader>
          {ruleDialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rule Type</Label>
                <Select value={ruleDialog.rule_type} onValueChange={(v) => setRuleDialog({ ...ruleDialog, rule_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Match Value</Label>
                <Input
                  value={ruleDialog.match_value}
                  onChange={(e) => setRuleDialog({ ...ruleDialog, match_value: e.target.value })}
                  placeholder={
                    ruleDialog.rule_type === "niche" ? "e.g. gaming, fitness"
                    : ruleDialog.rule_type === "keyword" ? "e.g. controversial, political"
                    : ruleDialog.rule_type === "platform" ? "e.g. tiktok, instagram"
                    : "e.g. micro, nano"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={ruleDialog.action} onValueChange={(v) => setRuleDialog({ ...ruleDialog, action: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="override">Override with custom rate</SelectItem>
                    <SelectItem value="zero">No commission (exclude)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ruleDialog.action === "override" && (
                <>
                  <div className="space-y-2">
                    <Label>Override Type</Label>
                    <Select value={ruleDialog.override_type} onValueChange={(v) => setRuleDialog({ ...ruleDialog, override_type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="flat_fee">Flat Fee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {ruleDialog.override_type === "percentage" ? (
                    <div className="space-y-2">
                      <Label>Override Percentage</Label>
                      <div className="relative">
                        <Input type="number" min={0} max={100} step={0.5} value={ruleDialog.override_percentage} onChange={(e) => setRuleDialog({ ...ruleDialog, override_percentage: parseFloat(e.target.value) || 0 })} className="pr-8" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Override Flat Fee</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input type="number" min={0} step={1} value={ruleDialog.override_flat_fee} onChange={(e) => setRuleDialog({ ...ruleDialog, override_flat_fee: parseFloat(e.target.value) || 0 })} className="pl-7" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(null)}>Cancel</Button>
            <Button variant="brand" onClick={handleSaveRule}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CommissionsPage;

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Settings, Building2, CreditCard, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { AGENCY_LOGO_EVENT } from "@/features/agency/useAgencyLogo";

const AgencySettingsPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    agency_name: "",
    agency_website: "",
    contact_name: "",
    contact_email: "",
    phone: "",
    booking_url: "",
    payout_method: "",
    payout_email: "",
    paypal_email: "",
    bank_account_name: "",
    bank_account_number: "",
    bank_sort_code: "",
    bank_iban: "",
  });
  const [profileId, setProfileId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const onLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }
    setUploadingLogo(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/agency-logo.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("Upload failed: " + error.message); setUploadingLogo(false); return; }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    const { error: dbErr } = profileId
      ? await supabase.from("agency_profiles").update({ agency_logo_url: url, updated_at: new Date().toISOString() }).eq("id", profileId)
      : await supabase.from("agency_profiles").insert({ user_id: user.id, agency_name: form.agency_name || "My agency", agency_logo_url: url });
    if (dbErr) toast.error(dbErr.message);
    else {
      setLogoUrl(url);
      window.dispatchEvent(new CustomEvent(AGENCY_LOGO_EVENT, { detail: url }));
      toast.success("Agency logo updated");
      if (!profileId) loadProfile();
    }
    setUploadingLogo(false);
  };

  useEffect(() => {
    if (user) loadProfile();
  }, [user?.id]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("agency_profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setProfileId(data.id);
      setLogoUrl(data.agency_logo_url || "");
      setForm({
        agency_name: data.agency_name || "",
        agency_website: data.agency_website || "",
        contact_name: data.contact_name || "",
        contact_email: data.contact_email || "",
        phone: data.phone || "",
        booking_url: data.booking_url || "",
        payout_method: data.payout_method || "",
        payout_email: data.payout_email || "",
        paypal_email: data.paypal_email || "",
        bank_account_name: data.bank_account_name || "",
        bank_account_number: data.bank_account_number || "",
        bank_sort_code: data.bank_sort_code || "",
        bank_iban: data.bank_iban || "",
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (profileId) {
      const { error } = await supabase
        .from("agency_profiles")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (error) toast.error(error.message);
      else toast.success("Settings saved");
    } else {
      const { error } = await supabase
        .from("agency_profiles")
        .insert({ user_id: user!.id, ...form });
      if (error) toast.error(error.message);
      else {
        toast.success("Agency profile created");
        loadProfile();
      }
    }
    setSaving(false);
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Agency Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your agency profile and payout details</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5 text-foreground" /> Agency Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-5 pb-2">
            <button type="button" onClick={() => logoRef.current?.click()} disabled={uploadingLogo} aria-label="Change agency logo"
              className="relative group h-16 w-16 rounded-xl overflow-hidden border border-border bg-ink flex items-center justify-center">
              {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="w-6 h-6 text-inverse" />}
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingLogo ? <Loader2 className="w-5 h-5 animate-spin text-background" /> : <Camera className="w-5 h-5 text-background" />}
              </span>
            </button>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogoUpload} />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Agency logo</p>
              <p className="text-xs text-muted-foreground">Shown in your switcher. JPG, PNG or WebP, max 5MB.</p>
              <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? "Uploading…" : "Upload logo"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agency Name</Label>
              <Input value={form.agency_name} onChange={(e) => update("agency_name", e.target.value)} placeholder="Your Agency" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.agency_website} onChange={(e) => update("agency_website", e.target.value)} placeholder="https://youragency.com" />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} placeholder="hello@agency.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+44 7123 456789" />
            </div>
            <div className="space-y-2">
              <Label>Booking URL</Label>
              <Input value={form.booking_url} onChange={(e) => update("booking_url", e.target.value)} placeholder="https://cal.com/you" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-foreground" /> Payout Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payout Email</Label>
              <Input type="email" value={form.payout_email} onChange={(e) => update("payout_email", e.target.value)} placeholder="finance@agency.com" />
            </div>
            <div className="space-y-2">
              <Label>PayPal Email</Label>
              <Input type="email" value={form.paypal_email} onChange={(e) => update("paypal_email", e.target.value)} placeholder="paypal@agency.com" />
            </div>
            <div className="space-y-2">
              <Label>Bank Account Name</Label>
              <Input value={form.bank_account_name} onChange={(e) => update("bank_account_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={form.bank_account_number} onChange={(e) => update("bank_account_number", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sort Code</Label>
              <Input value={form.bank_sort_code} onChange={(e) => update("bank_sort_code", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input value={form.bank_iban} onChange={(e) => update("bank_iban", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button variant="default" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
};

export default AgencySettingsPage;

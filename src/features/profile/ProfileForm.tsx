import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Storage path for a user's own avatar — always the signed-in user's folder. */
export function avatarPath(userId: string, fileName: string) {
  const ext = (fileName.split(".").pop() || "png").toLowerCase();
  return `${userId}/avatar.${ext}`;
}

/** Edits the signed-in user's own profile (photo + name). Used in workspace and agency settings. */
export function ProfileForm() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setAvatarUrl(profile?.avatar_url || "");
  }, [profile?.full_name, profile?.avatar_url]);

  const email = user?.email || "";
  const initials = (fullName || email || "U").slice(0, 2).toUpperCase();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }
    setUploading(true);
    const path = avatarPath(user.id, file.name);
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error("Upload failed: " + error.message); setUploading(false); return; }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    const { error: upErr } = await supabase.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (upErr) toast.error(upErr.message);
    else { setAvatarUrl(url); await refreshProfile(); toast.success("Photo updated"); }
    setUploading(false);
  };

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (error) toast.error(error.message);
    else { await refreshProfile(); toast.success("Profile updated"); }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative group h-20 w-20 rounded-full overflow-hidden border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Change profile photo"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-secondary font-display text-xl font-bold text-foreground">{initials}</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-background" /> : <Camera className="h-5 w-5 text-background" />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Profile photo</p>
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max 5MB.</p>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload new photo"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pf-name">Full name</Label>
          <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-email">Email</Label>
          <Input id="pf-email" value={email} disabled />
          <p className="text-[11px] text-muted-foreground">Email cannot be changed</p>
        </div>
      </div>
      <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}

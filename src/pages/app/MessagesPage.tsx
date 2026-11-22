import { useState, useEffect, useMemo, useCallback } from "react";
import { CreatorProfileDialog } from "@/components/app/CreatorProfileDialog";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  Send, Search, Loader2, Mail, Plus, ArrowLeft,
  CheckCircle2, AlertCircle, Clock, ExternalLink,
  Reply, Inbox, MailOpen, MessageSquare, Trash2,
  FolderPlus, Folder, FolderOpen, MoreHorizontal,
  MoveRight, Edit2, X, Sparkles, RefreshCw,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SentEmail {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string | null;
  message_id: string | null;
  status: string;
  sent_at: string;
  folder_id: string | null;
}

interface EmailReply {
  id: string;
  original_message_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  folder_id: string | null;
}

interface SenderIdentity {
  id: string;
  sender_name: string;
  sender_email: string;
  is_default: boolean;
  is_verified: boolean;
}

interface EmailFolder {
  id: string;
  name: string;
  color: string;
  position: number;
}

type View = "inbox" | "sent" | "replies" | "compose" | "folder";

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Sent", color: "text-blue-500", icon: Send },
  delivered: { label: "Delivered", color: "text-emerald-500", icon: CheckCircle2 },
  opened: { label: "Opened", color: "text-emerald-600", icon: MailOpen },
  bounced: { label: "Bounced", color: "text-destructive", icon: AlertCircle },
  failed: { label: "Failed", color: "text-destructive", icon: AlertCircle },
};

const FOLDER_COLORS = [
  { value: "gray", label: "Gray", class: "bg-gray-500" },
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "green", label: "Green", class: "bg-emerald-500" },
  { value: "purple", label: "Purple", class: "bg-purple-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "red", label: "Red", class: "bg-red-500" },
];

function getFolderColorClass(color: string) {
  return FOLDER_COLORS.find(c => c.value === color)?.class || "bg-gray-500";
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'img', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height'],
  });
}

const MessagesPage = () => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [view, setView] = useState<View>("inbox");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [identities, setIdentities] = useState<SenderIdentity[]>([]);
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [emailsPage, setEmailsPage] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [selectedIdentity, setSelectedIdentity] = useState<string>("");
  const [sending, setSending] = useState(false);

  // Thread view
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null);
  const [emailReplies, setEmailReplies] = useState<EmailReply[]>([]);
  const [threadSentReplies, setThreadSentReplies] = useState<SentEmail[]>([]);

  // Reply-from-thread state
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: "email" | "reply"; id: string } | null>(null);

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<EmailFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("gray");

  // Creator profile dialog
  const [creatorProfiles, setCreatorProfiles] = useState<any[]>([]);
  const [creatorDialogCreatorId, setCreatorDialogCreatorId] = useState<string | null>(null);
  const [loadingCreatorProfiles, setLoadingCreatorProfiles] = useState(false);
  const [addingToCollab, setAddingToCollab] = useState(false);

  const unreadCount = useMemo(() => replies.filter(r => !r.is_read).length, [replies]);

  // Look up creator profiles by name/email when thread opens
  const lookupCreatorProfiles = useCallback(async (email: SentEmail) => {
    setCreatorProfiles([]);
    setLoadingCreatorProfiles(true);
    try {
      const name = email.to_name?.toLowerCase().replace(/\s+/g, '') || '';
      const emailAddr = email.to_email?.toLowerCase() || '';

      // Search by contact_email or username match
      const queries = [];
      if (emailAddr) {
        queries.push(
          supabase.from('creator_profiles')
            .select('*')
            .ilike('contact_email', emailAddr)
            .limit(5)
        );
      }
      if (name) {
        queries.push(
          supabase.from('creator_profiles')
            .select('*')
            .ilike('username', `%${name}%`)
            .limit(5)
        );
        queries.push(
          supabase.from('creator_profiles')
            .select('*')
            .ilike('display_name', `%${email.to_name || ''}%`)
            .limit(5)
        );
      }

      const results = await Promise.all(queries);
      const allProfiles = results.flatMap(r => (r.data || []) as any[]);
      // Deduplicate by id
      const unique = Array.from(new Map(allProfiles.map(p => [p.id, p])).values());
      setCreatorProfiles(unique);
    } catch (e) {
      console.error('Creator profile lookup failed:', e);
    }
    setLoadingCreatorProfiles(false);
  }, []);

  const fetchData = async (isRefresh = false) => {
    if (!workspaceId) return;
    if (!isRefresh) setLoading(true);

    const [emailsRes, repliesRes, identitiesRes, foldersRes] = await Promise.all([
      supabase
        .from("email_send_log")
        .select("id, to_email, to_name, subject, message_id, status, sent_at, folder_id")
        .eq("workspace_id", workspaceId)
        .order("sent_at", { ascending: false })
        .range(0, PAGE_SIZE - 1),
      supabase
        .from("email_replies")
        .select("id, original_message_id, from_email, from_name, subject, body_text, body_html, received_at, is_read, folder_id")
        .eq("workspace_id", workspaceId)
        .order("received_at", { ascending: false })
        .limit(500),
      supabase
        .from("sender_identities")
        .select("id, sender_name, sender_email, is_default, is_verified")
        .eq("workspace_id", workspaceId)
        .order("is_default", { ascending: false }),
      supabase
        .from("email_folders")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("position", { ascending: true }),
    ]);

    const emails = (emailsRes.data as unknown as SentEmail[]) || [];
    const fetchedReplies = (repliesRes.data as unknown as EmailReply[]) || [];
    setReplies(fetchedReplies);

    // Find reply message_ids not covered by the paginated sent emails
    const loadedMessageIds = new Set(emails.filter(e => e.message_id).map(e => e.message_id));
    const missingMessageIds = [...new Set(
      fetchedReplies
        .map(r => r.original_message_id)
        .filter((mid): mid is string => !!mid && !loadedMessageIds.has(mid))
    )];

    let allEmails = emails;
    if (missingMessageIds.length > 0) {
      // Fetch the sent emails that correspond to replies but weren't in the first page
      const { data: extraEmails } = await supabase
        .from("email_send_log")
        .select("id, to_email, to_name, subject, message_id, status, sent_at, folder_id")
        .eq("workspace_id", workspaceId)
        .in("message_id", missingMessageIds);
      if (extraEmails?.length) {
        const extraTyped = extraEmails as unknown as SentEmail[];
        const existingIds = new Set(emails.map(e => e.id));
        allEmails = [...emails, ...extraTyped.filter(e => !existingIds.has(e.id))];
      }
    }

    setSentEmails(allEmails);
    setHasMoreEmails(emails.length >= PAGE_SIZE);
    setEmailsPage(1);
    const ids = (identitiesRes.data as unknown as SenderIdentity[]) || [];
    setIdentities(ids);
    if (ids.length > 0 && !selectedIdentity) {
      const defaultId = ids.find((i) => i.is_default)?.id || ids[0]?.id;
      if (defaultId) setSelectedIdentity(defaultId);
    }
    setFolders((foldersRes.data as unknown as EmailFolder[]) || []);
    setLoading(false);
  };

  const loadMoreEmails = async () => {
    if (!workspaceId || loadingMore) return;
    setLoadingMore(true);
    const from = emailsPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("email_send_log")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: false })
      .range(from, to);
    const more = (data as unknown as SentEmail[]) || [];
    setSentEmails((prev) => [...prev, ...more]);
    setHasMoreEmails(more.length >= PAGE_SIZE);
    setEmailsPage((p) => p + 1);
    setLoadingMore(false);
  };

  useEffect(() => {
    fetchData();
  }, [workspaceId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`messages-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_replies', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const newReply = payload.new as EmailReply;
          setReplies((prev) => [newReply, ...prev]);
          if (selectedEmail?.message_id === newReply.original_message_id) {
            setEmailReplies((prev) => [...prev, newReply]);
          }
          toast.info("New reply received!", { description: `From ${newReply.from_name || newReply.from_email}` });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_send_log', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const newEmail = payload.new as SentEmail;
          setSentEmails((prev) => {
            const existing = prev.find(e => e.message_id && e.message_id === newEmail.message_id);
            if (existing) {
              return prev.map(e => e.message_id === newEmail.message_id ? { ...e, status: newEmail.status } : e);
            }
            return [newEmail, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, selectedEmail?.message_id]);

  const handleSend = async () => {
    if (!workspaceId || !toEmail || !subject || !bodyText) {
      toast.error("Fill in recipient, subject, and message body");
      return;
    }
    setSending(true);
    const htmlBody = bodyText
      .split("\n")
      .map((line) =>
        line.trim() === "" ? `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333;">&nbsp;</p>` : `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333;">${line}</p>`
      )
      .join("");

    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          workspace_id: workspaceId,
          to_email: toEmail.trim(),
          to_name: toName.trim() || null,
          subject: subject.trim(),
          body_html: htmlBody,
          sender_identity_id: selectedIdentity || null,
          confirmed: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Email sent to ${toEmail}`);
      setComposeOpen(false);
      setToEmail(""); setToName(""); setSubject(""); setBodyText("");
      fetchData(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    }
    setSending(false);
  };

  const handleReplyFromThread = async () => {
    if (!workspaceId || !selectedEmail || !replyText.trim()) return;
    setReplySending(true);
    const replySubject = selectedEmail.subject.startsWith("Re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject}`;
    const htmlBody = replyText
      .split("\n")
      .map((line) =>
        line.trim() === "" ? `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333;">&nbsp;</p>` : `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#333;">${line}</p>`
      )
      .join("");

    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          workspace_id: workspaceId,
          to_email: selectedEmail.to_email,
          to_name: selectedEmail.to_name,
          subject: replySubject,
          body_html: htmlBody,
          sender_identity_id: selectedIdentity || null,
          confirmed: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Reply sent!");
      // Add to thread sent replies immediately
      const newSentReply: SentEmail = {
        id: data?.message_id || crypto.randomUUID(),
        to_email: selectedEmail.to_email,
        to_name: selectedEmail.to_name,
        subject: replySubject,
        body_html: htmlBody,
        message_id: data?.message_id || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
        folder_id: selectedEmail.folder_id,
      };
      setThreadSentReplies(prev => [...prev, newSentReply]);
      setReplyText("");
      fetchData(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to send reply");
    }
    setReplySending(false);
  };

  const generateAiReply = async (email: SentEmail, threadReplies: EmailReply[]) => {
    if (threadReplies.length === 0) return;
    setAiGenerating(true);
    try {
      const latestReply = threadReplies[threadReplies.length - 1];
      if (!latestReply) { setAiGenerating(false); return; }
      const replyContent = latestReply.body_text || latestReply.body_html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
      if (!replyContent) { setAiGenerating(false); return; }

      const originalBody = email.body_html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
      const senderIdentity = identities.find(i => i.id === selectedIdentity) || identities.find(i => i.is_default);

      const creatorName = latestReply.from_name || email.to_name || null;

      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          workspace_id: workspaceId,
          original_subject: email.subject,
          original_body: originalBody,
          creator_reply_text: replyContent,
          creator_name: creatorName,
          sender_name: senderIdentity?.sender_name || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.reply) setReplyText(data.reply);
    } catch (e: any) {
      console.error("AI reply generation failed:", e);
      // Silent fail - user can still type manually
    }
    setAiGenerating(false);
  };

  const handleAddToCollaborations = async (email: SentEmail) => {
    if (!workspaceId) return;
    setAddingToCollab(true);
    try {
      // Fetch (or seed) the first column
      let { data: cols } = await supabase
        .from("collaboration_columns")
        .select("id")
        .eq("workspace_id", workspaceId)
        .order("position")
        .limit(1);

      if (!cols || cols.length === 0) {
        // Seed default columns
        const defaults = [
          { title: "Contacted", color: "blue", position: 0, workspace_id: workspaceId },
          { title: "Replied", color: "yellow", position: 1, workspace_id: workspaceId },
          { title: "Interested", color: "purple", position: 2, workspace_id: workspaceId },
          { title: "Content in Progress", color: "orange", position: 3, workspace_id: workspaceId },
          { title: "Delivered", color: "green", position: 4, workspace_id: workspaceId },
        ];
        const { data: seeded } = await supabase
          .from("collaboration_columns")
          .insert(defaults)
          .select("id")
          .order("position");
        cols = seeded;
      }

      if (!cols || cols.length === 0) {
        toast.error("Could not create collaboration board");
        setAddingToCollab(false);
        return;
      }

      const firstColumnId = cols[0]?.id;
      if (!firstColumnId) { toast.error("Could not create collaboration board"); setAddingToCollab(false); return; }
      const creatorName = email.to_name || email.to_email;
      const creatorHandle = creatorProfiles[0]?.username || null;
      const creatorAvatar = creatorProfiles[0]?.avatar_url || null;

      // Check if already added
      const { data: existing } = await supabase
        .from("collaboration_cards")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("creator_name", creatorName)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.info(`${creatorName} is already in Collaborations`);
        setAddingToCollab(false);
        return;
      }

      const { error } = await supabase
        .from("collaboration_cards")
        .insert({
          column_id: firstColumnId,
          workspace_id: workspaceId,
          creator_name: creatorName,
          creator_handle: creatorHandle,
          creator_avatar_url: creatorAvatar,
          position: 0,
          notes: `Added from outreach: ${email.subject}`,
        });

      if (error) throw error;
      toast.success(`${creatorName} added to Collaborations!`);
    } catch (e: any) {
      toast.error(e.message || "Failed to add to collaborations");
    }
    setAddingToCollab(false);
  };

  const openThread = async (email: SentEmail) => {
    // Fetch full body_html on demand if not already loaded
    let fullEmail = email;
    if (!email.body_html) {
      const { data } = await supabase
        .from("email_send_log")
        .select("body_html")
        .eq("id", email.id)
        .maybeSingle();
      if (data) {
        fullEmail = { ...email, body_html: data.body_html };
        setSentEmails(prev => prev.map(e => e.id === email.id ? fullEmail : e));
      }
    }
    setSelectedEmail(fullEmail);
    const threadReplies = replies.filter(
      (r) => r.original_message_id === email.message_id
    );
    setEmailReplies(threadReplies);
    setReplyText("");

    // Load sent replies for this thread (emails with Re: subject to same recipient)
    const threadSent = sentEmails.filter(
      (e) => e.id !== email.id && e.to_email === email.to_email && e.subject?.startsWith("Re:")
    );
    setThreadSentReplies(threadSent);

    // Mark replies as read
    const unreadIds = threadReplies.filter(r => !r.is_read).map(r => r.id);
    if (unreadIds.length > 0) {
      await supabase
        .from("email_replies")
        .update({ is_read: true } as any)
        .in("id", unreadIds);
      setReplies(prev => prev.map(r => unreadIds.includes(r.id) ? { ...r, is_read: true } : r));
    }

    // Look up creator profiles
    lookupCreatorProfiles(fullEmail);

    // Auto-generate AI reply if there are replies from creators
    if (threadReplies.length > 0) {
      generateAiReply(fullEmail, threadReplies);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    if (type === "email") {
      // Delete the email and its replies
      const email = sentEmails.find(e => e.id === id);
      if (email?.message_id) {
        await supabase.from("email_replies").delete().eq("original_message_id", email.message_id);
      }
      await supabase.from("email_send_log").delete().eq("id", id);
      setSentEmails(prev => prev.filter(e => e.id !== id));
      if (email?.message_id) {
        setReplies(prev => prev.filter(r => r.original_message_id !== email.message_id));
      }
      if (selectedEmail?.id === id) setSelectedEmail(null);
      toast.success("Email deleted");
    } else {
      await supabase.from("email_replies").delete().eq("id", id);
      setReplies(prev => prev.filter(r => r.id !== id));
      setEmailReplies(prev => prev.filter(r => r.id !== id));
      toast.success("Reply deleted");
    }
    setDeleteTarget(null);
  };

  // Move to folder
  const moveEmailToFolder = async (emailId: string, folderId: string | null) => {
    await supabase.from("email_send_log").update({ folder_id: folderId } as any).eq("id", emailId);
    setSentEmails(prev => prev.map(e => e.id === emailId ? { ...e, folder_id: folderId } : e));
    // Also move associated replies
    const email = sentEmails.find(e => e.id === emailId);
    if (email?.message_id) {
      await supabase.from("email_replies").update({ folder_id: folderId } as any).eq("original_message_id", email.message_id);
      setReplies(prev => prev.map(r => r.original_message_id === email.message_id ? { ...r, folder_id: folderId } : r));
    }
    toast.success(folderId ? `Moved to ${folders.find(f => f.id === folderId)?.name}` : "Moved to Inbox");
  };

  // Folder CRUD
  const saveFolder = async () => {
    if (!workspaceId || !folderName.trim()) return;
    if (editingFolder) {
      await supabase.from("email_folders").update({ name: folderName.trim(), color: folderColor } as any).eq("id", editingFolder.id);
    } else {
      await supabase.from("email_folders").insert({
        workspace_id: workspaceId,
        name: folderName.trim(),
        color: folderColor,
        position: folders.length,
      } as any);
    }
    setFolderDialogOpen(false);
    setEditingFolder(null);
    setFolderName("");
    setFolderColor("gray");
    fetchData(true);
  };

  const deleteFolder = async (folderId: string) => {
    // Move all emails in folder back to no folder
    await supabase.from("email_send_log").update({ folder_id: null } as any).eq("folder_id", folderId);
    await supabase.from("email_replies").update({ folder_id: null } as any).eq("folder_id", folderId);
    await supabase.from("email_folders").delete().eq("id", folderId);
    setSentEmails(prev => prev.map(e => e.folder_id === folderId ? { ...e, folder_id: null } : e));
    setReplies(prev => prev.map(r => r.folder_id === folderId ? { ...r, folder_id: null } : r));
    if (selectedFolderId === folderId) {
      setView("inbox");
      setSelectedFolderId(null);
    }
    fetchData(true);
    toast.success("Folder deleted");
  };

  const filteredEmails = sentEmails.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.to_email.toLowerCase().includes(q) ||
      (e.to_name || "").toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q)
    );
  });

  const repliedMessageIds = new Set(replies.map((r) => r.original_message_id));
  const inboxEmails = sentEmails.filter(
    (e) => e.message_id && repliedMessageIds.has(e.message_id) && !e.folder_id
  );

  const repliesViewEmails = sentEmails.filter(
    (e) => e.message_id && repliedMessageIds.has(e.message_id)
  );

  const folderEmails = selectedFolderId
    ? sentEmails.filter(e => e.folder_id === selectedFolderId)
    : [];

  // Count emails per folder (including those with replies)
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sentEmails.forEach(e => {
      if (e.folder_id) {
        counts[e.folder_id] = (counts[e.folder_id] || 0) + 1;
      }
    });
    return counts;
  }, [sentEmails]);

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0 overflow-x-auto">
        <Button variant="brand" size="sm" className="gap-1.5 shrink-0" onClick={() => setComposeOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Compose
        </Button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setView("inbox"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              view === "inbox" ? "bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0 min-w-[16px]">{unreadCount}</Badge>
            )}
          </button>
          <button
            onClick={() => { setView("replies"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              view === "replies" ? "bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
          >
            <Reply className="w-3.5 h-3.5" />
            Replies
            {repliesViewEmails.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0">{repliesViewEmails.length}</Badge>
            )}
          </button>
          <button
            onClick={() => { setView("sent"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              view === "sent" ? "bg-primary/10 text-primary" : "text-muted-foreground"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Sent
            <Badge variant="secondary" className="text-[9px] px-1 py-0">{sentEmails.length}</Badge>
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => { setView("folder"); setSelectedFolderId(f.id); setSelectedEmail(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                view === "folder" && selectedFolderId === f.id ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${getFolderColorClass(f.color)}`} />
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-56 border-r border-border flex-col bg-card">
        <div className="p-3 border-b border-border">
          <Button variant="brand" size="sm" className="w-full gap-1.5" onClick={() => setComposeOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Compose
          </Button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => { setView("inbox"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              view === "inbox"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Inbox className="w-4 h-4" />
            Inbox
            {unreadCount > 0 ? (
              <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 min-w-[20px]">
                {unreadCount}
              </Badge>
            ) : inboxEmails.length > 0 ? (
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                {inboxEmails.length}
              </Badge>
            ) : null}
          </button>
          <button
            onClick={() => { setView("replies"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              view === "replies"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Reply className="w-4 h-4" />
            Replies
            {repliesViewEmails.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                {repliesViewEmails.length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => { setView("sent"); setSelectedEmail(null); setSelectedFolderId(null); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              view === "sent"
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            <Send className="w-4 h-4" />
            Sent
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {sentEmails.length}
            </Badge>
          </button>

          {/* Folders */}
          {folders.length > 0 && (
            <div className="pt-2">
              <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Folders</p>
              {folders.map(f => (
                <div key={f.id} className="group flex items-center">
                  <button
                    onClick={() => { setView("folder"); setSelectedFolderId(f.id); setSelectedEmail(null); }}
                    className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      view === "folder" && selectedFolderId === f.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${getFolderColorClass(f.color)}`} />
                    <span className="truncate">{f.name}</span>
                    {(folderCounts[f.id] || 0) > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                        {folderCounts[f.id]}
                      </Badge>
                    )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary mr-1 transition-opacity">
                        <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem onClick={() => {
                        setEditingFolder(f);
                        setFolderName(f.name);
                        setFolderColor(f.color);
                        setFolderDialogOpen(true);
                      }}>
                        <Edit2 className="w-3 h-3 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteFolder(f.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              setEditingFolder(null);
              setFolderName("");
              setFolderColor("gray");
              setFolderDialogOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </button>
        </nav>
        <div className="p-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            {identities.length === 0 ? (
              <span>
                No sender set up.{" "}
                <a href="/app/settings" className="text-primary hover:underline">Add one →</a>
              </span>
            ) : (
              <>Sending as: {identities.find((i) => i.id === selectedIdentity)?.sender_email || "—"}</>
            )}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {selectedEmail && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedEmail(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <h2 className="text-sm font-semibold text-foreground truncate">
              {selectedEmail
                ? selectedEmail.subject
                : view === "inbox"
                ? "Inbox — Replies"
                : view === "replies"
                ? "Replies"
                : view === "folder"
                ? folders.find(f => f.id === selectedFolderId)?.name || "Folder"
                : "Sent Emails"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {selectedEmail && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {folders.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <MoveRight className="w-3 h-3 mr-2" /> Move to folder
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => moveEmailToFolder(selectedEmail.id, null)}>
                          <Inbox className="w-3 h-3 mr-2" /> Inbox (remove folder)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {folders.map(f => (
                          <DropdownMenuItem key={f.id} onClick={() => moveEmailToFolder(selectedEmail.id, f.id)}>
                            <div className={`w-2.5 h-2.5 rounded-full mr-2 ${getFolderColorClass(f.color)}`} />
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteTarget({ type: "email", id: selectedEmail.id })}
                  >
                    <Trash2 className="w-3 h-3 mr-2" /> Delete email
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!selectedEmail && (
              <div className="relative w-40 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedEmail ? (
            // Thread view
            <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
              {/* Creator profile pills */}
              {creatorProfiles.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Profiles:</span>
                  {creatorProfiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => setCreatorDialogCreatorId(profile.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-card hover:bg-secondary/80 transition-colors"
                    >
                      {profile.platform === 'tiktok' ? (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.77 1.52V6.84a4.84 4.84 0 01-1-.15z"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                      )}
                      <span>@{profile.username}</span>
                      {profile.follower_count && (
                        <span className="text-muted-foreground">
                          {profile.follower_count >= 1000000
                            ? `${(profile.follower_count / 1000000).toFixed(1)}M`
                            : profile.follower_count >= 1000
                            ? `${(profile.follower_count / 1000).toFixed(1)}K`
                            : profile.follower_count}
                        </span>
                      )}
                    </button>
                  ))}
                  {loadingCreatorProfiles && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </div>
              )}

              {/* Add to Collaborations button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={addingToCollab}
                  onClick={() => handleAddToCollaborations(selectedEmail)}
                >
                  {addingToCollab ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add to Collaborations
                </Button>
              </div>

              <div className="rounded-lg border border-border p-4 bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      To: <span className="text-foreground">{selectedEmail.to_name || selectedEmail.to_email}</span>
                      {selectedEmail.to_name && (
                        <span className="text-muted-foreground ml-1">({selectedEmail.to_email})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedEmail.status} />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(selectedEmail.sent_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                {selectedEmail.body_html && (
                  <div
                    className="text-sm text-foreground prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedEmail.body_html) }}
                  />
                )}
              </div>

              {/* Thread timeline (inbound replies + sent replies merged by time) */}
              {(() => {
                const timeline: Array<{ type: 'inbound'; data: EmailReply } | { type: 'sent'; data: SentEmail }> = [
                  ...emailReplies.map(r => ({ type: 'inbound' as const, data: r, time: new Date(r.received_at).getTime() })),
                  ...threadSentReplies.map(e => ({ type: 'sent' as const, data: e, time: new Date(e.sent_at).getTime() })),
                ].sort((a, b) => a.time - b.time);

                if (timeline.length === 0) {
                  return <p className="text-xs text-muted-foreground text-center py-4">No replies yet</p>;
                }

                const senderIdentity = identities.find(i => i.id === selectedIdentity) || identities.find(i => i.is_default);

                return (
                  <>
                    <Separator />
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Reply className="w-3.5 h-3.5" /> {timeline.length} {timeline.length === 1 ? "Reply" : "Replies"}
                    </p>
                    {timeline.map((item) => {
                      if (item.type === 'inbound') {
                        const reply = item.data as EmailReply;
                        return (
                          <div key={`reply-${reply.id}`} className="rounded-lg border border-primary/20 bg-primary/5 p-4 group relative">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs text-foreground font-medium">
                                {reply.from_name || reply.from_email}
                                {reply.from_name && (
                                  <span className="text-muted-foreground font-normal ml-1">({reply.from_email})</span>
                                )}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(reply.received_at).toLocaleString()}
                                </span>
                                <button
                                  onClick={() => setDeleteTarget({ type: "reply", id: reply.id })}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                  title="Delete reply"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {reply.body_html ? (
                              <div
                                className="text-sm text-foreground prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(reply.body_html) }}
                              />
                            ) : (
                              <p className="text-sm text-foreground whitespace-pre-wrap">{reply.body_text}</p>
                            )}
                          </div>
                        );
                      } else {
                        const sent = item.data as SentEmail;
                        return (
                          <div key={`sent-${sent.id}`} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs text-foreground font-medium flex items-center gap-1.5">
                                <Send className="w-3 h-3 text-primary" />
                                {senderIdentity?.sender_name || "You"}
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0">Sent</Badge>
                              </p>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(sent.sent_at).toLocaleString()}
                              </span>
                            </div>
                            {sent.body_html && (
                              <div
                                className="text-sm text-foreground prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(sent.body_html) }}
                              />
                            )}
                          </div>
                        );
                      }
                    })}
                  </>
                );
              })()}

              {/* Reply from thread */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" /> Reply
                  </p>
                  {emailReplies.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => selectedEmail && generateAiReply(selectedEmail, emailReplies)}
                      disabled={aiGenerating}
                    >
                      {aiGenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {aiGenerating ? "Generating..." : "AI Suggest"}
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={aiGenerating ? "AI is drafting a reply..." : `Reply to ${selectedEmail.to_name || selectedEmail.to_email}...`}
                    rows={8}
                    className={`resize-y text-sm min-h-[160px] ${aiGenerating ? 'opacity-50' : ''}`}
                    disabled={aiGenerating}
                  />
                  {aiGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/30 rounded-md">
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        <span>AI is drafting a reply...</span>
                      </div>
                    </div>
                  )}
                </div>
                {replyText && !aiGenerating && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI-suggested reply — edit as needed. Your signature will be appended automatically.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={handleReplyFromThread}
                    disabled={replySending || !replyText.trim() || aiGenerating}
                    className="gap-1.5"
                  >
                    {replySending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {replySending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            </div>
          ) : view === "inbox" ? (
            inboxEmails.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No replies yet"
                description="When creators reply to your emails, they'll appear here"
              />
            ) : (
              <EmailList
                emails={inboxEmails}
                replies={replies}
                folders={folders}
                onSelect={openThread}
                onDelete={(id) => setDeleteTarget({ type: "email", id })}
                onMoveToFolder={moveEmailToFolder}
                searchQuery={searchQuery}
              />
            )
          ) : view === "replies" ? (
            repliesViewEmails.length === 0 ? (
              <EmptyState
                icon={Reply}
                title="No replies yet"
                description="When creators reply to your outreach emails, they'll automatically appear here"
              />
            ) : (
              <EmailList
                emails={repliesViewEmails}
                replies={replies}
                folders={folders}
                onSelect={openThread}
                onDelete={(id) => setDeleteTarget({ type: "email", id })}
                onMoveToFolder={moveEmailToFolder}
                searchQuery={searchQuery}
              />
            )
          ) : view === "folder" ? (
            folderEmails.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="Folder is empty"
                description="Move emails here from the inbox or sent view"
              />
            ) : (
              <EmailList
                emails={folderEmails}
                replies={replies}
                folders={folders}
                onSelect={openThread}
                onDelete={(id) => setDeleteTarget({ type: "email", id })}
                onMoveToFolder={moveEmailToFolder}
                searchQuery={searchQuery}
              />
            )
          ) : (
            filteredEmails.length === 0 ? (
              <EmptyState
                icon={Send}
                title={searchQuery ? "No emails match your search" : "No emails sent yet"}
                description={searchQuery ? "Try a different search term" : "Compose your first email to a creator"}
                action={
                  !searchQuery ? (
                    <Button size="sm" className="gap-1.5 mt-3" onClick={() => setComposeOpen(true)}>
                      <Plus className="w-3.5 h-3.5" /> Compose Email
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <EmailList
                  emails={filteredEmails}
                  replies={replies}
                  folders={folders}
                  onSelect={openThread}
                  onDelete={(id) => setDeleteTarget({ type: "email", id })}
                  onMoveToFolder={moveEmailToFolder}
                  searchQuery={searchQuery}
                />
                {hasMoreEmails && !searchQuery && (
                  <div className="flex justify-center py-4 border-t border-border">
                    <Button variant="outline" size="sm" onClick={loadMoreEmails} disabled={loadingMore} className="gap-1.5">
                      {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                      {loadingMore ? "Loading..." : "Load More Emails"}
                    </Button>
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {identities.length > 1 && (
              <div className="space-y-2">
                <Label>From</Label>
                <Select value={selectedIdentity} onValueChange={setSelectedIdentity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {identities.map((id) => (
                      <SelectItem key={id.id} value={id.id}>
                        {id.sender_name} ({id.sender_email}){!id.is_verified && " ⚠️"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>To Email *</Label>
                <Input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="creator@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Creator Name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Collaboration Opportunity" />
            </div>
            <div className="space-y-2">
              <Label>Message *</Label>
              <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Write your message..." rows={8} className="resize-none" />
              <p className="text-[11px] text-muted-foreground">Your default email signature will be auto-appended.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={handleSend} disabled={sending || !toEmail || !subject || !bodyText} className="gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "email" ? "email" : "reply"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "email"
                ? "This will permanently delete this email and all its replies."
                : "This will permanently delete this reply."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Create/Edit Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Edit Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Folder name</Label>
              <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Interested, Follow Up" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                {FOLDER_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setFolderColor(c.value)}
                    className={`w-7 h-7 rounded-full ${c.class} transition-all ${
                      folderColor === c.value ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : "hover:scale-105"
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={saveFolder} disabled={!folderName.trim()}>
              {editingFolder ? "Save" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creator Profile Dialog */}
      <CreatorProfileDialog
        open={!!creatorDialogCreatorId}
        onOpenChange={(open) => { if (!open) setCreatorDialogCreatorId(null); }}
        creatorId={creatorDialogCreatorId}
      />
    </div>
  );
};

// Sub-components
function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: "text-muted-foreground", icon: Clock };
  const Icon = config.icon;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium ${config.color}`}>
      <Icon className="w-3 h-3" /> {config.label}
    </span>
  );
}




function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Icon className="w-12 h-12 text-muted-foreground/30 mb-4" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
      {action}
    </div>
  );
}

function EmailList({
  emails,
  replies,
  folders,
  onSelect,
  onDelete,
  onMoveToFolder,
  searchQuery,
}: {
  emails: SentEmail[];
  replies: EmailReply[];
  folders: EmailFolder[];
  onSelect: (email: SentEmail) => void;
  onDelete: (id: string) => void;
  onMoveToFolder: (emailId: string, folderId: string | null) => void;
  searchQuery: string;
}) {
  const replyCounts = new Map<string, number>();
  const unreadCounts = new Map<string, number>();
  replies.forEach((r) => {
    const id = r.original_message_id;
    replyCounts.set(id, (replyCounts.get(id) || 0) + 1);
    if (!r.is_read) {
      unreadCounts.set(id, (unreadCounts.get(id) || 0) + 1);
    }
  });

  return (
    <div className="divide-y divide-border">
      {emails.map((email) => {
        const replyCount = email.message_id ? replyCounts.get(email.message_id) || 0 : 0;
        const unread = email.message_id ? unreadCounts.get(email.message_id) || 0 : 0;
        return (
          <div
            key={email.id}
            className={`group w-full text-left px-4 py-3 hover:bg-secondary/40 transition-colors flex items-center gap-3 ${
              unread > 0 ? "bg-primary/5" : ""
            }`}
          >
            <button onClick={() => onSelect(email)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                unread > 0 ? "bg-primary/20" : "bg-primary/10"
              }`}>
                <Mail className={`w-4 h-4 ${unread > 0 ? "text-primary" : "text-primary/70"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                    {email.to_name || email.to_email}
                  </span>
                  <StatusBadge status={email.status} />
                  {replyCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Reply className="w-2.5 h-2.5" /> {replyCount}
                    </Badge>
                  )}
                  {unread > 0 && (
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">new</Badge>
                  )}
                </div>
                <p className="text-xs text-foreground truncate mt-0.5">{email.subject}</p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {new Date(email.sent_at).toLocaleDateString()}
              </span>
            </button>
            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-secondary transition-opacity shrink-0">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {folders.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <MoveRight className="w-3 h-3 mr-2" /> Move to folder
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => onMoveToFolder(email.id, null)}>
                        <Inbox className="w-3 h-3 mr-2" /> Inbox
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {folders.map(f => (
                        <DropdownMenuItem key={f.id} onClick={() => onMoveToFolder(email.id, f.id)}>
                          <div className={`w-2.5 h-2.5 rounded-full mr-2 ${getFolderColorClass(f.color)}`} />
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(email.id)}>
                  <Trash2 className="w-3 h-3 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}

export default MessagesPage;

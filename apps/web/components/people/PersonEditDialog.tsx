"use client";

import { createPerson, updatePerson } from "@/app/actions/people";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { createClient } from "@/lib/supabase/client";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PersonAvatar } from "./PersonAvatar";
import { CANONICAL_TAGS } from "./initials";

interface Props {
  userId: string;
  open: boolean;
  /** The person being edited, or null when creating a new one. */
  person: PersonWithStats | null;
  onClose: () => void;
  /** Fired after a successful create/update so the parent can refetch. */
  onSaved: () => void;
}

/**
 * Create / edit form. Avatar upload is offered only when editing an existing
 * person (we need a stable personId for the storage path), mirroring the
 * settings ProfileSection upload flow exactly.
 */
export function PersonEditDialog({ userId, open, person, onClose, onSaved }: Props) {
  const isEdit = person !== null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever the dialog opens for a different person.
  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? "");
    setEmail(person?.email ?? "");
    setPhone(person?.phone ?? "");
    setBio(person?.bio ?? "");
    setTags(person?.tags ?? []);
    setTagDraft("");
    setAvatarUrl(person?.avatarUrl ?? null);
  }, [open, person]);

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagDraft("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function handleAvatarPick(file: File) {
    if (!person) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `people/${userId}/${person.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
      const result = await updatePerson({ id: person.id, avatarUrl: publicUrl });
      if (!result.success) throw new Error(result.error);
      setAvatarUrl(publicUrl);
      onSaved();
      toast.success("Avatar updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    startSaving(async () => {
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        tags,
      };
      const result = isEdit
        ? await updatePerson({ id: person.id, ...payload })
        : await createPerson(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onSaved();
      toast.success(isEdit ? "Person updated." : "Person added.");
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-title">
            {isEdit ? "Edit person" : "Add person"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Avatar — existing person only */}
          {isEdit ? (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Change avatar"
                className="group relative rounded-2xl cursor-pointer-always"
              >
                <PersonAvatar
                  name={name || person.name}
                  avatarUrl={avatarUrl}
                  personId={person.id}
                  sizeClass="size-16"
                  textClass="text-xl"
                  radiusClass="rounded-2xl"
                />
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 text-white",
                    "transition-opacity duration-[160ms] ease-out motion-reduce:transition-none",
                    uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Camera size={16} />
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatarPick(f);
                }}
              />
              <p className="text-meta text-[var(--ink-faint)]">Click to upload · max 5MB</p>
            </div>
          ) : null}

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is this?"
              className=""
              autoFocus
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>

          <Field label="Phone">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Field label="Bio">
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="A line or two of context."
              className="resize-none"
            />
          </Field>

          {/* Tags — the same pastel taxonomy the roster and filter rail use, so
              a tag looks identical wherever it is picked, worn, or filtered. */}
          <div className="space-y-2">
            <span className="block text-meta font-medium text-[var(--ink-muted)]">Tags</span>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className={cn(
                      tintFor(t),
                      "inline-flex h-[24px] items-center gap-1 rounded-lg border px-2 text-micro font-medium",
                      "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]"
                    )}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      aria-label={`Remove ${t}`}
                      className="cursor-pointer-always text-[var(--tint-ink)] opacity-60 transition-opacity duration-[160ms] ease-out hover:opacity-100 motion-reduce:transition-none"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              placeholder="Type a tag, press Enter"
            />
            <div className="flex flex-wrap gap-1.5">
              {CANONICAL_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className={cn(
                    tintFor(t),
                    "inline-flex h-[24px] items-center gap-1 rounded-lg border px-2 text-micro font-medium cursor-pointer-always",
                    "border-[var(--edge)] text-[var(--ink-muted)]",
                    "transition-[border-color,color,background-color] duration-[160ms] ease-out",
                    "hover:border-[var(--tint-edge)] hover:bg-[var(--tint-bg)] hover:text-[var(--tint-ink)]"
                  )}
                >
                  <Plus size={9} />
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner size={14} label="Saving person" />
                Saving…
              </>
            ) : isEdit ? (
 "Save"
            ) : (
 "Add person"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block space-y-1.5">
      <span className="block text-meta font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Github, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateAvatarUrl, updateProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  email: string;
  /** Server-rendered initial state. */
  initialDisplayName: string | null;
  initialBio: string | null;
  initialAvatarUrl: string | null;
  initialGithubUsername: string | null;
  /** Fallback from Google OAuth metadata when no uploaded avatar exists. */
  oauthAvatarUrl: string | null;
}

const BIO_LIMIT = 280;
const NAME_LIMIT = 80;

/**
 * Settings → Profile. Display name, bio (280 char limit), and avatar uploader.
 *
 * Avatar flow:
 *   1. User picks a file. We size-check (≤5MB) + mime-check on the client.
 *   2. Upload to Supabase Storage bucket `avatars` under
 * `${userId}/avatar.${ext}` with upsert=true so re-uploads replace the
 *      previous file. RLS policies (see migration 0014) gate writes to the
 *      signed-in user's own prefix.
 *   3. We append a `?v=${ts}` cache-buster to the public URL so the new image
 *      shows immediately in every <img> on the page, then persist the URL via
 * `updateAvatarUrl` Server Action.
 *
 * Display name + bio: classic dirty-form pattern. Save button is disabled
 * when the form is pristine.
 */
export function ProfileSection({
  userId,
  email,
  initialDisplayName,
  initialBio,
  initialAvatarUrl,
  initialGithubUsername,
  oauthAvatarUrl,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [githubUsername, setGithubUsername] = useState(
    initialGithubUsername ?? "",
  );
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, startProfileTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    (displayName.trim() || null) !== (initialDisplayName ?? null) ||
    (bio.trim() || null) !== (initialBio ?? null) ||
    (githubUsername.trim() || null) !== (initialGithubUsername ?? null);

  const effectiveAvatarUrl = avatarUrl || oauthAvatarUrl;

  async function handleAvatarPick(file: File) {
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
      // Stable object path so the bucket holds at most one avatar per user.
      // The mime suffix only affects the URL shape, not access policy.
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      // Cache-buster so the <img> tag re-renders the fresh upload immediately
      // instead of pulling the previous file out of HTTP cache.
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const result = await updateAvatarUrl({ avatarUrl: publicUrl });
      if (!result.success) throw new Error(result.error);

      setAvatarUrl(publicUrl);
      toast.success("Avatar updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveAvatar() {
    if (!avatarUrl) return;
    setUploading(true);
    try {
      const supabase = createClient();
      // List + remove every avatar object under this user's prefix. Cheap
      // (single user, at most a handful of historical extensions) and avoids
      // the "what extension is the current file" guesswork.
      const { data: list } = await supabase.storage
        .from("avatars")
        .list(userId);
      if (list && list.length > 0) {
        await supabase.storage
          .from("avatars")
          .remove(list.map((f) => `${userId}/${f.name}`));
      }
      const result = await updateAvatarUrl({ avatarUrl: null });
      if (!result.success) throw new Error(result.error);

      setAvatarUrl(null);
      toast.success("Avatar removed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Remove failed.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  function handleSaveProfile() {
    startProfileTransition(async () => {
      const r = await updateProfile({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        githubUsername: githubUsername.trim() || null,
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Profile saved.");
    });
  }

  return (
    <div className="space-y-6">
      {/* Avatar row */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Change avatar"
            className={cn(
 "relative w-20 h-20 rounded-full overflow-hidden border border-[var(--sd-line)] bg-[var(--sd-box)] flex items-center justify-center cursor-pointer group",
 "transition-colors duration-150 hover:border-[var(--sd-accent)]",
            )}
          >
            {effectiveAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={effectiveAvatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl text-[var(--sd-ink-dull)]">
                {(displayName || email || "·").charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className={cn(
 "absolute inset-0 flex items-center justify-center bg-black/40 text-white transition-opacity duration-150",
                uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Camera size={18} />
              )}
            </span>
          </button>
          {avatarUrl && !uploading ? (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              aria-label="Remove avatar"
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--sd-ink-dull)] flex items-center justify-center hover:text-[var(--sd-ink)] hover:border-[var(--sd-accent)] transition-colors duration-150 cursor-pointer"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-base text-[var(--sd-ink)]">
            {initialDisplayName?.trim() || "Add a display name below"}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
            {avatarUrl
              ? "Avatar uploaded"
              : oauthAvatarUrl
                ? "Using Google avatar — upload to override"
                : "PNG, JPG, WebP, GIF · max 5MB"}
          </p>
        </div>
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
      </div>

      {/* Display name */}
      <label className="block space-y-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
          Display name
        </span>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={NAME_LIMIT}
          placeholder="How you'd like to be addressed"
          className=""
        />
      </label>

      {/* Bio */}
      <label className="block space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
            Bio
          </span>
          <span
            className={cn(
 "font-mono text-[10px] tabular-nums",
              bio.length > BIO_LIMIT - 20
                ? "text-[var(--ink-coral)]"
                : "text-[var(--sd-ink-dull)]",
            )}
          >
            {bio.length} / {BIO_LIMIT}
          </span>
        </div>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_LIMIT}
          rows={3}
          placeholder="A sentence or two about you."
          className="resize-none"
        />
      </label>

      {/* GitHub username */}
      <label className="block space-y-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
          GitHub username
        </span>
        <div className="flex items-stretch rounded-md border border-[var(--sd-line)] bg-[var(--sd-box)] focus-within:border-[var(--sd-accent)] transition-colors">
          <span className="flex items-center gap-1.5 pl-3 pr-2 border-r border-[var(--sd-line)] text-[var(--sd-ink-dull)]">
            <Github className="h-3.5 w-3.5" />
            <span className="font-mono text-[12px]">@</span>
          </span>
          <input
            type="text"
            value={githubUsername}
            onChange={(e) =>
              setGithubUsername(e.target.value.replace(/^@/, "").trim())
            }
            maxLength={39}
            placeholder="octocat"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 h-9 px-3 bg-transparent text-base text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-dull)] focus:outline-none"
          />
        </div>
        <p className="text-xs text-[var(--sd-ink-dull)] italic">
          Powers the GitHub heatmap on the Life tab. Leave blank to hide.
        </p>
      </label>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSaveProfile}
          disabled={!dirty || savingProfile}
        >
          {savingProfile ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}

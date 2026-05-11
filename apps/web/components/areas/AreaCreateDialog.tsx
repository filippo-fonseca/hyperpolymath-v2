"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createArea } from "@/app/actions/areas";

interface Props {
  children: React.ReactNode;
}

export function AreaCreateDialog({ children }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) {
      setName("");
      setEmoji("");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    startTransition(async () => {
      const result = await createArea({
        name: name.trim(),
        emoji: emoji.trim() || null,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast("Area created.");
      setOpen(false);
      setName("");
      setEmoji("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Area</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-name">Name</Label>
              <Input
                id="area-name"
                placeholder="e.g. Yale College"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="area-emoji">Emoji (optional)</Label>
              <Input
                id="area-emoji"
                placeholder="e.g. 🎓"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpen(false)}
            >
              Never mind
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Creating..." : "New Area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

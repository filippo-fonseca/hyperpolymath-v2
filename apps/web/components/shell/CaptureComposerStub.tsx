"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  onSubmit: () => void;
}

export function CaptureComposerStub({ onSubmit }: Props) {
  const [value, setValue] = useState("");

  return (
    <div className="p-4 flex flex-col gap-3">
      <Textarea
        placeholder="What's on your mind? Use #tags to organize."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[80px] font-serif text-base resize-none"
        autoFocus
      />
      <div className="flex justify-end">
        <Button
          disabled={!value.trim()}
          onClick={() => {
            // Plan 04 wires this to the real createCapture Server Action
            onSubmit();
          }}
        >
          Capture
        </Button>
      </div>
    </div>
  );
}

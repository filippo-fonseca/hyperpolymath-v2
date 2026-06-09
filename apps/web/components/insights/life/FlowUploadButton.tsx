'use client';

import { useRef, useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadFlowCsv } from '@/app/actions/flow';

/**
 * Tiny upload affordance for Flow CSVs. Lives in the FlowPanel header.
 * On success, server-action revalidates /insights so the new sessions
 * appear without a hard reload.
 */
export function FlowUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setArmed(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadFlowCsv(fd);
      setArmed(false);
      if (!res.success) {
        toast.error(`Flow upload: ${res.error}`);
        return;
      }
      toast.success(
        `Imported ${res.data.total} sessions${
          res.data.skipped > 0 ? ` · skipped ${res.data.skipped}` : ''
        }`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending || armed}
        className="cursor-pointer-always flex items-center gap-1 rounded p-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)] disabled:opacity-40"
        title="Upload Flow CSV"
      >
        <Upload size={12} />
        {pending ? 'Importing…' : 'Upload CSV'}
      </button>
    </>
  );
}

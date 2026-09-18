"use client";

import { useId, useRef, useState } from "react";
import { UploadCloud, FileCheck2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SUBSYSTEM_BLURBS } from "@/lib/subsystem-meta";
import { cn } from "@/lib/utils";
import type { SubsystemKey, SubsystemMeta } from "@/lib/types";

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export function UploadCard({
  subsystem,
  meta,
  files,
  onFilesChange,
  onAnalyze,
  isLoading,
}: {
  subsystem: SubsystemKey;
  meta: SubsystemMeta;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function acceptFiles(candidates: File[]) {
    if (candidates.length === 0) return;
    const valid: File[] = [];
    const invalidNames: string[] = [];
    for (const candidate of candidates) {
      const ext = "." + candidate.name.split(".").pop()?.toLowerCase();
      if (meta.accepts.includes(ext)) valid.push(candidate);
      else invalidNames.push(candidate.name);
    }
    setTypeError(
      invalidNames.length > 0
        ? `${meta.label} needs a ${meta.accepts.join(" or ")} file — skipped ${invalidNames.map((n) => `"${n}"`).join(", ")}.`
        : null,
    );
    if (valid.length === 0) return;
    const merged = [...files];
    for (const candidate of valid) {
      if (!merged.some((f) => sameFile(f, candidate))) merged.push(candidate);
    }
    onFilesChange(merged);
  }

  function removeFile(target: File) {
    onFilesChange(files.filter((f) => !sameFile(f, target)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="eyebrow">Upload · {meta.label}</CardTitle>
        <CardDescription>{SUBSYSTEM_BLURBS[subsystem]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            acceptFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          aria-describedby={`${inputId}-hint`}
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/5",
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            {files.length > 0 ? (
              <FileCheck2 className="size-6 text-emerald-600" aria-hidden="true" />
            ) : (
              <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <p className="font-medium">
            {files.length === 0
              ? "Drop your test files here, or click to choose one or more"
              : `${files.length} file${files.length === 1 ? "" : "s"} staged — drop more, or click to add another`}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={meta.accepts.join(",")}
            className="sr-only"
            onChange={(e) => {
              acceptFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            Accepted format: {meta.accepts.join(" or ")}
          </p>
        </div>

        {files.length > 0 && (
          <ul className="flex w-full flex-col gap-1.5">
            {files.map((f) => (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f);
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {typeError && (
          <p role="alert" className="text-sm font-medium text-red-400">
            {typeError}
          </p>
        )}

        <Button
          size="lg"
          className="h-11 w-full px-8 text-base sm:w-auto"
          disabled={files.length === 0 || isLoading}
          onClick={onAnalyze}
        >
          {isLoading && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
          {isLoading
            ? "Analyzing…"
            : files.length > 1
              ? `Analyze ${files.length} files`
              : "Analyze"}
        </Button>
      </CardContent>
    </Card>
  );
}

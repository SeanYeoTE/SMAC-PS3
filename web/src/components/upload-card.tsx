"use client";

import { useId, useRef, useState } from "react";
import { UploadCloud, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SubsystemMeta } from "@/lib/types";

export function UploadCard({
  meta,
  file,
  onFileSelected,
  onAnalyze,
  isLoading,
}: {
  meta: SubsystemMeta;
  file: File | null;
  onFileSelected: (file: File | null) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  function acceptFile(candidate: File | null) {
    if (!candidate) return;
    const ext = "." + candidate.name.split(".").pop()?.toLowerCase();
    if (!meta.accepts.includes(ext)) {
      setTypeError(
        `${meta.label} needs a ${meta.accepts.join(" or ")} file — "${candidate.name}" is a ${ext} file.`,
      );
      onFileSelected(null);
      return;
    }
    setTypeError(null);
    onFileSelected(candidate);
  }

  return (
    <Card>
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
            acceptFile(e.dataTransfer.files?.[0] ?? null);
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
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
          )}
        >
          {file ? (
            <FileCheck2 className="size-8 text-emerald-600" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
          )}
          <p className="font-medium">
            {file ? file.name : "Drop your test file here, or click to choose one"}
          </p>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={meta.accepts.join(",")}
            className="sr-only"
            onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
          />
          <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            Accepted format: {meta.accepts.join(" or ")}
          </p>
        </div>

        {typeError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {typeError}
          </p>
        )}

        <Button
          size="lg"
          className="h-11 w-full px-8 text-base sm:w-auto"
          disabled={!file || isLoading}
          onClick={onAnalyze}
        >
          {isLoading ? "Analyzing…" : "Analyze"}
        </Button>
      </CardContent>
    </Card>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import type { PredictResult, Rca, RcaStatus } from "@/lib/types";

export function RcaText({
  result,
  rca,
  rcaStatus,
}: {
  result: PredictResult;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
  return (
    <div className="space-y-3 rounded-lg border-l-2 border-primary bg-muted/30 p-3 text-sm leading-relaxed [overflow-wrap:anywhere] sm:p-3.5">
      <p>{result.detail.note}</p>
      <div>
        <h3 className="font-semibold">Root cause analysis (RCA)</h3>
        {rcaStatus === "done" && rca ? (
          <p>{rca.cause}</p>
        ) : rcaStatus === "error" ? (
          <p className="text-destructive">RCA unavailable — Gemini request failed.</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        )}
      </div>
      <div>
        <h3 className="font-semibold">Recommended action</h3>
        {rcaStatus === "done" && rca ? (
          <p>{rca.action}</p>
        ) : rcaStatus === "error" ? (
          <p className="text-destructive">No recommendation available.</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        )}
      </div>
    </div>
  );
}

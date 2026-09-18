import { generateRca } from "@/lib/rca";
import type { PredictResult } from "@/lib/types";

export function RcaText({ result }: { result: PredictResult }) {
  const rca = generateRca(result);
  return (
    <div className="space-y-3 rounded-lg border-l-2 border-primary bg-muted/30 p-3.5 text-sm leading-relaxed">
      <p>{result.detail.note}</p>
      <div>
        <h3 className="font-semibold">Root cause analysis (RCA)</h3>
        <p>{rca.cause}</p>
      </div>
      <div>
        <h3 className="font-semibold">Recommended action</h3>
        <p>{rca.action}</p>
      </div>
    </div>
  );
}

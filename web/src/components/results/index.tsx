import { DoorResult } from "@/components/results/door-result";
import { ShmResult } from "@/components/results/shm-result";
import { AcvResult } from "@/components/results/acv-result";
import { RailResult } from "@/components/results/rail-result";
import type { PredictResult, Rca, RcaStatus } from "@/lib/types";

export function ResultView({
  result,
  rca,
  rcaStatus,
}: {
  result: PredictResult;
  rca?: Rca;
  rcaStatus?: RcaStatus;
}) {
  switch (result.subsystem) {
    case "door":
      return <DoorResult result={result} rca={rca} rcaStatus={rcaStatus} />;
    case "shm":
      return <ShmResult result={result} rca={rca} rcaStatus={rcaStatus} />;
    case "acv":
      return <AcvResult result={result} rca={rca} rcaStatus={rcaStatus} />;
    case "rail":
      return <RailResult result={result} rca={rca} rcaStatus={rcaStatus} />;
  }
}

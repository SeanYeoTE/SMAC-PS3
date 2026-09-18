import { DoorResult } from "@/components/results/door-result";
import { ShmResult } from "@/components/results/shm-result";
import { AcvResult } from "@/components/results/acv-result";
import { RailResult } from "@/components/results/rail-result";
import type { PredictResult } from "@/lib/types";

export function ResultView({ result }: { result: PredictResult }) {
  switch (result.subsystem) {
    case "door":
      return <DoorResult result={result} />;
    case "shm":
      return <ShmResult result={result} />;
    case "acv":
      return <AcvResult result={result} />;
    case "rail":
      return <RailResult result={result} />;
  }
}

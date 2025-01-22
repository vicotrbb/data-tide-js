import { parentPort, workerData } from "worker_threads";
import { ProcessStep } from "./types";

interface SerializedStep {
  name?: string;
  transform: string;
}

const { steps } = workerData as { steps: SerializedStep[] };

if (!Array.isArray(steps)) {
  throw new Error("Invalid worker data: steps must be an array");
}

// Convert serialized functions back to callable functions
const deserializedSteps: ProcessStep[] = steps.map((step, index) => {
  if (!step.transform || typeof step.transform !== "string") {
    throw new Error(
      `Invalid step at index ${index}: transform must be a string containing a function`
    );
  }

  try {
    const fn = eval(step.transform);
    if (typeof fn !== "function") {
      throw new Error(
        `Invalid step at index ${index}: transform must evaluate to a function`
      );
    }

    return {
      name: step.name,
      transform: fn,
    };
  } catch (error) {
    throw new Error(
      `Failed to deserialize step ${step.name || index}: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
});

// Add execution timeout
const MAX_EXECUTION_TIME = 30000; // 30 seconds

parentPort?.on(
  "message",
  async ({ data }: { data: unknown }): Promise<void> => {
    try {
      let result = data;

      for (const step of deserializedSteps) {
        const stepPromise = Promise.race([
          step.transform(result),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(new Error(`Step ${step.name || "unnamed"} timed out`)),
              MAX_EXECUTION_TIME
            )
          ),
        ]);

        result = await stepPromise;
      }

      parentPort?.postMessage(result);
    } catch (error) {
      parentPort?.postMessage({
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }
);

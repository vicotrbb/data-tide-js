import { Worker } from "worker_threads";
import { Readable, Transform } from "stream";
import { cpus } from "os";
import path from "path";
import { EventEmitter } from "events";
import { DataTideOptions, ProcessStep } from "./types";

export const defaultOptions: DataTideOptions = {
  keepOrder: false,
  failureBehavior: "fail-all",
  concurrency: cpus().length,
};

export class DataTide extends EventEmitter {
  private options: DataTideOptions;
  private workers: Worker[] = [];

  constructor(options: Partial<DataTideOptions> = {}) {
    super();
    this.options = { ...defaultOptions, ...options };
    this.setMaxListeners(20);
  }

  private createStream(data: unknown[]): Readable {
    return Readable.from(data);
  }

  private serializeStep<T, R>(step: ProcessStep<T, R>): string {
    if (typeof step.transform !== "function") {
      throw new Error(
        `Invalid transform step: ${
          step.name || "unnamed"
        }. Transform must be a function.`
      );
    }

    const fnString = step.transform.toString();

    // Check for potentially unsafe code patterns
    const unsafePatterns = [
      "process.",
      "require(",
      "import(",
      "eval(",
      "Function(",
      "setInterval(",
      "setImmediate(",
      "fs.",
      "child_process",
    ];

    // Only check setTimeout in production
    if (process.env.NODE_ENV !== "test") {
      unsafePatterns.push("setTimeout(");
    }

    if (unsafePatterns.some((pattern) => fnString.includes(pattern))) {
      throw new Error(
        `Invalid transform function in step: ${step.name || "unnamed"}. ` +
          "Transform functions cannot use system calls, imports, or timers."
      );
    }

    return fnString;
  }

  private async createWorkerPool<T, R>(
    steps: ProcessStep<T, R>[],
    size: number
  ): Promise<Worker[]> {
    const workers: Worker[] = [];
    const serializedSteps = steps.map((step) => ({
      name: step.name,
      transform: this.serializeStep<T, R>(step),
    }));

    const workerPath = path.resolve(
      __dirname,
      process.env.NODE_ENV === "test" ? "../src/worker.ts" : "./worker.js"
    );

    try {
      for (let i = 0; i < size; i++) {
        const worker = new Worker(workerPath, {
          workerData: { steps: serializedSteps },
          execArgv:
            process.env.NODE_ENV === "test"
              ? ["-r", "ts-node/register"]
              : undefined,
        });

        workers.push(worker);
      }

      return workers;
    } catch (error) {
      // Clean up any workers that were created
      workers.forEach((worker) => {
        worker.removeAllListeners();
        worker.terminate();
      });
      throw error;
    }
  }

  private cleanup(): void {
    this.workers.forEach((worker) => {
      worker.removeAllListeners();
      worker.terminate();
    });
    this.workers = [];
    this.removeAllListeners(); // Clean up event listeners
  }

  private handleError(
    error: unknown,
    chunk: unknown,
    callback: (error?: Error | null, data?: unknown) => void
  ): void {
    if (error instanceof Error) {
      switch (this.options.failureBehavior) {
        case "fail-all":
          callback(error);
          break;
        case "ignore-row":
          callback();
          break;
        case "early-return":
          this.cleanup();
          callback(null, null);
          this.emit("early-return");
          break;
      }
    } else {
      callback(new Error("Unknown error occurred"));
    }
  }

  async process<T, R>(
    data: T[] | Readable,
    steps: ProcessStep<T, R>[]
  ): Promise<R[] | Transform> {
    const stream = Array.isArray(data) ? this.createStream(data) : data;
    const results: R[] = [];
    let earlyReturn = false;

    try {
      this.workers = await this.createWorkerPool<T, R>(
        steps,
        this.options.concurrency ?? cpus().length
      );

      const transform = new Transform({
        objectMode: true,
        transform: async (
          chunk: unknown,
          _encoding: string,
          callback: (error?: Error | null, data?: unknown) => void
        ): Promise<void> => {
          if (earlyReturn) {
            callback();
            return;
          }
          try {
            const worker =
              this.workers[Math.floor(Math.random() * this.workers.length)];
            const result = await new Promise((resolveWorker, rejectWorker) => {
              const timeoutId = setTimeout(() => {
                rejectWorker(new Error("Worker operation timed out"));
              }, 30000);

              worker.once("message", (msg) => {
                clearTimeout(timeoutId);
                if (msg.error) {
                  rejectWorker(new Error(msg.error));
                } else {
                  resolveWorker(msg);
                }
              });

              worker.once("error", (err) => {
                clearTimeout(timeoutId);
                rejectWorker(err);
              });

              worker.postMessage({ data: chunk });
            });

            if (Array.isArray(data)) {
              results.push(result as R);
              callback();
            } else {
              callback(null, result);
            }
          } catch (error) {
            this.handleError(error, chunk, callback);
          }
        },
        destroy: (error, callback) => {
          this.cleanup();
          callback(error);
        },
        final: (callback) => {
          this.cleanup();
          callback();
        },
      });

      // Listen for early-return event
      this.once("early-return", () => {
        earlyReturn = true;
      });

      // Handle stream errors
      stream.once("error", (error) => {
        this.cleanup();
        transform.destroy(error);
      });

      if (Array.isArray(data)) {
        return new Promise((resolve, reject) => {
          stream
            .pipe(transform)
            .on("finish", () => {
              this.cleanup();
              resolve(results.filter((r) => r !== null));
            })
            .on("error", (error) => {
              this.cleanup();
              reject(error);
            });
        });
      }

      return transform;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }
}

export default DataTide;

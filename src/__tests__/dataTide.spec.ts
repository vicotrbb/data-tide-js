import DataTide from "../index";
import { ProcessStep } from "../types";
import { Readable, Transform } from "stream";

describe("DataTide", () => {
  it("should process array data with single step", async () => {
    const dataTide = new DataTide();
    const data = [1, 2, 3, 4, 5];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "multiply",
        transform: (num: number): number => num * 2,
      },
    ];

    const result = await dataTide.process(data, steps);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("should maintain order when keepOrder is true", async () => {
    const dataTide = new DataTide({ keepOrder: true });
    const data = [1, 2, 3, 4, 5];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "async multiply",
        transform: async (num: number): Promise<number> => {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 100)
          );
          return num * 2;
        },
      },
    ];

    const result = await dataTide.process(data, steps);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("should handle errors according to failureBehavior", async () => {
    const dataTide = new DataTide({ failureBehavior: "ignore-row" });
    const data = [1, 2, "invalid", 4, 5];
    const steps: ProcessStep<number | string, number>[] = [
      {
        name: "multiply",
        transform: (num: number | string): number => {
          if (typeof num !== "number") {
            throw new Error("Invalid number");
          }
          return num * 2;
        },
      },
    ];

    const result = await dataTide.process(data, steps);
    expect(result).toEqual([2, 4, 8, 10]);
  });

  it("should return a transform stream when input is a stream", async () => {
    const dataTide = new DataTide();
    const inputStream = Readable.from([1, 2, 3, 4, 5]);
    const steps: ProcessStep<number, number>[] = [
      {
        name: "multiply",
        transform: (num: number): number => num * 2,
      },
    ];

    const result = await dataTide.process(inputStream, steps);
    expect(result).toBeInstanceOf(Transform);

    // Test the stream processing
    const output: number[] = [];
    await new Promise<void>((resolve, reject) => {
      (result as Transform)
        .on("data", (chunk) => output.push(chunk))
        .on("end", () => {
          expect(output).toEqual([2, 4, 6, 8, 10]);
          resolve();
        })
        .on("error", reject);

      inputStream.pipe(result as Transform);
    });
  });

  it("should reject unsafe transform functions", () => {
    const dataTide = new DataTide();
    const data = [1, 2, 3];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "unsafe",
        transform: (num: number): number => {
          eval("console.log('unsafe')");
          return num * 2;
        },
      },
    ];

    expect(() => dataTide.process(data, steps)).rejects.toThrow(
      "Transform functions cannot use system calls, imports, or timers"
    );
  });

  it("should handle worker timeout", async () => {
    const dataTide = new DataTide({ failureBehavior: "ignore-row" });
    const data = [1];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "slow",
        transform: async (): Promise<number> => {
          return new Promise(() => {
            // Never resolve to force timeout
          });
        },
      },
    ];

    const result = await dataTide.process(data, steps);
    expect(result).toEqual([]);
  }, 35000); // Set test-specific timeout

  it("should handle fail-all behavior", async () => {
    const dataTide = new DataTide({ failureBehavior: "fail-all" });
    const data = [1, 2, "invalid", 4, 5];
    const steps: ProcessStep<number | string, number>[] = [
      {
        name: "multiply",
        transform: (num: number | string): number => {
          if (typeof num !== "number") {
            throw new Error("Invalid number");
          }
          return num * 2;
        },
      },
    ];

    await expect(dataTide.process(data, steps)).rejects.toThrow(
      "Invalid number"
    );
  });

  it("should handle early-return behavior", async () => {
    const dataTide = new DataTide({ failureBehavior: "early-return" });
    const data = [1, 2, "invalid", 4, 5];
    const steps: ProcessStep<number | string, number>[] = [
      {
        name: "multiply",
        transform: (num: number | string): number => {
          if (typeof num !== "number") {
            throw new Error("Invalid number");
          }
          return num * 2;
        },
      },
    ];

    const result = await dataTide.process(data, steps);
    expect(result).toEqual([2, 4]);
  });

  it("should handle unknown errors", async () => {
    const dataTide = new DataTide();
    const data = [1];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "error",
        transform: () => {
          throw null; // Force an unknown error
        },
      },
    ];

    await expect(dataTide.process(data, steps)).rejects.toThrow(
      "Unknown error occurred"
    );
  });

  it("should handle worker errors", async () => {
    const dataTide = new DataTide();
    const data = [1];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "error",
        transform: () => {
          throw new Error("Worker error");
        },
      },
    ];

    await expect(dataTide.process(data, steps)).rejects.toThrow("Worker error");
  });

  it("should handle stream errors", async () => {
    const dataTide = new DataTide();
    const errorStream = new Readable({
      read() {
        process.nextTick(() => {
          this.emit("error", new Error("Stream error"));
        });
      },
    });

    const steps: ProcessStep<number, number>[] = [
      {
        name: "multiply",
        transform: (num: number): number => num * 2,
      },
    ];

    const transform = await dataTide.process(errorStream, steps);
    await expect(
      new Promise((_, reject) => {
        (transform as Transform).on("error", reject);
        errorStream.pipe(transform as Transform);
      })
    ).rejects.toThrow("Stream error");
  });

  it("should handle invalid transform function", () => {
    const dataTide = new DataTide();
    const data = [1];
    const steps: ProcessStep<number, number>[] = [
      {
        name: "invalid",
        transform: "not a function" as any,
      },
    ];

    expect(() => dataTide.process(data, steps)).rejects.toThrow(
      "Transform must be a function"
    );
  });

  it("should handle stream destroy", async () => {
    const dataTide = new DataTide();
    const inputStream = Readable.from([1, 2, 3, 4, 5]);
    const steps: ProcessStep<number, number>[] = [
      {
        name: "multiply",
        transform: (num: number): number => num * 2,
      },
    ];

    const result = (await dataTide.process(inputStream, steps)) as Transform;
    result.destroy();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify workers are cleaned up
    expect((dataTide as any).workers.length).toBe(0);
  });
});

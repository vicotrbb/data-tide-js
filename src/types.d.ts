import { Readable } from "stream";

export type FailureBehavior = "fail-all" | "ignore-row" | "early-return";

export interface DataTideOptions {
  keepOrder: boolean;
  failureBehavior: FailureBehavior;
  concurrency?: number;
}

export interface ProcessStep<T = unknown, R = unknown> {
  transform: (data: T) => Promise<R> | R;
  name?: string;
}

export interface DataTideInstance {
  process<T, R>(data: T[] | Readable, steps: ProcessStep<T, R>[]): Promise<R[]>;
}

export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly data: unknown
  ) {
    super(message);
    this.name = "ProcessingError";
  }
}

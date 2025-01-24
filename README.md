# DataTide

⚠️ **Warning: This library is currently under development and IS NOT suitable for production usage.**

DataTide is a high-performance Node.js library for processing large datasets using worker threads. It provides a simple, stream-based API for parallel data processing with built-in error handling and backpressure support.

## ⚡ Features

- 🚀 Parallel processing using worker threads
- 📊 Stream-based processing for handling large datasets
- 🔄 Automatic backpressure handling
- ⚡ Support for both synchronous and asynchronous transformations
- 🎯 Configurable error handling strategies
- 🔒 Basic security checks for transform functions
- 📝 TypeScript support with full type definitions

## 🚨 Security Notice

This library uses `eval()` to deserialize transform functions in worker threads. While basic security checks are implemented, it may not be completely safe against all forms of code injection. Use with caution and avoid processing untrusted input.

⚠️ **Warning: The methodology used to serialize and deserialize functions is experimental and may change in the future.**

## 📦 Installation

```bash
npm install data-tide-js
```

## 🚀 Quick Start

```typescript
import DataTide from "data-tide-js";
import { ProcessStep } from "data-tide-js/types";

// Create a DataTide instance
const dataTide = new DataTide({
  keepOrder: true, // Maintain input order
  failureBehavior: "ignore-row", // Skip failed rows
  concurrency: 4, // Number of worker threads
});

// Define processing steps
const steps: ProcessStep<number, number>[] = [
  {
    name: "double",
    transform: (num: number) => num * 2,
  },
  {
    name: "add-ten",
    transform: async (num: number) => {
      await someAsyncOperation();
      return num + 10;
    },
  },
];

// Process array data
const result = await dataTide.process([1, 2, 3, 4, 5], steps);
console.log(result); // [12, 14, 16, 18, 20]

// Or process streams
const inputStream = createReadStream("input.json");
const transformStream = await dataTide.process(inputStream, steps);
transformStream.pipe(createWriteStream("output.json"));
```

## ⚡ Performance

DataTide shows significant performance improvements over traditional Promise.all processing when handling CPU-intensive tasks. The benchmark tests with a dataset of 10,000 items performing mathematical calculations:

```
Performance Comparison Results:
------------------------------
Dataset size: 10,000 items
Regular processing time: 231,982ms
DataTide processing time: 4,491ms
Performance improvement: 98.06%
```

Note: Performance may vary depending on the nature of the processing task, dataset size, and available system resources.

## ⚙️ Configuration

### DataTideOptions

- `keepOrder` (boolean, default: false): Maintain the order of processed items
- `failureBehavior` ('fail-all' | 'ignore-row' | 'early-return', default: 'fail-all'): How to handle errors
- `concurrency` (number, default: CPU cores): Number of worker threads to use

### Error Handling Strategies

- `fail-all`: Stop processing and throw error on first failure
- `ignore-row`: Skip failed items and continue processing
- `early-return`: Stop processing but return successfully processed items

## 🔍 API Reference

### `DataTide`

#### Constructor

```typescript
constructor(options?: Partial<DataTideOptions>)
```

#### Methods

```typescript
process<T, R>(data: T[] | Readable, steps: ProcessStep<T, R>[]): Promise<R[] | Transform>
```

### `ProcessStep<T, R>`

```typescript
interface ProcessStep<T = unknown, R = unknown> {
  transform: (data: T) => Promise<R> | R;
  name?: string;
}
```

## ⚠️ Limitations

- Transform functions cannot use imports or require statements
- System calls (process, require, etc.) are not allowed in transforms
- Maximum execution time per step is 30 seconds
- Worker threads may consume significant memory for large datasets

## 🐛 Known Issues

1. Memory usage may spike with large datasets
2. Worker creation may fail in restricted environments
3. Transform function serialization has limitations

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## 📄 License

MIT License - see LICENSE file for details

## 🐛 Reporting Issues

Please report any issues on our GitHub issue tracker.

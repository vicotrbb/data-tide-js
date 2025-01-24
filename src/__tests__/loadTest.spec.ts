import DataTide from "../index";
import { ProcessStep } from "../types";

describe("Load Testing - Performance Comparison", () => {
  // Helper function for regular processing
  const processDataRegular = async <T, R>(
    data: T[],
    transform: (item: T) => Promise<R> | R
  ): Promise<R[]> => {
    return Promise.all(data.map((item) => transform(item)));
  };

  // Define interface for our test data structure
  interface TestItem {
    id: number;
    value: number;
    text: string;
  }

  interface ProcessedItem {
    id: number;
    processed: boolean;
    calculations: number;
    text: string;
    hash: number;
    timestamp: number;
  }

  it("should process large datasets faster than regular processing", async () => {
    // Reduce dataset size for initial testing
    const dataSize = 10000;
    const testData = Array.from({ length: dataSize }, (_, i) => ({
      id: i,
      value: Math.random() * 1000,
      text: `Item ${i}`,
    }));

    // Make the transformation more CPU-intensive to better demonstrate parallel processing
    const complexTransform = async (item: TestItem): Promise<ProcessedItem> => {
      // Simulate heavy CPU work
      let result = 0;
      for (let i = 0; i < 100000; i++) {
        result += Math.sqrt(Math.pow(item.value + i, 2));
      }

      return {
        id: item.id,
        processed: true,
        calculations: result,
        text: item.text.toUpperCase(),
        hash: Array.from(item.text).reduce<number>(
          (acc, char) => acc + char.charCodeAt(0),
          0
        ),
        timestamp: Date.now(),
      };
    };

    // Test regular processing
    const regularStart = Date.now();
    const regularResults = await processDataRegular(testData, complexTransform);
    const regularDuration = Date.now() - regularStart;

    // Adjust DataTide configuration
    const dataTide = new DataTide({
      concurrency: 4, // Reduce number of workers
      keepOrder: false,
      failureBehavior: "fail-all",
    });

    const steps: ProcessStep<TestItem, ProcessedItem>[] = [
      {
        name: "complex-transform",
        transform: complexTransform,
      },
    ];

    const dataTideStart = Date.now();
    const dataTideResults = (await dataTide.process(
      testData,
      steps
    )) as ProcessedItem[];
    const dataTideDuration = Date.now() - dataTideStart;

    // Verify results are correct
    expect(regularResults.length).toBe(dataSize);
    expect(dataTideResults.length).toBe(dataSize);

    // Log performance metrics
    console.log("\nPerformance Comparison Results:");
    console.log("------------------------------");
    console.log(`Dataset size: ${dataSize} items`);
    console.log(`Regular processing time: ${regularDuration}ms`);
    console.log(`DataTide processing time: ${dataTideDuration}ms`);
    console.log(
      `Performance improvement: ${(
        ((regularDuration - dataTideDuration) / regularDuration) *
        100
      ).toFixed(2)}%`
    );

    // Assert that DataTide is faster
    expect(dataTideDuration).toBeLessThan(regularDuration);
  }, 300000); // 5 minute timeout for large dataset processing
});

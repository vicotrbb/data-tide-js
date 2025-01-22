module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
      },
    ],
  },
  testTimeout: 35000,
};

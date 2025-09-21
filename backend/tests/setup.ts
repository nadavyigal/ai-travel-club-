import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';

  // Mock console methods if needed for cleaner test output
  if (process.env.JEST_SILENT === 'true') {
    global.console = {
      ...console,
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }
});

afterAll(async () => {
  // Global cleanup
});

// Global test timeout
jest.setTimeout(10000);
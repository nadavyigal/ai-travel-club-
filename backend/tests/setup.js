"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load test environment variables
dotenv_1.default.config({ path: '.env.test' });
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
//# sourceMappingURL=setup.js.map
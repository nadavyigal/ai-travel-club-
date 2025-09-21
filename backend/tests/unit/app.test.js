"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../src/app"));
describe('App', () => {
    describe('GET /health', () => {
        it('should return health status', async () => {
            const response = await (0, supertest_1.default)(app_1.default).get('/health');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('version', '1.0.0');
            expect(response.body).toHaveProperty('environment');
        });
    });
    describe('GET /api/v1', () => {
        it('should return API information', async () => {
            const response = await (0, supertest_1.default)(app_1.default).get('/api/v1');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'AI Travel Concierge API v1');
            expect(response.body).toHaveProperty('status', 'ready');
            expect(response.body).toHaveProperty('endpoints');
        });
    });
    describe('GET /unknown-route', () => {
        it('should return 404 for unknown routes', async () => {
            const response = await (0, supertest_1.default)(app_1.default).get('/unknown-route');
            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Not found');
            expect(response.body.message).toContain('Route GET /unknown-route not found');
        });
    });
});
//# sourceMappingURL=app.test.js.map
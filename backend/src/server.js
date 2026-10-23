"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 5000;
app.use((0, cors_1.default)({
    origin: "http://localhost:5173",
    credentials: true,
}));
app.use(express_1.default.json());
app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        message: "ICU Monitor backend is running",
    });
});
app.listen(PORT, () => {
    console.log(`ICU Monitor API running at http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map
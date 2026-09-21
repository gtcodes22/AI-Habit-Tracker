import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((s) => s.trim()) // Trim whitespace from each origin
    .filter(Boolean);

// Implement a flexible CORS policy that allows requests from the specified origins
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        // Allow any localhost / 127.0.0.1 origin in development
        if (/^(http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(origin)) {
            return callback(null, true);
        }
        // Allow anything explicitly listed in CLIENT_URL (comma-separated)
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true, // Allow cookies to be sent
    methods: ["GET","PUT", "POST", "DELETE", "OPTIONS"], // Allow all standard methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allow these headers
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Enable pre-flight for all routes
app.use(express.json({limit: "10mb" })); 

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
}
);

// API routes
app.use("/api/auth", authRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Ensure the database connection is established before starting the server
const PORT = process.env.PORT || 8000;

// Start the server after connecting to the database
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});

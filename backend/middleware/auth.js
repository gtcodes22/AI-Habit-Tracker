import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Protects a route: requires "Authorization: Bearer <token>" and attaches
// the matching user to req.user.
export const protect = async (req, res, next) => {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;

        if (!token) {
            return res.status(401).json({ message: "Not authorized, no token" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Make sure the account still exists (it may have been deleted).
        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res
                .status(401)
                .json({ message: "Not authorized, user no longer exists" });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
            return res
                .status(401)
                .json({ message: "Not authorized, token is invalid or expired" });
        }
        next(err);
    }
};

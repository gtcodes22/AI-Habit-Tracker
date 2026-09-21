export const notFound = (req, res, next) => {
    res.status(404).json({ message: `Route not found - ${req.originalUrl}` });
};

export const errorHandler = (err, req, res, next) => {
    console.error(err);
    // Errors raised by middleware (e.g. malformed JSON from express.json())
    // carry their own status (400); otherwise fall back to the response
    // status if one was set, or 500.
    const status =
        err.status ||
        err.statusCode ||
        (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
    res.status(status).json({
        message: err.message || "Internal Server Error",
    });
};
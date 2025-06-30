// Logger middleware
const logger = (req, res, next) => {
  const start = Date.now();

  // Log request details
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Log more details for auth-related requests
  if (req.url.includes("/auth/")) {
    console.log(`🔑 Auth request to: ${req.url}`);
  }

  if (req.method === "POST" || req.method === "PUT") {
    // Log request body but omit sensitive fields
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.password_hash) sanitizedBody.password_hash = "[REDACTED]";
    console.log("Request body:", JSON.stringify(sanitizedBody, null, 2));
  }

  // Capture the original end method
  const originalEnd = res.end;

  // Override the end method to log response details
  res.end = function (chunk, encoding) {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} ${
        res.statusCode
      } - ${duration}ms`
    );

    // Log more details for failed auth requests
    if (req.url.includes("/auth/") && res.statusCode >= 400) {
      console.log(
        `❌ Auth request failed: ${req.method} ${req.url} (${res.statusCode})`
      );
    }

    // Call the original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = logger;

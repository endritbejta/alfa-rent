"use client";

/**
 * Last resort: catches failures in the root layout itself, where no styling
 * or provider is guaranteed to exist. It must render its own <html>/<body>
 * and cannot rely on anything from the app, hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0d0d",
          color: "#f5f3f2",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Alfa Rent is temporarily unavailable
          </h1>
          <p style={{ color: "#a5a09f", fontSize: "0.875rem" }}>
            Please try again in a moment.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "999px",
              border: "none",
              background: "#dc2028",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

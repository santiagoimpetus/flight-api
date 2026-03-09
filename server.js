const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Flight Hacker API",
      version: "1.0.0"
    },
    servers: [
      {
        url: "https://flight-api-production-857b.up.railway.app"
      }
    ],
    paths: {
      "/health": {
        get: {
          operationId: "healthCheck",
          summary: "Health check",
          responses: {
            "200": {
              description: "OK"
            }
          }
        }
      },
      "/api/search-flights": {
        get: {
          operationId: "searchFlights",
          summary: "Search flights",
          parameters: [
            {
              name: "origin",
              in: "query",
              required: true,
              schema: { type: "string" }
            },
            {
              name: "destination",
              in: "query",
              required: true,
              schema: { type: "string" }
            },
            {
              name: "departureDate",
              in: "query",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": {
              description: "Flight results"
            }
          }
        }
      }
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).json({ ok: true, route: "/" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, route: "/health" });
});

app.get("/api/search-flights", (req, res) => {
  const { origin, destination, departureDate, returnDate } = req.query;

  if (!origin || !destination || !departureDate) {
    return res.status(400).json({
      error: "origin, destination e departureDate são obrigatórios"
    });
  }

  res.status(200).json({
    ok: true,
    message: "Rota search-flights funcionando",
    received: {
      origin,
      destination,
      departureDate,
      returnDate: returnDate || null
    }
  });
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
              description: "Server running"
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
            },
            {
              name: "returnDate",
              in: "query",
              required: false,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": {
              description: "Flight results"
            },
            "400": {
              description: "Missing required parameters"
            }
          }
        }
      }
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server started on port " + PORT);
});
const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const AMADEUS_ENV = process.env.AMADEUS_ENV || "test";

const BASE_URL =
  AMADEUS_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

let accessToken = null;
let tokenExpires = 0;

async function getAccessToken() {
  const now = Date.now();

  if (accessToken && now < tokenExpires) {
    return accessToken;
  }

  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    throw new Error("Faltam AMADEUS_API_KEY e/ou AMADEUS_API_SECRET");
  }

  const response = await axios.post(
    `${BASE_URL}/v1/security/oauth2/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AMADEUS_API_KEY,
      client_secret: AMADEUS_API_SECRET
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  accessToken = response.data.access_token;
  tokenExpires = now + response.data.expires_in * 1000 - 60000;

  return accessToken;
}

app.get("/", (req, res) => {
  res.json({ status: "Flight API running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/search-flights", async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate } = req.query;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: "origin, destination e departureDate são obrigatórios"
      });
    }

    const token = await getAccessToken();

    const response = await axios.get(
      `${BASE_URL}/v2/shopping/flight-offers`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          originLocationCode: origin.toUpperCase(),
          destinationLocationCode: destination.toUpperCase(),
          departureDate,
          returnDate,
          adults: 1,
          currencyCode: "USD",
          max: 10
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    res.status(500).json({
      error: "flight search failed",
      details: error.response?.data || error.message
    });
  }
});

app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.1.0",
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
            }
          }
        }
      }
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

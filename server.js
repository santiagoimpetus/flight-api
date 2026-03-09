const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const AMADEUS_ENV = (process.env.AMADEUS_ENV || "test").toLowerCase();

const BASE_URL =
  AMADEUS_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    throw new Error("Faltam AMADEUS_API_KEY e/ou AMADEUS_API_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: AMADEUS_API_KEY,
    client_secret: AMADEUS_API_SECRET,
  });

  const response = await axios.post(
    `${BASE_URL}/v1/security/oauth2/token`,
    body.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    }
  );

  cachedToken = response.data.access_token;

  // A Amadeus informa expires_in em segundos; guardamos com folga de 60s
  tokenExpiresAt = Date.now() + (Number(response.data.expires_in || 1800) - 60) * 1000;

  return cachedToken;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Flight Hacker API running",
    environment: AMADEUS_ENV,
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: AMADEUS_ENV,
    port: PORT,
    time: new Date().toISOString(),
  });
});

app.get("/api/search-flights", async (req, res) => {
  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults = "1",
      currencyCode = "BRL",
      max = "5",
    } = req.query;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: "origin, destination e departureDate são obrigatórios",
      });
    }

    const token = await getAccessToken();

    const response = await axios.get(`${BASE_URL}/v2/shopping/flight-offers`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        originLocationCode: String(origin).toUpperCase(),
        destinationLocationCode: String(destination).toUpperCase(),
        departureDate: String(departureDate),
        returnDate: returnDate ? String(returnDate) : undefined,
        adults: Number(adults),
        currencyCode: String(currencyCode).toUpperCase(),
        max: Number(max),
      },
      timeout: 30000,
    });

    res.json(response.data);
  } catch (error) {
    const details =
      error.response?.data ||
      error.message ||
      "unknown error";

    res.status(error.response?.status || 500).json({
      error: "flight search failed",
      details,
    });
  }
});

app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.1.0",
    info: {
      title: "Flight Hacker API",
      version: "1.0.0",
      description: "API para buscar voos via Amadeus Flight Offers Search",
    },
    servers: [
      {
        url: "https://flight-api-production-857b.up.railway.app",
      },
    ],
    paths: {
      "/health": {
        get: {
          operationId: "healthCheck",
          summary: "Health check",
          responses: {
            "200": {
              description: "API running",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      environment: { type: "string" },
                      port: { type: "string" },
                      time: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
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
              schema: { type: "string" },
              description: "Código IATA de origem, ex: GRU",
            },
            {
              name: "destination",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Código IATA de destino, ex: NRT",
            },
            {
              name: "departureDate",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Data de ida no formato YYYY-MM-DD",
            },
            {
              name: "returnDate",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Data de volta no formato YYYY-MM-DD",
            },
            {
              name: "adults",
              in: "query",
              required: false,
              schema: { type: "integer", default: 1 },
            },
            {
              name: "currencyCode",
              in: "query",
              required: false,
              schema: { type: "string", default: "BRL" },
            },
            {
              name: "max",
              in: "query",
              required: false,
              schema: { type: "integer", default: 5 },
            },
          ],
          responses: {
            "200": {
              description: "Flight results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { type: "object" },
                      },
                      dictionaries: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Parâmetros obrigatórios ausentes",
            },
            "500": {
              description: "Erro na busca",
            },
          },
        },
      },
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
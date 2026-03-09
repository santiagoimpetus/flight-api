const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = Number(process.env.PORT || 3000);

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const AMADEUS_ENV = (process.env.AMADEUS_ENV || "test").toLowerCase();

const BASE_URL =
  AMADEUS_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();

  if (accessToken && now < tokenExpiresAt) {
    return accessToken;
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

  accessToken = response.data.access_token;
  tokenExpiresAt = now + (response.data.expires_in || 1800) * 1000 - 60000;

  return accessToken;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Flight API is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "Amadeus",
    environment: AMADEUS_ENV,
    port: PORT,
    time: new Date().toISOString(),
  });
});

app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Flight Hacker API",
      version: "1.0.0",
    },
    servers: [
      {
        url: "https://SEU-DOMINIO-AQUI",
      },
    ],
    paths: {
      "/health": {
        get: {
          operationId: "healthCheck",
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
            },
          },
        },
      },
      "/api/search-flights": {
        get: {
          operationId: "searchFlights",
          summary: "Buscar voos",
          parameters: [
            {
              name: "origin",
              in: "query",
              required: true,
              schema: { type: "string", example: "GRU" },
            },
            {
              name: "destination",
              in: "query",
              required: true,
              schema: { type: "string", example: "LHR" },
            },
            {
              name: "departureDate",
              in: "query",
              required: true,
              schema: { type: "string", example: "2026-11-04" },
            },
            {
              name: "returnDate",
              in: "query",
              required: false,
              schema: { type: "string", example: "2026-11-19" },
            },
            {
              name: "adults",
              in: "query",
              required: false,
              schema: { type: "integer", example: 1 },
            },
            {
              name: "currencyCode",
              in: "query",
              required: false,
              schema: { type: "string", example: "BRL" },
            },
            {
              name: "max",
              in: "query",
              required: false,
              schema: { type: "integer", example: 5 },
            },
          ],
          responses: {
            "200": {
              description: "OK",
            },
          },
        },
      },
    },
  });
});

app.get("/api/search-flights", async (req, res) => {
  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults = 1,
      currencyCode = "BRL",
      max = 5,
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
        departureDate,
        returnDate,
        adults: Number(adults),
        currencyCode: String(currencyCode).toUpperCase(),
        max: Number(max),
      },
      timeout: 30000,
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "flight search failed",
      details: error.response?.data || error.message || "unknown error",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`);
});
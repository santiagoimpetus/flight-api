import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = Number(process.env.PORT || 3000);

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;

let accessToken: string | null = null;
let tokenExpires = 0;

async function getAccessToken() {
  const now = Date.now();

  if (accessToken && now < tokenExpires) {
    return accessToken;
  }

  const response = await axios.post(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AMADEUS_API_KEY!,
      client_secret: AMADEUS_API_SECRET!,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  accessToken = response.data.access_token;
  tokenExpires = now + response.data.expires_in * 1000;

  return accessToken;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "Amadeus",
    time: new Date().toISOString(),
  });
});

app.get("/api/search-flights", async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate } = req.query;

    const token = await getAccessToken();

    const response = await axios.get(
      "https://test.api.amadeus.com/v2/shopping/flight-offers",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          originLocationCode: origin,
          destinationLocationCode: destination,
          departureDate,
          returnDate,
          adults: 1,
          max: 5,
        },
      }
    );

    res.json(response.data);
  } catch (err: any) {
    res.status(500).json({
      error: "flight search failed",
      details: err.message,
    });
  }
});

app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Flight Hacker API",
      version: "1.0.0",
    },
    paths: {
      "/health": {
        get: {
          summary: "Health check",
        },
      },
      "/api/search-flights": {
        get: {
          summary: "Search flights",
          parameters: [
            {
              name: "origin",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "destination",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "departureDate",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "returnDate",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
        },
      },
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`);
});
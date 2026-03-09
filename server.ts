import express, { Request, Response, NextFunction } from "express";
import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: "*" }));

const PORT = Number(process.env.PORT || 3000);
const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY || "";
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET || "";
const AMADEUS_ENV = (process.env.AMADEUS_ENV || "test").toLowerCase();

const BASE_URL =
  AMADEUS_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

class BadRequestError extends Error {
  status = 400;
}

function assertIata(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new BadRequestError(
      `${fieldName} deve ser um código IATA de 3 letras`
    );
  }
  return value.trim().toUpperCase();
}

function assertDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestError(`${fieldName} deve estar no formato YYYY-MM-DD`);
  }
  return value;
}

function assertInt(
  value: unknown,
  fieldName: string,
  min = 1,
  max = 9
): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new BadRequestError(
      `${fieldName} deve ser um número inteiro entre ${min} e ${max}`
    );
  }
  return num;
}

function getCurrencyCode(value: unknown, fallback = "BRL"): string {
  if (typeof value !== "string") return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    throw new Error(
      "Faltam AMADEUS_API_KEY e/ou AMADEUS_API_SECRET no arquivo .env"
    );
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
      timeout: 20_000,
    }
  );

  const accessToken = response.data.access_token as string;
  const expiresIn = Number(response.data.expires_in || 1799);

  tokenCache = {
    accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

function simplifyOffer(offer: any) {
  return {
    id: offer.id,
    source: offer.source,
    oneWay: offer.oneWay,
    lastTicketingDate: offer.lastTicketingDate,
    numberOfBookableSeats: offer.numberOfBookableSeats,
    price: offer.price,
    validatingAirlineCodes: offer.validatingAirlineCodes,
    itineraries: (offer.itineraries || []).map((itinerary: any) => ({
      duration: itinerary.duration,
      segments: (itinerary.segments || []).map((segment: any) => ({
        departure: segment.departure,
        arrival: segment.arrival,
        carrierCode: segment.carrierCode,
        number: segment.number,
        aircraft: segment.aircraft,
        operating: segment.operating,
        duration: segment.duration,
        id: segment.id,
        numberOfStops: segment.numberOfStops,
      })),
    })),
    travelerPricings: offer.travelerPricings,
  };
}

async function amadeusGet<T = any>(
  path: string,
  params: Record<string, unknown>
) {
  const token = await getAccessToken();

  const response = await axios.get<T>(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 30_000,
  });

  return response.data;
}

async function amadeusPost<T = any>(
  path: string,
  body: any,
  params?: Record<string, unknown>
) {
  const token = await getAccessToken();

  const response = await axios.post<T>(`${BASE_URL}${path}`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    params,
    timeout: 30_000,
  });

  return response.data;
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    provider: "Amadeus",
    environment: AMADEUS_ENV,
    realTimeLikely: AMADEUS_ENV === "production",
    timestamp: new Date().toISOString(),
  });
});

app.get("/openapi.json", (_req: Request, res: Response) => {
  res.json({
    openapi: "3.1.0",
    info: {
      title: "Flight Prices API",
      version: "1.0.0",
      description:
        "API para buscar preços de voos, validar tarifas e comparar rotas com hubs.",
    },
    servers: [{ url: "https://SEU-DOMINIO.com" }],
    paths: {
      "/health": {
        get: {
          operationId: "healthCheck",
          summary: "Status da API",
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
          summary: "Buscar ofertas de voo",
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
              schema: { type: "integer", example: 1, default: 1 },
            },
            {
              name: "currencyCode",
              in: "query",
              required: false,
              schema: { type: "string", example: "BRL", default: "BRL" },
            },
            {
              name: "max",
              in: "query",
              required: false,
              schema: { type: "integer", example: 10, default: 10 },
            },
          ],
          responses: {
            "200": {
              description: "Lista de ofertas",
            },
          },
        },
      },
      "/api/price-flight": {
        post: {
          operationId: "priceFlight",
          summary: "Revalidar preço de uma oferta",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    flightOffer: { type: "object" },
                  },
                  required: ["flightOffer"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Preço revalidado",
            },
          },
        },
      },
      "/api/search-route-strategy": {
        get: {
          operationId: "searchRouteStrategy",
          summary: "Comparar voo direto com opções via hubs",
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
              schema: { type: "integer", example: 2, default: 1 },
            },
            {
              name: "currencyCode",
              in: "query",
              required: false,
              schema: { type: "string", example: "BRL", default: "BRL" },
            },
            {
              name: "via",
              in: "query",
              required: false,
              schema: { type: "string", example: "MAD,LIS,IST,DOH,DXB" },
            },
          ],
          responses: {
            "200": {
              description: "Direto vs combinações via hubs",
            },
          },
        },
      },
    },
  });
});

app.get(
  "/api/search-flights",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const origin = assertIata(req.query.origin, "origin");
      const destination = assertIata(req.query.destination, "destination");
      const departureDate = assertDate(req.query.departureDate, "departureDate");
      const returnDate = req.query.returnDate
        ? assertDate(req.query.returnDate, "returnDate")
        : undefined;
      const adults = req.query.adults ? assertInt(req.query.adults, "adults") : 1;
      const max = req.query.max ? assertInt(req.query.max, "max", 1, 50) : 10;
      const currencyCode = getCurrencyCode(req.query.currencyCode);

      const data: any = await amadeusGet("/v2/shopping/flight-offers", {
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate,
        returnDate,
        adults,
        currencyCode,
        max,
      });

      const offers = (data.data || []).map(simplifyOffer);

      res.json({
        meta: {
          provider: "Amadeus",
          environment: AMADEUS_ENV,
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          currencyCode,
          count: offers.length,
        },
        offers,
        dictionaries: data.dictionaries || {},
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/price-flight",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { flightOffer } = req.body || {};

      if (!flightOffer || typeof flightOffer !== "object") {
        throw new BadRequestError(
          "Envie no body um objeto chamado flightOffer"
        );
      }

      const data: any = await amadeusPost(
        "/v1/shopping/flight-offers/pricing",
        {
          data: {
            type: "flight-offers-pricing",
            flightOffers: [flightOffer],
          },
        },
        { include: "bags" }
      );

      res.json({
        meta: {
          provider: "Amadeus",
          environment: AMADEUS_ENV,
          priceValidated: true,
        },
        pricing: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/search-route-strategy",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const origin = assertIata(req.query.origin, "origin");
      const destination = assertIata(req.query.destination, "destination");
      const departureDate = assertDate(req.query.departureDate, "departureDate");
      const returnDate = req.query.returnDate
        ? assertDate(req.query.returnDate, "returnDate")
        : undefined;
      const adults = req.query.adults ? assertInt(req.query.adults, "adults") : 1;
      const currencyCode = getCurrencyCode(req.query.currencyCode);

      const viaRaw = typeof req.query.via === "string" ? req.query.via : "";
      const viaAirports = viaRaw
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z]{3}$/.test(x))
        .slice(0, 8);

      const directData: any = await amadeusGet("/v2/shopping/flight-offers", {
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate,
        returnDate,
        adults,
        currencyCode,
        max: 3,
      });

      const directOffers = (directData.data || []).slice(0, 3).map(simplifyOffer);

      const viaResults = await Promise.all(
        viaAirports.map(async (via) => {
          const legAData: any = await amadeusGet("/v2/shopping/flight-offers", {
            originLocationCode: origin,
            destinationLocationCode: via,
            departureDate,
            returnDate,
            adults,
            currencyCode,
            max: 3,
          });

          const legBData: any = await amadeusGet("/v2/shopping/flight-offers", {
            originLocationCode: via,
            destinationLocationCode: destination,
            departureDate,
            returnDate,
            adults,
            currencyCode,
            max: 3,
          });

          const legAOffers = (legAData.data || []).slice(0, 2).map(simplifyOffer);
          const legBOffers = (legBData.data || []).slice(0, 2).map(simplifyOffer);

          return legAOffers.flatMap((a: any) =>
            legBOffers.map((b: any) => ({
              via,
              totalEstimated:
                Number(a.price?.grandTotal || a.price?.total || 0) +
                Number(b.price?.grandTotal || b.price?.total || 0),
              currency: a.price?.currency || b.price?.currency || currencyCode,
              legA: a,
              legB: b,
              notes: [
                "Bilhetes separados: a conexão não é protegida.",
                "Pode ser necessário recolher e redespachar bagagem no aeroporto intermediário.",
                "Use conexão longa ou pernoite para reduzir risco.",
              ],
            }))
          );
        })
      );

      const combinations = viaResults
        .flat()
        .sort((a, b) => a.totalEstimated - b.totalEstimated)
        .slice(0, 10);

      res.json({
        meta: {
          provider: "Amadeus",
          environment: AMADEUS_ENV,
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          currencyCode,
          viasChecked: viaAirports,
        },
        directOffers,
        combinations,
      });
    } catch (error) {
      next(error);
    }
  }
);

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof BadRequestError) {
      return res.status(error.status).json({ error: error.message });
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      return res.status(axiosError.response?.status || 500).json({
        error: "Erro ao consultar o provedor",
        details: axiosError.response?.data || axiosError.message,
      });
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : "Erro interno do servidor",
    });
  }
);

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
  console.log(`OpenAPI em http://localhost:${PORT}/openapi.json`);
});
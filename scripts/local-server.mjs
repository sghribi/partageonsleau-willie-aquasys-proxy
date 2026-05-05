import { createServer } from "node:http";
import { handle } from "../dist/src/index.js";

const port = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const queryStringParameters = {};
      for (const [key, value] of url.searchParams.entries()) {
        if (queryStringParameters[key] === undefined) queryStringParameters[key] = value;
        else if (Array.isArray(queryStringParameters[key])) queryStringParameters[key].push(value);
        else queryStringParameters[key] = [queryStringParameters[key], value];
      }

      const event = {
        path: url.pathname,
        queryStringParameters,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v ?? "")])),
        body: Buffer.concat(chunks).toString("utf8") || null,
        httpMethod: req.method ?? "GET",
        isBase64Encoded: false,
      };

      const response = await handle(event, {});
      for (const [key, value] of Object.entries(response.headers ?? {})) {
        res.setHeader(key, Array.isArray(value) ? value : String(value));
      }
      res.statusCode = response.statusCode ?? 200;
      res.end(response.body ?? "");
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
}).listen(port, () => {
  console.log(`Local Willie/Aquasys proxy listening on http://localhost:${port}`);
});

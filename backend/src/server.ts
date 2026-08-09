import { createServer } from "node:http";

import type { HealthResponse } from "@moments-forever/types";

import { readServerEnv } from "./env.js";

const env = readServerEnv(process.env);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    const body: HealthResponse = {
      status: "ok",
      service: "moments-forever-api",
    };

    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(env.port, () => {
  console.log(`Moments Forever API listening on http://localhost:${env.port}`);
});

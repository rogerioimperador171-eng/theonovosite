import type { Config, Context } from "@netlify/functions";
import { checkDeposit } from "../../src/lib/propix.server";

export default async (request: Request, _context: Context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido." }, { status: 405 });
  }

  const clientId = process.env["PROPAY_CLIENT_ID"];
  const clientSecret = process.env["PROPAY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Pagamento indisponível no momento. Tente novamente mais tarde." },
      { status: 500 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const result = await checkDeposit(String(body["transactionId"] || ""), {
      clientId,
      clientSecret,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.data);
  } catch {
    return Response.json({ error: "Não conseguimos consultar o pagamento agora." }, { status: 504 });
  }
};

export const config: Config = {
  path: "/api/public/pix/status",
};

import { createDeposit, getCredentials, jsonResponse } from "./propix.mjs";

export default async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({}, 204);
  if (request.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) {
    return jsonResponse(
      {
        error:
          "Pagamento indisponível: configure PROPAY_CLIENT_ID e PROPAY_CLIENT_SECRET nas variáveis de ambiente da Netlify.",
      },
      500,
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Requisição inválida." }, 400);
  }

  try {
    const result = await createDeposit(
      {
        amount: body.amount,
        description: typeof body.description === "string" ? body.description : undefined,
        payerName: typeof body.payerName === "string" ? body.payerName : undefined,
        payerDocument: typeof body.payerDocument === "string" ? body.payerDocument : undefined,
      },
      { clientId, clientSecret },
    );
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse(result.data, 200);
  } catch (error) {
    const timeout = error && error.name === "AbortError";
    return jsonResponse(
      {
        error: timeout
          ? "A conexão com o provedor demorou demais. Tente novamente."
          : "Não conseguimos falar com o provedor de pagamento. Tente novamente.",
      },
      504,
    );
  }
};
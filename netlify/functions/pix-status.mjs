import { checkDeposit, getCredentials, jsonResponse } from "./propix.mjs";

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
    const result = await checkDeposit(String(body.transactionId || ""), {
      clientId,
      clientSecret,
    });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse(result.data, 200);
  } catch {
    return jsonResponse({ error: "Não conseguimos consultar o pagamento agora." }, 504);
  }
};
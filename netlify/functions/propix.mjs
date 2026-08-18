/**
 * Integração com a API ProPix (https://api.propixbr.com) para Netlify Functions.
 * Arquivo em JavaScript puro e sem dependências externas, para evitar
 * qualquer problema de bundling no deploy da Netlify.
 * As credenciais NUNCA saem do servidor.
 */

export const PROPIX_BASE_URL = process.env.PROPAY_BASE_URL || "https://api.propixbr.com";

export function getCredentials() {
  const clientId = process.env.PROPAY_CLIENT_ID || process.env.PROPIX_CLIENT_ID || "";
  const clientSecret = process.env.PROPAY_CLIENT_SECRET || process.env.PROPIX_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

export function generateCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (base, startWeight) => {
    const sum = base.reduce((acc, value, index) => acc + value * (startWeight - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = digit(n, 10);
  const d2 = digit([...n, d1], 11);
  return [...n, d1, d2].join("");
}

export function sanitizeAmount(value) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount < 15) return 0;
  return Math.round(amount * 100) / 100;
}

function pick(data, keys) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function propixFetch(path, body, credentials, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${PROPIX_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-client-id": credentials.clientId,
        "x-client-secret": credentials.clientSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }
    if (!data || typeof data !== "object") data = { message: String(data) };
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function createDeposit(input, credentials) {
  const amount = sanitizeAmount(input.amount);
  if (!amount) {
    return { ok: false, status: 400, error: "O valor mínimo para doação é R$ 15,00." };
  }

  const { ok, status, data } = await propixFetch(
    "/api/v1/deposit",
    {
      amount,
      description: input.description || "Doação para o tratamento do Theo",
      payerName: input.payerName || "Doador Solidario",
      payerDocument: String(input.payerDocument || generateCpf()).replace(/\D/g, ""),
    },
    credentials,
  );

  const nested = (data && typeof data.data === "object" && data.data) || {};
  const merged = { ...nested, ...data };
  const copyPaste = pick(merged, ["copyPaste", "copiaECola", "qrcode", "emv", "pixCopyPaste"]);
  const transactionId = pick(merged, ["transactionId", "id", "transaction_id"]);

  if (!ok || !copyPaste) {
    return {
      ok: false,
      status: ok ? 502 : status,
      error:
        pick(merged, ["message", "error", "detail"]) ||
        "Não conseguimos gerar o Pix agora. Tente novamente em instantes.",
    };
  }

  return {
    ok: true,
    status: 200,
    data: {
      transactionId,
      copyPaste,
      qrcodeUrl: pick(merged, ["qrcodeUrl", "qrCodeUrl", "qrcode_url", "qrCodeImage"]),
      status: pick(merged, ["status", "transactionState"]) || "PENDENTE",
      receiverName: pick(merged, ["receiverName", "payeeName", "beneficiaryName"]),
      amount,
    },
  };
}

export async function checkDeposit(transactionId, credentials) {
  if (!transactionId) {
    return { ok: false, status: 400, error: "transactionId é obrigatório." };
  }

  const { ok, status, data } = await propixFetch("/api/v1/check", { transactionId }, credentials);
  const nested = (data && typeof data.data === "object" && data.data) || {};
  const merged = { ...nested, ...data };

  if (!ok) {
    return {
      ok: false,
      status,
      error: pick(merged, ["message", "error"]) || "Não foi possível consultar o pagamento.",
    };
  }

  return {
    ok: true,
    status: 200,
    data: {
      transactionId,
      transactionState: pick(merged, ["transactionState", "status", "state"]) || "PENDENTE",
    },
  };
}

export function jsonResponse(payload, status = 200) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  if (status === 204 || status === 304) return new Response(null, { status, headers });
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}
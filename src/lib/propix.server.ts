/**
 * Integração com a API ProPix (https://api.propixbr.com).
 * Usado tanto pelas rotas de servidor (Lovable) quanto pelas Netlify Functions.
 * As credenciais NUNCA são expostas ao frontend.
 */

export const PROPIX_BASE_URL = "https://api.propixbr.com";

export type PropixCredentials = { clientId: string; clientSecret: string };

export type CreateDepositInput = {
  amount: number;
  description?: string | undefined;
  payerName?: string | undefined;
  payerDocument?: string | undefined;
};

/** Gera um CPF válido (dígitos verificadores corretos) para doações anônimas. */
export function generateCpf(): string {
  const n: number[] = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (base: number[], startWeight: number) => {
    const sum = base.reduce((acc, value, index) => acc + value * (startWeight - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = digit(n, 10);
  const d2 = digit([...n, d1], 11);
  return [...n, d1, d2].join("");
}

export function sanitizeAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount < 15) return 0;
  return Math.round(amount * 100) / 100;
}

async function propixFetch(
  path: string,
  body: unknown,
  credentials: PropixCredentials,
  timeoutMs = 25000,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${PROPIX_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": credentials.clientId,
        "x-client-secret": credentials.clientSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { message: text };
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function pick(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export async function createDeposit(input: CreateDepositInput, credentials: PropixCredentials) {
  const amount = sanitizeAmount(input.amount);
  if (!amount) {
    return { ok: false as const, status: 400, error: "O valor mínimo para doação é R$ 15,00." };
  }

  const { ok, status, data } = await propixFetch(
    "/api/v1/deposit",
    {
      amount,
      description: input.description || "Doação para o tratamento do Theo",
      payerName: input.payerName || "Doador Solidario",
      payerDocument: (input.payerDocument || generateCpf()).replace(/\D/g, ""),
    },
    credentials,
  );

  const nested = (data["data"] as Record<string, unknown>) || {};
  const merged = { ...nested, ...data };
  const copyPaste = pick(merged, ["copyPaste", "copiaECola", "qrcode", "emv", "pixCopyPaste"]);
  const transactionId = pick(merged, ["transactionId", "id", "transaction_id"]);

  if (!ok || !copyPaste) {
    return {
      ok: false as const,
      status: ok ? 502 : status,
      error:
        pick(merged, ["message", "error", "detail"]) ||
        "Não conseguimos gerar o Pix agora. Tente novamente em instantes.",
    };
  }

  return {
    ok: true as const,
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

export async function checkDeposit(transactionId: string, credentials: PropixCredentials) {
  if (!transactionId) {
    return { ok: false as const, status: 400, error: "transactionId é obrigatório." };
  }

  const { ok, status, data } = await propixFetch("/api/v1/check", { transactionId }, credentials);
  const nested = (data["data"] as Record<string, unknown>) || {};
  const merged = { ...nested, ...data };

  if (!ok) {
    return {
      ok: false as const,
      status,
      error: pick(merged, ["message", "error"]) || "Não foi possível consultar o pagamento.",
    };
  }

  return {
    ok: true as const,
    status: 200,
    data: {
      transactionId,
      transactionState: pick(merged, ["transactionState", "status", "state"]) || "PENDENTE",
    },
  };
}

export function missingCredentialsResponse() {
  return {
    ok: false as const,
    status: 500,
    error: "Pagamento indisponível no momento. Tente novamente mais tarde.",
  };
}

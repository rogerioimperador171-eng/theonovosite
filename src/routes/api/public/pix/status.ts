import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pix/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkDeposit, missingCredentialsResponse } = await import(
          "@/lib/propix.server"
        );

        const clientId = process.env["PROPAY_CLIENT_ID"];
        const clientSecret = process.env["PROPAY_CLIENT_SECRET"];
        if (!clientId || !clientSecret) {
          const fail = missingCredentialsResponse();
          return Response.json({ error: fail.error }, { status: fail.status });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Requisição inválida." }, { status: 400 });
        }

        const transactionId = String(body["transactionId"] || "");

        try {
          const result = await checkDeposit(transactionId, { clientId, clientSecret });
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.data);
        } catch {
          return Response.json(
            { error: "Não conseguimos consultar o pagamento agora." },
            { status: 504 },
          );
        }
      },
    },
  },
});

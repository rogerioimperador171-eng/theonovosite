import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pix/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createDeposit, missingCredentialsResponse } = await import(
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

        try {
          const result = await createDeposit(
            {
              amount: Number(body["amount"]),
              description: typeof body["description"] === "string" ? body["description"] : undefined,
              payerName: typeof body["payerName"] === "string" ? body["payerName"] : undefined,
              payerDocument:
                typeof body["payerDocument"] === "string" ? body["payerDocument"] : undefined,
            },
            { clientId, clientSecret },
          );
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.data);
        } catch {
          return Response.json(
            { error: "Não conseguimos falar com o provedor de pagamento. Tente novamente." },
            { status: 504 },
          );
        }
      },
    },
  },
});

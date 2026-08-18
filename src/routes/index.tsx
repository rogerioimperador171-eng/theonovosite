import { createFileRoute } from "@tanstack/react-router";
import siteHtml from "../../public/index.html?raw";

// A página é o site estático original (public/index.html), servido tal como
// está para preservar design, animações, CSS e responsividade.
export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: () =>
        new Response(siteHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    },
  },
  head: () => ({
    meta: [
      { title: "Ajude Theo | Doe via Pix para o tratamento contra o Neuroblastoma" },
      {
        name: "description",
        content:
          "Theo tem 7 anos e luta contra um Neuroblastoma em estágio IV. Doe via Pix em segundos e ajude a custear o tratamento.",
      },
      { property: "og:title", content: "Ajude Theo | Doe via Pix" },
      {
        property: "og:description",
        content:
          "Doe via Pix e ajude Theo no tratamento contra o Neuroblastoma. QR Code e Pix copia e cola na hora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return null;
}

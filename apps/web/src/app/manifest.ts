import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moments Forever",
    short_name: "Moments",
    description: "Colecione momentos, não coisas.",
    start_url: "/perfil",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#121110",
    theme_color: "#121110",
    lang: "pt-BR",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { Metadata } from "next";

import { PhotoImport } from "./photo-import";

export const metadata: Metadata = {
  title: "Importar fotos · Moments Forever",
  description: "Organize uma seleção local de fotos antes de enviar.",
};

export default function ImportPage() {
  return <PhotoImport />;
}

import { NextResponse } from "next/server";

import {
  buildAvatarObjectKey,
  createPresignedPutUrl,
  getR2Config,
} from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface Body {
  readonly contentType?: string;
}

function extensionForContentType(
  contentType: string,
): "jpg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  if (!getR2Config()) {
    return NextResponse.json(
      { error: "Armazenamento R2 não configurado." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const contentType = body.contentType?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "contentType deve ser uma imagem." },
      { status: 400 },
    );
  }

  const key = buildAvatarObjectKey({
    userId: user.id,
    extension: extensionForContentType(contentType),
  });

  try {
    const uploadUrl = await createPresignedPutUrl({ key, contentType });
    return NextResponse.json({
      uploadUrl,
      key,
      expiresInSeconds: 60 * 15,
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível preparar o upload." },
      { status: 500 },
    );
  }
}

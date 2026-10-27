"use client";

import { useState } from "react";

type Props = {
  /** ISO 3166-1 alpha-2 code (any case). */
  readonly code: string;
  readonly width: number;
  readonly height: number;
  readonly className?: string;
  readonly alt?: string;
  readonly title?: string;
  readonly loading?: "lazy" | "eager";
  /** Flag image resolution: w40 for small chips, w80 for the album hero. */
  readonly resolution?: "w40" | "w80";
};

/**
 * Flag image for a destination (flagcdn.com, one PNG per ISO code — territories such as PR, GL or HK included).
 * When the image cannot be loaded (code the CDN lacks, offline, blocked), a small badge with the ISO code takes
 * the same box instead of a broken-image icon.
 */
export function CountryFlagImage({
  code,
  width,
  height,
  className,
  alt = "",
  title,
  loading,
  resolution = "w40",
}: Props) {
  const [failed, setFailed] = useState(false);
  const iso = code.trim().toUpperCase();

  if (failed || !/^[A-Z]{2}$/u.test(iso)) {
    return (
      <span
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={className}
        role={alt ? "img" : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          width,
          height,
          flex: "none",
          borderRadius: 2,
          background: "rgb(128 128 128 / 22%)",
          color: "inherit",
          fontSize: Math.max(7, Math.round(height * 0.5)),
          fontWeight: 700,
          letterSpacing: 0,
          lineHeight: 1,
        }}
        title={title}
      >
        {iso}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
    <img
      alt={alt}
      className={className}
      decoding="async"
      height={height}
      loading={loading}
      onError={() => setFailed(true)}
      src={`https://flagcdn.com/${resolution}/${iso.toLowerCase()}.png`}
      title={title}
      width={width}
    />
  );
}

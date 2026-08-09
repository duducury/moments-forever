"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mf-r2-upload-warning";

/** One-shot warning after import when R2 upload failed but the trip was created. */
export function R2UploadWarningBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (!value) return;
      sessionStorage.removeItem(STORAGE_KEY);
      setMessage(value);
    } catch {
      // ignore
    }
  }, []);

  if (!message) return null;

  return (
    <p className="placeholder-note" role="status">
      {message}
    </p>
  );
}

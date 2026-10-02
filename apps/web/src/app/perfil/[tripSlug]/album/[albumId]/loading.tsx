import { AlbumLoadingShell } from "@/components/album-loading-shell";

/**
 * Instant shell while album server data loads —
 * avoids a blank wait when opening a place from the profile grid.
 */
export default function AlbumLoading() {
  return <AlbumLoadingShell />;
}

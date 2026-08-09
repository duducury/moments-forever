"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { ImageCropDialog } from "@/components/image-crop-dialog";
import {
  clearProfileAvatar,
  saveProfileAvatarFromFile,
} from "@/lib/profile/profile-avatar-store";
import {
  clearProfileAvatarFromR2,
  uploadProfileAvatarToR2,
} from "@/lib/profile/upload-profile-avatar-to-r2";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { ProfileAvatar } from "./profile-avatar";
import styles from "./perfil.module.css";

export function EditProfileDialog({
  ownerId,
  initialName,
  initialBio,
  onClose,
}: {
  readonly ownerId: string;
  readonly initialName: string;
  readonly initialBio: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cropUrlRef = useRef<string | null>(null);
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }

  function clearCropSrc() {
    if (cropUrlRef.current) {
      URL.revokeObjectURL(cropUrlRef.current);
    }
    cropUrlRef.current = null;
    setCropSrc(null);
  }

  function onPickFile(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha uma imagem do telefone ou computador.");
      return;
    }
    setError(null);
    clearCropSrc();
    const url = URL.createObjectURL(file);
    cropUrlRef.current = url;
    setCropSrc(url);
  }

  function onCropCancel() {
    clearCropSrc();
  }

  function onCropConfirm(file: File) {
    setRemoveAvatar(false);
    clearPreview();
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setPendingFile(file);
    clearCropSrc();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    const nextBio = bio.trim();
    if (!nextName) {
      setError("Informe um nome.");
      return;
    }
    if (nextBio.length > 280) {
      setError("O texto pode ter no máximo 280 caracteres.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase não configurado.");

      if (pendingFile) {
        // Local cache for this device + R2 for share previews (WhatsApp / OG).
        await saveProfileAvatarFromFile(ownerId, pendingFile);
        await uploadProfileAvatarToR2(pendingFile);
      } else if (removeAvatar) {
        await clearProfileAvatar(ownerId);
        await clearProfileAvatarFromR2();
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: nextName },
      });
      if (authError) throw new Error(authError.message);

      const { error: profileError } = await supabase
        .from("users")
        .update({
          display_name: nextName,
          bio: nextBio.length > 0 ? nextBio : null,
          avatar_photo_id: null,
        })
        .eq("id", ownerId);
      if (profileError) throw new Error(profileError.message);

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        aria-label="Editar perfil"
        aria-modal="true"
        className={styles.dialogBackdrop}
        onClick={(event) => {
          if (event.target === event.currentTarget && !cropSrc) onClose();
        }}
        role="dialog"
      >
        <div className={styles.dialogCard}>
          <h2 className={styles.dialogTitle}>Editar perfil</h2>
          <form
            className={styles.dialogForm}
            onSubmit={(event) => void onSubmit(event)}
          >
            <div className={styles.editProfileAvatarRow}>
              <ProfileAvatar
                displayName={name || initialName}
                ownerId={ownerId}
                previewUrl={removeAvatar ? null : previewUrl}
                size="md"
              />
              <div className={styles.editProfileAvatarActions}>
                <input
                  accept="image/*"
                  className={styles.srOnlyFile}
                  onChange={(event) => {
                    onPickFile(event.target.files);
                    event.target.value = "";
                  }}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  Escolher do telefone
                </button>
                <button
                  className={styles.sectionEditButton}
                  disabled={busy}
                  onClick={() => {
                    setPendingFile(null);
                    clearPreview();
                    setRemoveAvatar(true);
                  }}
                  type="button"
                >
                  Remover foto
                </button>
                <p className={styles.fieldHint}>
                  Depois de escolher, você pode dar zoom e encaixar o rostinho.
                </p>
              </div>
            </div>

            <label htmlFor="profile-name">Nome</label>
            <input
              id="profile-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />

            <label htmlFor="profile-bio">Texto</label>
            <textarea
              id="profile-bio"
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Nossas viagens e momentos pelo mundo."
              rows={3}
              value={bio}
            />
            <p className={styles.fieldHint}>{bio.trim().length}/280</p>

            <div className={styles.dialogActions}>
              <button className="button primary" disabled={busy} type="submit">
                {busy ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </div>

      {cropSrc ? (
        <ImageCropDialog
          confirmLabel="Usar esta foto"
          imageSrc={cropSrc}
          onCancel={onCropCancel}
          onConfirm={onCropConfirm}
          shape="circle"
          title="Encaixar foto de perfil"
        />
      ) : null}
    </>
  );
}

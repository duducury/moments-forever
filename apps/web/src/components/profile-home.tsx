"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

const ProfileHomeContext = createContext<string | null>(null);

/** When set, AppWordmark and “voltar ao perfil” use this path (e.g. /eduardo). */
export function ProfileHomeProvider({
  homeHref,
  children,
}: {
  readonly homeHref: string;
  readonly children: ReactNode;
}) {
  return (
    <ProfileHomeContext.Provider value={homeHref}>
      {children}
    </ProfileHomeContext.Provider>
  );
}

export function useProfileHomeHref(): string | null {
  return useContext(ProfileHomeContext);
}

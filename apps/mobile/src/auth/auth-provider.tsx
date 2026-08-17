import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, InteractionManager } from "react-native";

interface AuthContextValue {
  readonly configured: boolean;
  readonly loading: boolean;
  readonly session: Session | null;
  readonly user: User | null;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const task = InteractionManager.runAfterInteractions(() => {
      void import("../lib/supabase").then(({ getSupabase }) => {
        if (cancelled) {
          return;
        }

        const client = getSupabase();
        setConfigured(Boolean(client));

        if (!client) {
          setLoading(false);
          return;
        }

        void client.auth
          .getSession()
          .then(({ data }) => {
            if (!cancelled) {
              setSession(data.session);
              setLoading(false);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setLoading(false);
            }
          });

        const authSubscription = client.auth.onAuthStateChange((_event, nextSession) => {
          if (!cancelled) {
            setSession(nextSession);
            setLoading(false);
          }
        });

        const appStateSubscription = AppState.addEventListener("change", (state) => {
          if (state === "active") {
            client.auth.startAutoRefresh();
          } else {
            client.auth.stopAutoRefresh();
          }
        });

        cleanup = () => {
          authSubscription.data.subscription.unsubscribe();
          appStateSubscription.remove();
        };
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
      cleanup?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        const { getSupabase } = await import("../lib/supabase");
        await getSupabase()?.auth.signOut();
      },
    }),
    [configured, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}

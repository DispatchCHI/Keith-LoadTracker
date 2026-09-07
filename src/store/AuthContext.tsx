import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isCloudConfigured } from "../lib/supabase";

type AuthValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  displayName: string;
  signInPassword: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function nameFromUser(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { display_name?: string; full_name?: string };
  return (
    meta.display_name?.trim() ||
    meta.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Dispatcher"
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isCloudConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const signInPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return "Cloud is not configured.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const supabase = getSupabase();
    if (!supabase) return "Cloud is not configured.";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      displayName: nameFromUser(session?.user ?? null),
      signInPassword,
      sendMagicLink,
      signOut,
    }),
    [configured, loading, sendMagicLink, session, signInPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

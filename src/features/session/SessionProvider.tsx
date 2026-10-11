import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "./session";

const SessionContext = createContext<Session>({ status: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const queryClient = useQueryClient();

  useEffect(() => {
    const toSession = (u: { id: string; email?: string } | null | undefined): Session =>
      u ? { status: "signed-in", userId: u.id, email: u.email ?? "" } : { status: "signed-out" };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(toSession(s?.user));
      if (event === "SIGNED_OUT") queryClient.clear();
      else if (event === "SIGNED_IN" || event === "USER_UPDATED")
        void queryClient.invalidateQueries();
    });
    void supabase.auth.getUser().then(({ data }) => setSession(toSession(data.user)));
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export async function signOut() {
  await supabase.auth.signOut();
}

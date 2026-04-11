import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface SessionContextType {
  sessionId: string;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("fp-session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("fp-session", id);
    }
    setSessionId(id);
  }, []);

  if (!sessionId) return null;

  return (
    <SessionContext.Provider value={{ sessionId }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

// supabase/functions/_shared/bgl-utente.ts
//
// BIGLIETTERIA — chi chiama, dal token dell'header Authorization (accesso Google o account StagePlot). Lo usano
// bgl-avvisa (organizzatore), bgl-prenota (pubblico con Google) e bgl-account («Elimina il mio account»).
// Un token falso, scaduto o revocato, o un errore di rete, valgono «nessun utente»: mai un'eccezione.

export type Utente = { id: string; email: string; verificata: boolean };

export function tokenDa(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

type GetUser = (token: string) => Promise<{ data: { user: { id: string; email?: string | null; email_confirmed_at?: string | null } | null }; error: unknown }>;

export function utenteDa(getUser: GetUser): (token: string) => Promise<Utente | null> {
  return async (token: string) => {
    try {
      const { data, error } = await getUser(token);
      if (error || !data || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? "", verificata: !!data.user.email_confirmed_at };
    } catch {
      return null;
    }
  };
}

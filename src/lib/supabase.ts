import { createClient } from "@supabase/supabase-js";

// Retrieve public client-side Supabase environment variables 
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

/**
 * Checks if Supabase connection environment variables are correctly defined.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("https://"));
}

/**
 * Mapped Supabase instance.
 * Using lazy evaluation guards so missing environment variables do not crash the app initialization flow.
 */
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Structure containing detail level diagnostic verification outputs.
 */
export interface SupabaseDiagnostics {
  isConfigured: boolean;
  urlLoaded: boolean;
  anonKeyLoaded: boolean;
  isValidSchema: boolean;
  connectionSuccess: boolean | null;
  errorMessage: string | null;
}

/**
 * Runs a physical test verification flow against the active connection.
 */
export async function testSupabaseConnection(): Promise<SupabaseDiagnostics> {
  const result: SupabaseDiagnostics = {
    isConfigured: isSupabaseConfigured(),
    urlLoaded: Boolean(supabaseUrl),
    anonKeyLoaded: Boolean(supabaseAnonKey),
    isValidSchema: Boolean(supabaseUrl && supabaseUrl.startsWith("https://")),
    connectionSuccess: null,
    errorMessage: null,
  };

  if (!result.isConfigured || !result.isValidSchema) {
    result.connectionSuccess = false;
    result.errorMessage = "Missing or invalid Supabase connection parameters. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
    return result;
  }

  if (!supabase) {
    result.connectionSuccess = false;
    result.errorMessage = "Supabase SDK client could not be instantiated.";
    return result;
  }

  try {
    // Attempt index probe. Querying session is the fastest, safest way to verify if public Anon keys match the API endpoint is responding.
    const { error } = await supabase.auth.getSession();
    
    if (error) {
      result.connectionSuccess = false;
      result.errorMessage = error.message;
    } else {
      result.connectionSuccess = true;
    }
  } catch (err: any) {
    result.connectionSuccess = false;
    result.errorMessage = err?.message || String(err);
  }

  return result;
}

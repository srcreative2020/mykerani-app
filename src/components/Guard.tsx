import React from "react";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import { Loader2 } from "lucide-react";

export const Guard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans" id="auth_loader">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-slate-900 animate-spin" />
          <p className="text-sm font-medium text-slate-600 font-mono tracking-tight animate-pulse">
            Syncing user session state...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
};

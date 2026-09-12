"use client";

import {
  GoogleAuthProvider,
  User,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { configureApiIdentity } from "@/lib/api";
import { firebaseIsConfigured, getFirebaseAuth } from "@/lib/firebase";

type AuthState = "loading" | "ready" | "configuration_required";

interface AuthContextValue {
  state: AuthState;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueLocally: () => void;
  logout: () => Promise<void>;
}

const LOCAL_ANALYST_USER = {
  uid: "local-analyst",
  email: "analyst@solen.ai",
  displayName: "Lead Intelligence Analyst",
  getIdToken: async () => "local-dev-token",
} as unknown as User;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(firebaseIsConfigured ? "loading" : "ready");
  const [user, setUser] = useState<User | null>(firebaseIsConfigured ? null : LOCAL_ANALYST_USER);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      configureApiIdentity(async () => "local-dev-token");
      return;
    }
    configureApiIdentity(async () => {
      const current = auth.currentUser;
      return current ? current.getIdToken() : null;
    });
    return onIdTokenChanged(auth, (nextUser) => {
      setUser(nextUser);
      setState("ready");
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase is not configured.");
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase is not configured.");
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const continueLocally = useCallback(() => {
    setUser(LOCAL_ANALYST_USER);
    setState("ready");
  }, []);

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ state, user, signInWithEmail, signInWithGoogle, continueLocally, logout }),
    [state, user, signInWithEmail, signInWithGoogle, continueLocally, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be rendered inside AuthProvider.");
  return context;
}

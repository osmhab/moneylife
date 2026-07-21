"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase/index";
import { onAuthStateChanged, User as FirebaseAuthUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

interface UserContextType {
  user: FirebaseAuthUser | null;
  clientData: any | null;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType>({ user: null, clientData: null, isLoading: true });

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthUser | null>(null);
  const [clientData, setClientData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      
      if (authUser) {
        const unsubscribeDoc = onSnapshot(doc(db, "clients", authUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setClientData(docSnap.data());
          }
        });
        setIsLoading(false);
        return () => unsubscribeDoc();
      } else {
        setClientData(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <UserContext.Provider value={{ user, clientData, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
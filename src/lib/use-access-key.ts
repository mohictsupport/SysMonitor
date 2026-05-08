import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface AccessKeyData {
  password: string;
}

export function useAccessKey() {
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const docRef = doc(db, "access_key", "main");

    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as AccessKeyData;
          setAccessKey(data.password);
          setError(null);
        } else {
          setAccessKey(null);
          setError("Access key not configured");
        }
        setLoading(false);
      },
      (err) => {
        console.error("[Firestore] Error fetching access key:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch access key");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const verifyAccessKey = useCallback((inputPassword: string): boolean => {
    if (!accessKey) return false;
    return inputPassword === accessKey;
  }, [accessKey]);

  return { accessKey, loading, error, verifyAccessKey };
}

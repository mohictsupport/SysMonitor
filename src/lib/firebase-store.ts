import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  deleteDoc,
} from "firebase/firestore";

// User preferences interface
export interface UserPreferences {
  userId: string;
  alertingRules?: {
    siteOffline?: boolean;
    highLatency?: boolean;
    latencyThreshold?: number;
  };
  notificationSettings?: {
    telegramEnabled?: boolean;
    telegramChatId?: string;
    emailEnabled?: boolean;
    desktopEnabled?: boolean;
  };
  uiPreferences?: {
    theme?: "light" | "dark" | "system";
    refreshInterval?: number;
  };
  updatedAt: Timestamp;
}

// Get user preferences
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const docRef = doc(db, "users", userId, "preferences", "settings");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserPreferences;
    }
    return null;
  } catch (error) {
    console.error("Error getting user preferences:", error);
    return null;
  }
}

// Save user preferences
export async function saveUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>,
): Promise<void> {
  try {
    const docRef = doc(db, "users", userId, "preferences", "settings");
    const existing = await getUserPreferences(userId);

    const data: UserPreferences = {
      userId,
      ...existing,
      ...preferences,
      updatedAt: Timestamp.now(),
    };

    await setDoc(docRef, data);
  } catch (error) {
    console.error("Error saving user preferences:", error);
    throw error;
  }
}

// Update user preferences
export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>,
): Promise<void> {
  try {
    const docRef = doc(db, "users", userId, "preferences", "settings");
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error updating user preferences:", error);
    throw error;
  }
}

// Historical uptime data interface
export interface UptimeHistoryEntry {
  siteId: string;
  siteName: string;
  status: "online" | "offline" | "degraded";
  timestamp: Timestamp;
  userId: string;
}

// Save uptime history entry
export async function saveUptimeHistory(
  entry: Omit<UptimeHistoryEntry, "timestamp">,
): Promise<void> {
  try {
    const historyRef = collection(db, "uptime_history");
    const docRef = doc(historyRef);
    await setDoc(docRef, {
      ...entry,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error saving uptime history:", error);
    throw error;
  }
}

// Batch save uptime history entries
export async function batchSaveUptimeHistory(
  entries: Array<Omit<UptimeHistoryEntry, "timestamp">>,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  try {
    const historyRef = collection(db, "uptime_history");

    // Process in batches of 500 (Firestore limit)
    const batchSize = 500;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      for (const entry of batch) {
        try {
          const docRef = doc(historyRef);
          await setDoc(docRef, {
            ...entry,
            timestamp: Timestamp.now(),
          });
          success++;
        } catch (error) {
          failed++;
          console.error("Failed to save uptime entry:", error);
        }
      }
    }

    return { success, failed };
  } catch (error) {
    console.error("Error in batch save uptime history:", error);
    return { success, failed };
  }
}

// Cleanup old uptime history (keep only 30 days)
export async function cleanupOldUptimeHistory(userId: string): Promise<{ deleted: number }> {
  try {
    const historyRef = collection(db, "uptime_history");
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const q = query(
      historyRef,
      where("userId", "==", userId),
      where("timestamp", "<", thirtyDaysAgo),
    );

    const querySnapshot = await getDocs(q);
    let deleted = 0;

    // Delete old documents
    for (const doc of querySnapshot.docs) {
      await deleteDoc(doc.ref);
      deleted++;
    }

    console.log(`[Cleanup] Deleted ${deleted} old uptime history entries (older than 30 days)`);
    return { deleted };
  } catch (error) {
    console.error("Error cleaning up old uptime history:", error);
    return { deleted: 0 };
  }
}

// Get uptime history for a site (last 30 days)
export async function getUptimeHistory(
  siteId: string,
  userId: string,
  limit: number = 100,
): Promise<UptimeHistoryEntry[]> {
  try {
    const historyRef = collection(db, "uptime_history");
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const q = query(
      historyRef,
      where("siteId", "==", siteId),
      where("userId", "==", userId),
      where("timestamp", ">=", thirtyDaysAgo),
    );

    const querySnapshot = await getDocs(q);
    const entries: UptimeHistoryEntry[] = [];

    querySnapshot.forEach((doc) => {
      entries.push(doc.data() as UptimeHistoryEntry);
    });

    // Sort by timestamp descending and limit
    return entries.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()).slice(0, limit);
  } catch (error) {
    console.error("Error getting uptime history:", error);
    return [];
  }
}

// Provisioning data interface
export interface ProvisioningEntry {
  setupKey: string;
  siteName: string;
  location: string;
  hostname: string;
  status: "pending" | "provisioning" | "provisioned" | "failed";
  createdAt: Timestamp;
  userId: string;
}

// Save provisioning entry
export async function saveProvisioningEntry(
  entry: Omit<ProvisioningEntry, "createdAt">,
): Promise<void> {
  try {
    const provisioningRef = collection(db, "provisioning");
    const docRef = doc(provisioningRef);
    await setDoc(docRef, {
      ...entry,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error saving provisioning entry:", error);
    throw error;
  }
}

// Get pending provisioning entries
export async function getPendingProvisioning(userId: string): Promise<ProvisioningEntry[]> {
  try {
    const provisioningRef = collection(db, "provisioning");
    const q = query(
      provisioningRef,
      where("userId", "==", userId),
      where("status", "==", "pending"),
    );

    const querySnapshot = await getDocs(q);
    const entries: ProvisioningEntry[] = [];

    querySnapshot.forEach((doc) => {
      entries.push(doc.data() as ProvisioningEntry);
    });

    return entries;
  } catch (error) {
    console.error("Error getting pending provisioning:", error);
    return [];
  }
}

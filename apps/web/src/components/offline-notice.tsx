"use client";

import { useEffect, useState } from "react";

export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = (): void => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-notice" role="status" aria-live="polite">
      You’re offline. Your current view remains readable; reconnect before
      saving changes.
    </div>
  );
}

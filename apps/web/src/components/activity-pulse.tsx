"use client";

import { useEffect } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function ActivityPulse() {
  useEffect(() => {
    void fetch(`${apiUrl}/notifications/activity`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders(),
    }).catch(() => undefined);
  }, []);
  return null;
}

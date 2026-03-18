import { useState, useEffect, useRef } from "react";

const PING_INTERVAL = 30_000; // 30 seconds

export function useHealth() {
  const [healthy, setHealthy] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const ping = async () => {
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          signal: abortController.signal,
        });
        setHealthy(res.ok);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHealthy(false);
      }
    };

    // Initial ping
    ping();

    // Poll every 30s
    intervalRef.current = setInterval(ping, PING_INTERVAL);

    return () => {
      abortController.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { healthy };
}

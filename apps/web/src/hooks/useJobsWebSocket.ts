/**
 * useJobsWebSocket — connects to /ws/jobs and triggers a jobs refetch
 * whenever the server pushes a "jobUpdated" or "refresh" message.
 *
 * Returns:
 *   isConnected  — true when the WebSocket is open
 *   lastMessage  — the last parsed message from the server
 *
 * The hook reconnects automatically with exponential backoff if the
 * connection drops (server restart, sleep/wake, etc.).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const WS_URL = `ws://${window.location.hostname}:${window.location.port || 3456}/ws/jobs`;

interface WsMessage {
  type: "jobUpdated" | "refresh";
  job_id?: string;
  status?: string;
}

export function useJobsWebSocket() {
  const qc = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const retryDelay = useRef(1000); // starts at 1s, doubles up to 30s
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      retryDelay.current = 1000; // reset backoff on successful connect
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        setLastMessage(msg);

        // Invalidate the jobs list so the Kanban board auto-refreshes
        if (msg.type === "jobUpdated" || msg.type === "refresh") {
          void qc.invalidateQueries({ queryKey: ["jobs"] });
          // Also invalidate the specific job detail if open
          if (msg.job_id) {
            void qc.invalidateQueries({ queryKey: ["job", msg.job_id] });
          }
        }
      } catch {
        // Non-JSON ping — ignore
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
      ws.current = null;
      // Reconnect with backoff
      retryTimer.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
        connect();
      }, retryDelay.current);
    };

    socket.onerror = () => {
      // onclose fires after onerror, so backoff reconnect is handled there
      setIsConnected(false);
    };
  }, [qc]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { isConnected, lastMessage };
}

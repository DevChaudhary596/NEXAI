"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, X } from "lucide-react";
import { listAlerts, markAlertSeen } from "@/lib/api";
import { getStoredWatchEmail } from "@/lib/watchEmail";
import type { AlertResponse } from "@/types";

const POLL_MS = 30000;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Header bell for AOI-watch alerts. There's no login system, so "whose
 * alerts" is just whatever email localStorage remembers from the last
 * "Monitor this AOI" the user set up (see lib/watchEmail.ts) - no email
 * remembered yet means no watches exist yet, so the bell simply stays quiet.
 */
export default function AlertsBell() {
  const [email, setEmail] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (forEmail: string) => {
    try {
      const res = await listAlerts(forEmail);
      setAlerts(res.alerts);
    } catch {
      /* backend offline or unreachable - leave the last known list showing */
    }
  }, []);

  // Reads localStorage, which only exists client-side - the initial read (and
  // every later re-check, in case a watch was just created elsewhere on the
  // page) runs on a timer rather than synchronously in the effect body, so
  // the very first render still matches the server-rendered (email-less)
  // markup and hydration doesn't mismatch.
  useEffect(() => {
    const check = () => {
      const stored = getStoredWatchEmail();
      setEmail((prev) => (stored !== prev ? stored : prev));
    };
    const timeout = setTimeout(check, 0);
    const interval = setInterval(check, 3000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!email) return;
    const timeout = setTimeout(() => refresh(email), 0);
    const interval = setInterval(() => refresh(email), POLL_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [email, refresh]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unseenCount = alerts.filter((a) => !a.seen).length;

  const handleMarkSeen = async (alertId: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, seen: true } : a)));
    try {
      await markAlertSeen(alertId);
    } catch {
      /* best-effort - a stale "seen" flag isn't worth surfacing an error for */
    }
  };

  if (!email) return null;

  return (
    <div className="alerts-bell" ref={panelRef}>
      <button
        className="alerts-bell__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${unseenCount} unread alerts`}
      >
        <Bell size={16} />
        {unseenCount > 0 && (
          <span className="alerts-bell__badge">{unseenCount > 9 ? "9+" : unseenCount}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="alerts-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16 }}
          >
            <div className="alerts-panel__header">
              <span>Watch Alerts</span>
              <span className="alerts-panel__email">{email}</span>
            </div>
            <div className="alerts-panel__list">
              {alerts.length === 0 ? (
                <div className="alerts-panel__empty">
                  No alerts yet — you&apos;ll see updates here when a new
                  satellite pass detects a meaningful change.
                </div>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`alerts-panel__item ${a.seen ? "" : "alerts-panel__item--unseen"}`}
                  >
                    <div className="alerts-panel__item-message">{a.message}</div>
                    <div className="alerts-panel__item-footer">
                      <span>{formatWhen(a.created_at)}</span>
                      {!a.seen && (
                        <button
                          className="alerts-panel__item-ack"
                          onClick={() => handleMarkSeen(a.id)}
                          aria-label="Mark as read"
                        >
                          <Check size={11} /> Mark read
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <button className="alerts-panel__close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

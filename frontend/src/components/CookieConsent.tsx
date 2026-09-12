"use client";

import React, { useEffect, useState } from "react";

const CONSENT_KEY = "solen.cookie-consent";

export default function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!window.localStorage.getItem(CONSENT_KEY));
    const reopen = () => setOpen(true);
    window.addEventListener("solen:cookie-settings", reopen);
    return () => window.removeEventListener("solen:cookie-settings", reopen);
  }, []);

  function save(value: "essential" | "all") {
    window.localStorage.setItem(CONSENT_KEY, value);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <section className="cookie-consent" role="region" aria-label="Cookie preferences">
      <div>
        <strong>Cookie preferences</strong>
        <p>SOLEN uses essential storage for secure sessions, workspace selection, and your consent preference. Optional analytics remain disabled unless you accept them.</p>
      </div>
      <div className="cookie-consent__actions">
        <button type="button" className="cookie-consent__secondary" onClick={() => save("essential")}>Essential only</button>
        <button type="button" onClick={() => save("all")}>Accept all</button>
      </div>
    </section>
  );
}

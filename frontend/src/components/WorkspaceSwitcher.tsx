"use client";

import React, { FormEvent, useState } from "react";
import { Building2, ChevronDown, Plus } from "lucide-react";

import type { Classification, WorkspaceResponse } from "@/types";

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceResponse[];
  activeWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  onCreate: (name: string, classification: Classification) => Promise<void>;
}

export default function WorkspaceSwitcher({ workspaces, activeWorkspaceId, onSelect, onCreate }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [classification, setClassification] = useState<Classification>("unclassified");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onCreate(name.trim(), classification);
      setName("");
      setIsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-switcher">
      <button type="button" className="workspace-switcher__trigger" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-haspopup="dialog">
        <Building2 size={16} aria-hidden="true" />
        <span>{active ? active.name : "Select workspace"}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {isOpen && (
        <section className="workspace-switcher__menu" role="dialog" aria-label="Switch workspace">
          <p className="workspace-switcher__label">YOUR WORKSPACES</p>
          {workspaces.length ? workspaces.map((workspace) => (
            <button key={workspace.id} type="button" className={`workspace-switcher__option ${workspace.id === activeWorkspaceId ? "workspace-switcher__option--active" : ""}`} onClick={() => { onSelect(workspace.id); setIsOpen(false); }}>
              <span>{workspace.name}</span><small>{workspace.role} · {workspace.classification}</small>
            </button>
          )) : <p className="workspace-switcher__empty">No workspace is assigned to this account yet.</p>}
          <form onSubmit={submit} className="workspace-switcher__create">
            <p className="workspace-switcher__label">CREATE WORKSPACE</p>
            <label>Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label>
            <label>Data classification<select value={classification} onChange={(event) => setClassification(event.target.value as Classification)}><option value="unclassified">Unclassified</option><option value="restricted">Restricted</option><option value="confidential">Confidential</option></select></label>
            {error && <p className="workspace-switcher__error" role="alert">{error}</p>}
            <button type="submit" disabled={busy || name.trim().length < 2}><Plus size={14} /> {busy ? "Creating…" : "Create workspace"}</button>
          </form>
        </section>
      )}
    </div>
  );
}

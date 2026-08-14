"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Node = { id: string; alias: string; lastSeen: string | null; revokedAt: string | null; privacy: { projectMode: string; includeTitles: boolean } };
type Session = { nodeId: string; modelCalls?: number; usage?: { totalTokens?: number } };
type Usage = { nodes: Node[]; sessions: Session[]; weeklyQuota: { remainingPercent?: number | null } | null; generatedAt: string };

function relative(value: string | null): string {
  if (!value) return "jamais synchronisée";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.round(seconds / 60)} min`;
  return `il y a ${Math.round(seconds / 3600)} h`;
}

export default function MeshDashboard({ displayName, signOutPath }: { displayName: string; signOutPath: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [enrollment, setEnrollment] = useState<{ code: string; expiresAt: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/mesh/usage", { cache: "no-store" });
    if (!response.ok) throw new Error("Les données Mesh ne sont pas disponibles.");
    setUsage(await response.json());
  }, []);
  useEffect(() => {
    let current = true;
    fetch("/api/mesh/usage", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Les données Mesh ne sont pas disponibles.")))
      .then((body) => { if (current) setUsage(body); })
      .catch((cause) => { if (current) setError(cause.message); });
    return () => { current = false; };
  }, []);
  const active = useMemo(() => usage?.nodes.filter((node) => !node.revokedAt) || [], [usage]);
  const totals = useMemo(() => (usage?.sessions || []).reduce((sum, session) => ({
    calls: sum.calls + (session.modelCalls || 0),
    tokens: sum.tokens + (session.usage?.totalTokens || 0),
  }), { calls: 0, tokens: 0 }), [usage]);

  async function createEnrollment() {
    setError("");
    const response = await fetch("/api/mesh/enrollments", { method: "POST" });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "Création impossible.");
    setEnrollment(body);
  }

  async function revoke(node: Node) {
    if (!confirm(`Révoquer « ${node.alias} » ? Cette machine ne pourra plus synchroniser.`)) return;
    const response = await fetch(`/api/mesh/nodes/${encodeURIComponent(node.id)}`, { method: "DELETE" });
    if (!response.ok) return setError("Révocation impossible.");
    await load();
  }

  return (
    <main className="mesh-shell">
      <header className="mesh-header">
        <div><p className="eyebrow">CODEX USAGE MESH</p><h1>Activité agrégée, machine par machine</h1><p className="subtitle">Métadonnées minimisées, transport signé, quota jamais additionné.</p></div>
        <div className="account"><span className="secure-pill"><i />{displayName}</span><a href={signOutPath}>Déconnexion</a></div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="metrics" aria-label="Aperçu global">
        <article><span>Machines actives</span><strong>{active.length}</strong><small>{usage?.nodes.filter((node) => node.revokedAt).length || 0} révoquée(s)</small></article>
        <article><span>Sessions observées</span><strong>{usage ? usage.sessions.length.toLocaleString("fr-FR") : "—"}</strong><small>Filtrables par machine dans le dashboard</small></article>
        <article><span>Appels modèle</span><strong>{usage ? totals.calls.toLocaleString("fr-FR") : "—"}</strong><small>{usage ? `${totals.tokens.toLocaleString("fr-FR")} tokens` : "Chargement…"}</small></article>
        <article><span>Quota hebdomadaire restant</span><strong>{usage?.weeklyQuota?.remainingPercent == null ? "—" : `${usage.weeklyQuota.remainingPercent} %`}</strong><small>Dernière observation, jamais une somme</small></article>
      </section>
      <section className="mesh-panel">
        <div className="panel-heading"><div><p className="eyebrow">RÉSEAU</p><h2>Machines enrôlées</h2></div><button type="button" onClick={createEnrollment}>Ajouter une machine</button></div>
        {enrollment && <div className="enrollment" role="status"><div><strong>Code à usage unique</strong><code>{enrollment.code}</code></div><small>Expire à {new Date(enrollment.expiresAt).toLocaleTimeString("fr-FR")}. Copiez-le dans la configuration de l’agent.</small></div>}
        <div className="node-list">
          {!usage && !error && <p className="loading">Chargement du réseau…</p>}
          {usage && usage.nodes.length === 0 && <p className="loading">Aucune machine. Créez un code pour enrôler votre premier PC.</p>}
          {usage?.nodes.map((node) => <article className={`node-row ${node.revokedAt ? "revoked" : ""}`} key={node.id}>
            <span className="node-icon">PC</span><div><strong>{node.alias}</strong><small>{node.revokedAt ? `Révoquée ${relative(node.revokedAt)}` : `${usage.sessions.filter((session) => session.nodeId === node.id).length.toLocaleString("fr-FR")} sessions · synchronisée ${relative(node.lastSeen)} · projets ${node.privacy.projectMode}`}</small></div>
            {node.revokedAt ? <span className="node-status">Révoquée</span> : <button className="danger" type="button" onClick={() => revoke(node)}>Révoquer</button>}
          </article>)}
        </div>
      </section>
    </main>
  );
}

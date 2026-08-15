import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import MeshDashboard from "../mesh-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="signin-shell">
        <p className="eyebrow">CODEX USAGE MESH</p>
        <h1>Administration privée des machines</h1>
        <p className="subtitle">Connectez-vous avec le compte propriétaire pour gérer les enrôlements.</p>
        <a className="primary-link" href={chatGPTSignInPath("/admin")}>Se connecter avec ChatGPT</a>
      </main>
    );
  }
  return <MeshDashboard displayName={user.displayName} signOutPath={chatGPTSignOutPath("/admin")} />;
}

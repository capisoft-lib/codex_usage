import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="signin-shell">
        <p className="eyebrow">CODEX USAGE MESH</p>
        <h1>Votre usage Codex, réuni en privé</h1>
        <p className="subtitle">Connectez-vous avec le compte ChatGPT autorisé pour consulter les machines enrôlées.</p>
        <a className="primary-link" href={chatGPTSignInPath("/")}>Se connecter avec ChatGPT</a>
        <p className="privacy-note">Les agents n’envoient ni conversations, ni commandes, ni identifiants Codex.</p>
      </main>
    );
  }
  redirect("/dashboard/index.html");
}

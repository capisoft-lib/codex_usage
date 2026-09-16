const OPTION_ENV = new Map([
  ["--associate", "MESH_ENROLLMENT_CODE"],
  ["--hub-url", "MESH_HUB_URL"],
  ["--alias", "MESH_NODE_ALIAS"],
  ["--state-path", "MESH_AGENT_STATE_PATH"],
]);

export function parseAgentOptions(argv, baseEnv = process.env) {
  const env = { ...baseEnv };
  let help = false;
  let once = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      help = true;
      continue;
    }
    if (option === "--once") {
      once = true;
      continue;
    }
    if (option === "--include-titles") {
      env.MESH_INCLUDE_TITLES = "true";
      continue;
    }
    const envName = OPTION_ENV.get(option);
    if (!envName) throw new Error(`Option inconnue : ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${option}.`);
    env[envName] = value;
    index += 1;
  }
  return { env, help, once };
}

export const AGENT_HELP = `Usage : npm run start:agent -- [options]

  --associate <code>   Associe cette machine avec un code à usage unique
  --hub-url <url>      Adresse publique fournie par la page /admin
  --alias <nom>        Nom lisible de la machine (facultatif)
  --state-path <fichier> Emplacement de l’identité persistante (facultatif)
  --once               Synchronise une fois puis quitte (installation)
  --include-titles     Transmet les titres Codex au tableau de bord central
  --help               Affiche cette aide`;

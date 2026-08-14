export type Viewer = { id: string; email: string; name: string };

export function viewerFromHeaders(headers: Headers): Viewer | null {
  const id = headers.get("oai-authenticated-user-id");
  const email = headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  const encodedName = headers.get("oai-authenticated-user-full-name");
  let name = email;
  if (encodedName && headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encodedName); } catch { /* use email */ }
  }
  return { id, email, name };
}

export function requireViewer(request: Request): Viewer {
  const viewer = viewerFromHeaders(request.headers);
  if (!viewer) throw new Response("Authentification ChatGPT requise.", { status: 401 });
  return viewer;
}

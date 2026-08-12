import { watch } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat, readdir, writeFile, rename } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "docs");
const configFile = join(root, "content/hubs.json");
const adminRoot = join(root, "src/admin");
const iconRoot = join(root, "node_modules/@tabler/icons/icons/outline");
const iconNames = (await readdir(iconRoot)).filter((name) => name.endsWith(".svg")).map((name) => name.slice(0, -4)).sort();
let buildQueue = Promise.resolve();

function build() {
  const run = () => new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? done() : reject(new Error(`Build fallita (${code})`)));
  });
  buildQueue = buildQueue.then(run, run);
  return buildQueue;
}

await build();
for (const folder of ["content", "src"]) watch(join(root, folder), { recursive: true }, () => build().catch(console.error));

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/admin" || pathname === "/admin/") return await sendFile(res, join(adminRoot, "index.html"));
    if (pathname === "/admin/admin.css") return await sendFile(res, join(adminRoot, "admin.css"));
    if (pathname === "/admin/admin.js") return await sendFile(res, join(adminRoot, "admin.js"));
    if (pathname === "/admin/api/config" && req.method === "GET") return sendJson(res, 200, JSON.parse(await readFile(configFile, "utf8")));
    if (pathname === "/admin/api/icons" && req.method === "GET") return sendJson(res, 200, iconNames);
    if (pathname === "/admin/api/config" && req.method === "PUT") return await saveConfig(req, res);
    const iconMatch = pathname.match(/^\/admin\/icon\/([a-z0-9-]+)\.svg$/);
    if (iconMatch && iconNames.includes(iconMatch[1])) return await sendAdminIcon(res, iconMatch[1]);
    if (pathname.startsWith("/admin/")) return sendJson(res, 404, { error: "Risorsa editor non trovata." });

    let file = join(output, pathname);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    return await sendFile(res, file);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(output, "404.html")));
  }
}).listen(4173, "127.0.0.1", () => {
  console.log("Editor:   http://localhost:4173/admin/");
  console.log("Anteprima: http://localhost:4173/");
});

async function saveConfig(req, res) {
  try {
    const raw = await readBody(req);
    const next = JSON.parse(raw);
    validate(next);
    const temporary = join(root, "content/.hubs.next.json");
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, configFile);
    await build();
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

function validate(data) {
  if (!data?.site?.title?.trim()) throw new Error("Il titolo generale non può essere vuoto.");
  if (!Array.isArray(data.hubs)) throw new Error("La lista degli hub non è valida.");
  const slugs = new Set();
  for (const hub of data.hubs) {
    if (!hub.name?.trim()) throw new Error("Ogni hub deve avere un nome.");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(hub.slug ?? "")) throw new Error(`Lo slug “${hub.slug}” può contenere solo lettere minuscole, numeri e trattini.`);
    if (slugs.has(hub.slug)) throw new Error(`Lo slug “${hub.slug}” è usato due volte.`);
    slugs.add(hub.slug);
    if (hub.info !== undefined && (!Array.isArray(hub.info) || hub.info.some((item) => typeof item !== "string"))) throw new Error(`Le informazioni di “${hub.name}” non sono valide.`);
    if (!Array.isArray(hub.sections)) throw new Error(`Le sezioni di “${hub.name}” non sono valide.`);
    for (const section of hub.sections) {
      if (!section.title?.trim()) throw new Error(`Una sezione di “${hub.name}” non ha nome.`);
      if (!Array.isArray(section.links)) throw new Error(`I link della sezione “${section.title}” non sono validi.`);
      for (const link of section.links) {
        if (!link.label?.trim()) throw new Error(`Assegna un nome a tutti i link nella sezione “${section.title}”.`);
        if (!iconNames.includes(link.icon)) throw new Error(`L’icona “${link.icon}” non esiste in Tabler Icons.`);
      }
    }
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Il file è troppo grande.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function sendFile(res, file) {
  const content = await readFile(file);
  res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(content);
}

async function sendAdminIcon(res, name) {
  const svg = (await readFile(join(iconRoot, `${name}.svg`), "utf8"))
    .replaceAll("currentColor", "#f1eee8");
  res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
  res.end(svg);
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

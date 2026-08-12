import { readFile, rm, mkdir, writeFile, cp } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "docs");
const iconRoot = join(root, "node_modules/@tabler/icons/icons/outline");
const data = JSON.parse(await readFile(join(root, "content/hubs.json"), "utf8"));
const iconSvgs = new Map();

validate(data);
await loadUsedIcons(data);
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "assets"), { recursive: true });
await cp(join(root, "src/public"), output, { recursive: true, force: true });
await cp(join(root, "src/styles.css"), join(output, "assets/styles.css"));
await writeFile(join(output, ".nojekyll"), "");

for (const hub of data.hubs) {
  const target = join(output, hub.slug);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "index.html"), renderHub(data.site, hub));
}

await writeFile(join(output, "index.html"), renderDirectory(data.site, data.hubs.filter((hub) => hub.published !== false)));
await writeFile(join(output, "404.html"), renderNotFound(data.site));
console.log(`Built ${data.hubs.length} hub(s) in docs/`);

function validate({ site, hubs }) {
  if (!site?.title || !Array.isArray(hubs)) throw new Error("hubs.json: servono site.title e hubs[].");
  const seen = new Set();
  for (const hub of hubs) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(hub.slug ?? "")) throw new Error(`Slug non valido: ${hub.slug}`);
    if (seen.has(hub.slug)) throw new Error(`Slug duplicato: ${hub.slug}`);
    seen.add(hub.slug);
    if (!hub.name || !Array.isArray(hub.sections)) throw new Error(`Hub incompleto: ${hub.slug}`);
    if (hub.info !== undefined && (!Array.isArray(hub.info) || hub.info.some((item) => typeof item !== "string"))) throw new Error(`Informazioni non valide: ${hub.slug}`);
    for (const section of hub.sections) {
      if (!section.title || !Array.isArray(section.links)) throw new Error(`Sezione incompleta in ${hub.slug}`);
      for (const link of section.links) if (!link.label) throw new Error(`Link senza nome in ${hub.slug}`);
    }
  }
}

function shell({ site, title, description, accent = "#e36b3d", body, bodyClass = "", assetPrefix = "." }) {
  return `<!doctype html>
<html lang="it" style="--accent:${escapeAttr(accent)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttr(description || title)}">
  <meta name="theme-color" content="${escapeAttr(accent)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description || title)}">
  <meta property="og:type" content="website">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${assetPrefix}/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${assetPrefix}/assets/styles.css">
</head>
<body class="${escapeAttr(bodyClass)}">${body}</body>
</html>`;
}

function renderHub(site, hub) {
  const sections = hub.sections.map((section) => `
    <section class="section" aria-labelledby="${id(section.title)}">
      <h2 class="section-title" id="${id(section.title)}">${escapeHtml(section.title)}</h2>
      <div class="links">${section.links.map(renderLink).join("")}</div>
    </section>`).join("");
  const body = `
  <main class="page">
    <header class="hero">
      <p class="eyebrow">Hub</p>
      <div class="hub-identity">
        ${hub.logo ? `<img class="hub-logo" src="${escapeAttr(publicUrl(hub.logo, ".."))}" alt="">` : ""}
        <h1>${escapeHtml(hub.name)}</h1>
      </div>
      ${hub.info?.length ? `<ul class="hub-info">${hub.info.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </header>
    ${sections}
    ${renderFooter(site)}
  </main>`;
  return shell({ site, title: `${hub.name} — ${site.title}`, accent: hub.accent, body, assetPrefix: ".." });
}

function renderDirectory(site, hubs) {
  const cards = hubs.map((hub) => `
      <a class="link-card hub-card" href="./${encodeURIComponent(hub.slug)}/">
        <span class="link-copy"><span class="link-label">${escapeHtml(hub.name)}</span></span>
        <span class="hub-card-side">${hub.logo ? `<img class="hub-card-logo" src="${escapeAttr(publicUrl(hub.logo, "."))}" alt="">` : ""}<span class="link-arrow" aria-hidden="true">↗</span></span>
      </a>`).join("");
  const body = `
  <main class="page directory">
    <header class="hero"><p class="eyebrow">Directory</p><h1>${escapeHtml(site.title)}</h1></header>
    <div class="hub-list">${cards}</div>
    ${renderFooter(site)}
  </main>`;
  return shell({ site, title: site.title, body, bodyClass: "directory" });
}

function renderNotFound(site) {
  const body = `<main class="page"><header class="hero"><p class="eyebrow">Errore 404</p><h1>Pagina non trovata.</h1><p><a href="./">Torna alla directory</a>.</p></header></main>`;
  return shell({ site, title: `Pagina non trovata — ${site.title}`, description: "Pagina non trovata", body });
}

function renderLink(link) {
  if (!link.url?.trim()) {
    return `
        <div class="link-card link-card-disabled" aria-disabled="true">
          <span class="link-icon" aria-hidden="true">${icon(link.icon)}</span>
          <span class="link-copy"><span class="link-label">${escapeHtml(link.label)}</span></span>
        </div>`;
  }
  const external = /^https?:\/\//.test(link.url);
  return `
        <a class="link-card" href="${escapeAttr(link.url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
          <span class="link-icon" aria-hidden="true">${icon(link.icon)}</span>
          <span class="link-copy"><span class="link-label">${escapeHtml(link.label)}</span></span>
          <span class="link-arrow" aria-hidden="true">↗</span>
        </a>`;
}

function renderFooter(site) {
  return `<footer class="footer"><span>${escapeHtml(site.title)}</span><span>© ${new Date().getFullYear()}</span></footer>`;
}

function icon(name = "arrow-right") {
  return iconSvgs.get(name) ?? "";
}

async function loadUsedIcons({ hubs }) {
  const names = new Set(hubs.flatMap((hub) => hub.sections.flatMap((section) => section.links.map((link) => link.icon || "arrow-right"))));
  await Promise.all([...names].map(async (name) => {
    if (!/^[a-z0-9-]+$/.test(name)) return;
    try {
      const svg = await readFile(join(iconRoot, `${name}.svg`), "utf8");
      iconSvgs.set(name, svg.replace(/<\?xml[^>]*>/g, "").trim());
    } catch {
      throw new Error(`Icona Tabler sconosciuta: "${name}"`);
    }
  }));
}

function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function escapeAttr(value = "") { return escapeHtml(value); }
function id(value = "") { return `section-${value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`; }
function publicUrl(value, prefix) { return /^https?:\/\//.test(value) ? value : `${prefix}/${value.replace(/^\/+/, "")}`; }

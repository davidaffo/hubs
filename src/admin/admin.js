let config;
let icons = [];
let activeHub = 0;
let iconTarget = null;
let dirty = false;
let draggedLink = null;

const $ = (selector, root = document) => root.querySelector(selector);
const hubList = $("#hub-list");
const editor = $("#editor");
const dialog = $("#icon-dialog");

init().catch((error) => setStatus(error.message, "error"));

async function init() {
  const [configResponse, iconsResponse] = await Promise.all([fetch("/admin/api/config"), fetch("/admin/api/icons")]);
  if (!configResponse.ok || !iconsResponse.ok) throw new Error("Impossibile caricare l’editor.");
  config = await configResponse.json();
  icons = await iconsResponse.json();
  render();
}

function render() {
  renderNavigation();
  const hub = config.hubs[activeHub];
  if (!hub) {
    $("#page-title").textContent = "I tuoi hub";
    editor.replaceChildren($("#empty-template").content.cloneNode(true));
    return;
  }
  $("#page-title").textContent = hub.name || "Hub senza nome";
  $("#preview").href = `/${encodeURIComponent(hub.slug || "")}/`;
  editor.innerHTML = `
    <section class="panel hub-settings">
      ${field("Nome hub", "hub-name", hub.name)}
      ${field("Slug URL", "hub-slug", hub.slug)}
      <label class="field"><span>Colore</span><input id="hub-accent" type="color" value="${attr(hub.accent || "#e36b3d")}"></label>
      <label class="field wide"><span>Logo · URL o percorso in docs</span><input id="hub-logo" type="text" placeholder="assets/logo.png" value="${attr(hub.logo || "")}"></label>
      <label class="field wide"><span>Informazioni · una per riga</span><textarea id="hub-info" rows="3" placeholder="Lunedì · 19:00–21:00 · Palestra">${html((hub.info || []).join("\n"))}</textarea></label>
    </section>
    <div id="sections">${hub.sections.map(renderSection).join("")}</div>
    <div class="editor-actions"><button class="button secondary" data-action="add-section">＋ Nuova sezione</button><button class="button danger" data-action="delete-hub">Elimina hub</button></div>`;
}

function renderNavigation() {
  hubList.innerHTML = config.hubs.map((hub, index) => `<button class="hub-nav${index === activeHub ? " active" : ""}" data-hub="${index}" style="--hub-accent:${attr(hub.accent)}"><span class="hub-dot"></span>${html(hub.name || "Senza nome")}</button>`).join("");
}

function renderSection(section, sectionIndex) {
  return `<section class="panel section-panel" data-section="${sectionIndex}">
    <header class="section-head">
      <input class="section-name" aria-label="Nome sezione" value="${attr(section.title)}">
      <div class="mini-actions">
        <button class="icon-button" data-action="section-up" title="Sposta su">↑</button>
        <button class="icon-button" data-action="section-down" title="Sposta giù">↓</button>
        <button class="icon-button delete" data-action="delete-section" title="Elimina sezione">×</button>
      </div>
    </header>
    <div class="link-list${section.links.length ? "" : " empty-list"}" data-link-list>${section.links.map((link, linkIndex) => renderLink(link, linkIndex)).join("")}</div>
    <button class="button ghost add-link" data-action="add-link">＋ Aggiungi link</button>
  </section>`;
}

function renderLink(link, linkIndex) {
  return `<div class="link-row" data-link="${linkIndex}">
    <button class="drag-handle" type="button" draggable="true" aria-label="Trascina per riordinare o cambiare categoria" title="Trascina per spostare">⠿</button>
    <button class="icon-choice" data-action="choose-icon" title="Scegli icona"><img src="/admin/icon/${encodeURIComponent(link.icon || "link")}.svg" alt=""></button>
    <input class="link-label-input" type="text" aria-label="Etichetta" placeholder="Nome del link" value="${attr(link.label)}">
    <input class="link-url-input" type="text" inputmode="url" aria-label="Indirizzo (facoltativo)" placeholder="URL facoltativo" value="${attr(link.url)}">
    <div class="mini-actions">
      <button class="icon-button" data-action="link-up" title="Sposta su">↑</button>
      <button class="icon-button" data-action="link-down" title="Sposta giù">↓</button>
      <button class="icon-button delete" data-action="delete-link" title="Elimina link">×</button>
    </div>
  </div>`;
}

function field(label, id, value) {
  return `<label class="field"><span>${label}</span><input id="${id}" type="text" value="${attr(value)}"></label>`;
}

hubList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hub]");
  if (!button) return;
  syncVisibleFields();
  activeHub = Number(button.dataset.hub);
  render();
});

editor.addEventListener("input", () => { syncVisibleFields(); markDirty(); });
editor.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  syncVisibleFields();
  const sectionElement = button.closest("[data-section]");
  const linkElement = button.closest("[data-link]");
  const sectionIndex = sectionElement ? Number(sectionElement.dataset.section) : -1;
  const linkIndex = linkElement ? Number(linkElement.dataset.link) : -1;
  const hub = config.hubs[activeHub];
  const section = hub?.sections[sectionIndex];

  switch (button.dataset.action) {
    case "add-section": hub.sections.push({ title: "Nuova sezione", links: [] }); break;
    case "delete-section": if (confirm("Eliminare questa sezione e tutti i suoi link?")) hub.sections.splice(sectionIndex, 1); else return; break;
    case "section-up": move(hub.sections, sectionIndex, sectionIndex - 1); break;
    case "section-down": move(hub.sections, sectionIndex, sectionIndex + 1); break;
    case "add-link": section.links.push({ label: "Nuovo link", url: "", icon: "link" }); break;
    case "delete-link": section.links.splice(linkIndex, 1); break;
    case "link-up": move(section.links, linkIndex, linkIndex - 1); break;
    case "link-down": move(section.links, linkIndex, linkIndex + 1); break;
    case "choose-icon": iconTarget = { sectionIndex, linkIndex }; openIcons(section.links[linkIndex].icon); return;
    case "delete-hub":
      if (!confirm(`Eliminare l’hub “${hub.name}”?`)) return;
      config.hubs.splice(activeHub, 1); activeHub = Math.max(0, activeHub - 1); break;
    default: return;
  }
  markDirty();
  render();
});

editor.addEventListener("dragstart", (event) => {
  const handle = event.target.closest(".drag-handle");
  if (!handle) return;
  const linkElement = handle.closest("[data-link]");
  const sectionElement = handle.closest("[data-section]");
  syncVisibleFields();
  draggedLink = {
    sectionIndex: Number(sectionElement.dataset.section),
    linkIndex: Number(linkElement.dataset.link)
  };
  linkElement.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${draggedLink.sectionIndex}:${draggedLink.linkIndex}`);
});

editor.addEventListener("dragover", (event) => {
  if (!draggedLink) return;
  const list = event.target.closest("[data-link-list]");
  if (!list) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDropIndicators();
  list.closest("[data-section]").classList.add("drop-section");
  const row = event.target.closest("[data-link]");
  if (row && !row.classList.contains("dragging")) {
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    row.classList.add(after ? "drop-after" : "drop-before");
  } else if (!row) {
    list.classList.add("drop-empty");
  }
});

editor.addEventListener("drop", (event) => {
  if (!draggedLink) return;
  const list = event.target.closest("[data-link-list]");
  if (!list) return;
  event.preventDefault();
  const targetSection = Number(list.closest("[data-section]").dataset.section);
  const row = event.target.closest("[data-link]");
  if (row?.classList.contains("dragging")) {
    draggedLink = null;
    clearDropIndicators();
    row.classList.remove("dragging");
    return;
  }
  let targetIndex = config.hubs[activeHub].sections[targetSection].links.length;
  if (row) {
    targetIndex = Number(row.dataset.link);
    if (event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2) targetIndex += 1;
  }
  moveLink(draggedLink.sectionIndex, draggedLink.linkIndex, targetSection, targetIndex);
  draggedLink = null;
  clearDropIndicators();
  markDirty();
  render();
});

editor.addEventListener("dragend", () => {
  draggedLink = null;
  clearDropIndicators();
  editor.querySelectorAll(".dragging").forEach((element) => element.classList.remove("dragging"));
});

$("#add-hub").addEventListener("click", () => {
  syncVisibleFields();
  config.hubs.push({ slug: `nuovo-hub-${config.hubs.length + 1}`, name: "Nuovo hub", accent: "#e36b3d", sections: [{ title: "Link", links: [] }] });
  activeHub = config.hubs.length - 1;
  markDirty();
  render();
});

$("#save").addEventListener("click", async () => {
  syncVisibleFields();
  const button = $("#save");
  button.disabled = true;
  setStatus("Salvataggio e generazione delle pagine…");
  try {
    const response = await fetch("/admin/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Salvataggio non riuscito.");
    dirty = false;
    setStatus("Salvato. Le anteprime sono aggiornate.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally { button.disabled = false; }
});

function syncVisibleFields() {
  const hub = config?.hubs[activeHub];
  if (!hub || !$("#hub-name")) return;
  hub.name = $("#hub-name").value;
  hub.slug = $("#hub-slug").value;
  hub.accent = $("#hub-accent").value;
  const logo = $("#hub-logo").value.trim();
  if (logo) hub.logo = logo; else delete hub.logo;
  const info = $("#hub-info").value.split("\n").map((item) => item.trim()).filter(Boolean);
  if (info.length) hub.info = info; else delete hub.info;
  editor.querySelectorAll("[data-section]").forEach((sectionElement) => {
    const section = hub.sections[Number(sectionElement.dataset.section)];
    section.title = $(".section-name", sectionElement).value;
    sectionElement.querySelectorAll("[data-link]").forEach((linkElement) => {
      const link = section.links[Number(linkElement.dataset.link)];
      link.label = $(".link-label-input", linkElement).value;
      link.url = $(".link-url-input", linkElement).value;
    });
  });
  $("#page-title").textContent = hub.name || "Hub senza nome";
  renderNavigation();
}

function openIcons(selected) {
  $("#icon-search").value = "";
  renderIcons("", selected);
  dialog.showModal();
  $("#icon-search").focus();
}

function renderIcons(query, selected) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = icons.filter((name) => terms.every((term) => name.includes(term)));
  const visible = matches.slice(0, 180);
  $("#icon-grid").innerHTML = visible.map((name) => `<button class="icon-option${name === selected ? " selected" : ""}" data-icon="${attr(name)}" title="${attr(name)}"><img loading="lazy" src="/admin/icon/${encodeURIComponent(name)}.svg" alt=""><span>${html(name)}</span></button>`).join("");
  $("#icon-count").textContent = matches.length > visible.length ? `${visible.length} di ${matches.length} icone — continua a scrivere per restringere` : `${matches.length} icone`;
}

$("#icon-search").addEventListener("input", (event) => renderIcons(event.target.value, ""));
$("#close-icons").addEventListener("click", () => dialog.close());
$("#icon-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-icon]");
  if (!button || !iconTarget) return;
  config.hubs[activeHub].sections[iconTarget.sectionIndex].links[iconTarget.linkIndex].icon = button.dataset.icon;
  markDirty();
  dialog.close();
  render();
});

window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

function move(items, from, to) { if (to >= 0 && to < items.length) items.splice(to, 0, items.splice(from, 1)[0]); }
function moveLink(sourceSection, sourceIndex, targetSection, targetIndex) {
  const sections = config.hubs[activeHub].sections;
  const [link] = sections[sourceSection].links.splice(sourceIndex, 1);
  if (sourceSection === targetSection && sourceIndex < targetIndex) targetIndex -= 1;
  targetIndex = Math.max(0, Math.min(targetIndex, sections[targetSection].links.length));
  sections[targetSection].links.splice(targetIndex, 0, link);
}
function clearDropIndicators() {
  editor.querySelectorAll(".drop-section, .drop-before, .drop-after, .drop-empty").forEach((element) => element.classList.remove("drop-section", "drop-before", "drop-after", "drop-empty"));
}
function markDirty() { dirty = true; setStatus("Modifiche non ancora salvate."); }
function setStatus(message, type = "") { const el = $("#status"); el.textContent = message; el.className = type; }
function html(value = "") { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function attr(value = "") { return html(value); }

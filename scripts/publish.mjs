import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requestedMessage = process.argv.slice(2).join(" ").trim();
const message = requestedMessage || `Aggiorna hubs · ${new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short"
}).format(new Date())}`;

run("git", ["rev-parse", "--is-inside-work-tree"], { quiet: true });
const repositoryRoot = run("git", ["rev-parse", "--show-toplevel"], { capture: true });
if (resolve(repositoryRoot) !== root) fail("Esegui il comando dalla repository hubs.");

const branch = run("git", ["branch", "--show-current"], { capture: true });
if (!branch) fail("Non posso pubblicare da uno stato Git detached HEAD.");

console.log("\n1/4  Generazione di docs/");
run(process.execPath, [resolve(root, "scripts/build.mjs")]);

console.log("\n2/4  Preparazione delle modifiche");
run("git", ["add", "--", ".gitignore", "README.md", "package.json", "package-lock.json", "content", "scripts", "src", "docs"]);

const hasChanges = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root }).status !== 0;
if (hasChanges) {
  console.log(`\n3/4  Commit: ${message}`);
  run("git", ["commit", "-m", message]);
} else {
  console.log("\n3/4  Nessuna modifica da aggiungere al commit");
}

console.log(`\n4/4  Push del branch ${branch}`);
const hasUpstream = spawnSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
  cwd: root,
  stdio: "ignore"
}).status === 0;
run("git", hasUpstream ? ["push"] : ["push", "--set-upstream", "origin", branch]);

console.log("\nPubblicazione completata.");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture || options.quiet ? "pipe" : "inherit"
  });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    fail(detail || `Comando fallito: ${command} ${args.join(" ")}`);
  }
  return options.capture ? result.stdout.trim() : undefined;
}

function fail(message) {
  console.error(`\nPubblicazione interrotta: ${message}`);
  process.exit(1);
}

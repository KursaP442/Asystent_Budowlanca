import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const url = `http://127.0.0.1:${port}/`;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const shell = process.platform === "win32";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT musi być liczbą od 1 do 65535 (otrzymano: ${process.env.PORT ?? ""}).`);
}

async function isRunning() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

if (await isRunning()) {
  console.log(`Serwer deweloperski już działa na ${url} — pomijam start.`);
  process.exit(0);
}

if (!existsSync(new URL("../node_modules", import.meta.url))) {
  console.log("Brak node_modules — instaluję zależności (pnpm install)...");
  const install = spawnSync(pnpm, ["install"], {
    cwd: root,
    stdio: "inherit",
    shell,
    windowsHide: false,
  });

  if (install.error) {
    throw install.error;
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

console.log(`Startuję aplikację web na ${url} ...`);
const server = spawn(pnpm, ["dev:web"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  shell,
  stdio: "inherit",
  windowsHide: false,
});

server.on("error", (error) => {
  console.error(`Nie udało się uruchomić pnpm dev:web: ${error.message}`);
  process.exitCode = 1;
});

await new Promise((resolve) => {
  server.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : code ?? 1;
    resolve();
  });
});

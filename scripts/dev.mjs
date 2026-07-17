import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const processes = [];

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code, signal) => {
    if (signal || code === 0) return;
    console.error(`[${label}] exited with code ${code}`);
  });
  processes.push(child);
}

start("research-bridge", process.execPath, ["server/research-bridge.mjs"]);
if (isWindows) {
  start("web", "cmd.exe", ["/d", "/s", "/c", "npx vinext dev"]);
} else {
  start("web", "npx", ["vinext", "dev"]);
}

function shutdown() {
  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

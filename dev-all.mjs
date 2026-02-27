import { spawn } from "node:child_process";
import process from "node:process";

function run(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  return child;
}

const backend = run("go", ["run", "./cmd/api"], { cwd: "backend" });
const frontend = run("npm", ["run", "dev"], {});

function handleExit(code, signal) {
  if (backend.exitCode === null) backend.kill("SIGINT");
  if (frontend.exitCode === null) frontend.kill("SIGINT");
  process.exit(typeof code === "number" ? code : 0);
}

backend.on("exit", (code, signal) => {
  if (code !== 0) {
    handleExit(code, signal);
  }
});

frontend.on("exit", (code, signal) => {
  if (code !== 0) {
    handleExit(code, signal);
  }
});

process.on("SIGINT", () => handleExit(0, "SIGINT"));
process.on("SIGTERM", () => handleExit(0, "SIGTERM"));


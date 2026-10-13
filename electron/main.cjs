const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

const PORT = 3000;
let win;
let serverProcess;

function findExecutable(names) {
  for (const name of names) {
    try {
      const result = execSync(`where ${name}`, { stdio: ["pipe", "pipe", "pipe"] });
      const p = result.toString().trim().split("\n")[0].trim();
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function findNpm() {
  // Locais comuns do npm no Windows
  const candidates = [
    path.join(process.env.APPDATA || "", "npm", "npm.cmd"),
    path.join(os.homedir(), "AppData", "Roaming", "npm", "npm.cmd"),
    "C:\\Program Files\\nodejs\\npm.cmd",
    "C:\\Program Files (x86)\\nodejs\\npm.cmd",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return findExecutable(["npm.cmd", "npm"]) || "npm.cmd";
}

function resolveClaudePath() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Roaming", "npm", "claude.cmd"),
    path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
    "C:\\Program Files\\nodejs\\claude.cmd",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return findExecutable(["claude.cmd", "claude"]);
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    function check(n) {
      http.get(`http://localhost:${PORT}`, () => resolve())
        .on("error", () => {
          if (n <= 0) return reject(new Error("Servidor não iniciou"));
          setTimeout(() => check(n - 1), 1000);
        });
    }
    check(retries);
  });
}

function startServer() {
  const npmPath = findNpm();
  const projectDir = path.join(__dirname, "..");
  const claudePath = resolveClaudePath();

  console.log("[electron] npm:", npmPath);
  console.log("[electron] projectDir:", projectDir);
  console.log("[electron] claude:", claudePath);

  // PATH enriquecido com locais comuns do Node/npm
  const extraDirs = [
    path.dirname(npmPath),
    "C:\\Program Files\\nodejs",
    path.join(os.homedir(), "AppData", "Roaming", "npm"),
  ].join(";");
  const envPath = `${extraDirs};${process.env.PATH || ""}`;

  serverProcess = spawn(npmPath, ["run", "dev"], {
    cwd: projectDir,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PATH: envPath,
      FORCE_COLOR: "0",
      CLAUDE_PATH: claudePath || "",
    },
  });

  serverProcess.stdout.on("data", (d) => console.log("[server]", d.toString().trim()));
  serverProcess.stderr.on("data", (d) => console.error("[server]", d.toString().trim()));
  serverProcess.on("error", (e) => {
    console.error("[server] Erro ao iniciar:", e);
    dialog.showErrorBox("Erro ao iniciar", `Não foi possível iniciar o servidor.\n\n${e.message}\n\nVerifique se o Node.js está instalado.`);
  });
  serverProcess.on("exit", (code) => console.log("[server] Encerrado com código:", code));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "ContabilConnect",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: "#0f1117",
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "loading.html"));

  waitForServer()
    .then(() => win.loadURL(`http://localhost:${PORT}`))
    .catch((err) => {
      console.error("[electron] Servidor não respondeu:", err);
      win.loadFile(path.join(__dirname, "error.html"));
    });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (serverProcess) { try { serverProcess.kill("SIGTERM"); } catch {} }
  app.quit();
});

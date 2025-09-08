const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const util = require("node:util");
const chalk = require("chalk");

// Severity levels (higher is more verbose)
const LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

const LEVEL_TO_CONSOLE = {
  error: "error",
  warn: "warn",
  info: "info",
  debug: "debug",
  trace: "log",
};

const LEVEL_TO_COLOR = {
  error: (s) => chalk.red(s),
  warn: (s) => chalk.yellow(s),
  info: (s) => chalk.blue(s),
  debug: (s) => chalk.magenta(s),
  trace: (s) => chalk.gray(s),
  success: (s) => chalk.green(s),
};

// Background color styles for level badges
const LEVEL_TO_BG = {
  error: (s) => chalk.bgRed(s),
  warn: (s) => chalk.bgYellow(s),
  info: (s) => chalk.bgBlue(s),
  debug: (s) => chalk.bgMagenta(s),
  trace: (s) => chalk.bgGray(s),
  success: (s) => chalk.bgGreen(s),
};

const DEFAULTS = {
  level: process.env.LOG_LEVEL || "info",
  enableColors: chalk && chalk.supportsColor !== false,
  logToFile: (process.env.LOG_TO_FILE || "false").toLowerCase() === "true",
  logDir: process.env.LOG_DIR || getDefaultLogDir(),
  fileName: process.env.LOG_FILE || "app.log",
  maxSizeBytes: Number(process.env.LOG_MAX_SIZE_BYTES || 5 * 1024 * 1024), // 5MB
  maxBackups: Number(process.env.LOG_MAX_BACKUPS || 3),
  alsoConsole: true,
  patchConsole: false,
  appName: process.env.APP_NAME || "local-todo-app",
};

let config = { ...DEFAULTS };

function sanitizeAppName(name) {
  const fallback = DEFAULTS.appNameSafe || "app";
  if (typeof name !== "string") return fallback;
  let n = name.trim();
  if (!n) return fallback;
  // Remove path separators
  n = n.replace(/[\/\\]+/g, "");
  // Remove leading '.' or '..' segments
  n = n.replace(/^\.+/, "");
  // Allow only letters, numbers, hyphen, underscore
  n = n.replace(/[^A-Za-z0-9_-]+/g, "");
  if (!n) return fallback;
  return n;
}

function getDefaultLogDir() {
  // Prefer Electron app logs dir when available, otherwise use a folder under home
  try {
    // Lazy require to avoid issues in non-Electron contexts
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      try {
        // Some Electron versions support 'logs'. Fallback to userData/logs.
        const logsPath = app.getPath("logs");
        if (logsPath) return logsPath;
      } catch (_) {}
      const userData = app.getPath("userData");
      return path.join(userData, "logs");
    }
  } catch (_) {}
  const sanitizedAppName = sanitizeAppName(DEFAULTS.appName);
  return path.join(os.homedir(), "." + sanitizedAppName, "logs");
}

function ensureDirExists(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (error) {
    // Ignore if exists or cannot be created; file logging will no-op
  }
}

function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < config.maxSizeBytes) return;

    // Rotate: app.log -> app.log.1 -> app.log.2 ...
    for (let i = config.maxBackups - 1; i >= 1; i -= 1) {
      const src = `${filePath}.${i}`;
      const dst = `${filePath}.${i + 1}`;
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dst);
        } catch (error) {
          // Report and abort rotation to avoid overwriting older backups
          // eslint-disable-next-line no-console
          console.error(
            `Log rotation error: failed to rename "${src}" -> "${dst}": ${
              (error && error.message) || error
            }`
          );
          return;
        }
      }
    }
    const firstBackup = `${filePath}.1`;
    try {
      fs.renameSync(filePath, firstBackup);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Log rotation error: failed to rename "${filePath}" -> "${firstBackup}": ${
          (error && error.message) || error
        }`
      );
    }
  } catch (_) {
    // Ignore rotation errors
  }
}

function safeSerialize(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, val) => {
      if (val instanceof Error) {
        return {
          name: val.name,
          message: val.message,
          stack: val.stack,
        };
      }
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    },
    2
  );
}

function toConsoleString(args) {
  // Use util.format to mimic console formatting rules
  try {
    if (args.length === 1) {
      const single = args[0];
      if (typeof single === "string") return single;
      return typeof single === "object"
        ? util.inspect(single, { colors: config.enableColors, depth: 6 })
        : String(single);
    }
    return util.format.apply(null, args);
  } catch (_) {
    try {
      return args
        .map((a) => (typeof a === "string" ? a : safeSerialize(a)))
        .join(" ");
    } catch (_) {
      return "<unserializable>";
    }
  }
}

function writeToFile(line) {
  if (!config.logToFile) return;
  const filePath = path.join(config.logDir, config.fileName);
  try {
    ensureDirExists(config.logDir);
    rotateIfNeeded(filePath);
    fs.appendFileSync(filePath, line + os.EOL, { encoding: "utf8" });
  } catch (_) {
    // Swallow file write errors to avoid affecting the app
  }
}

function normalizeLevel(level) {
  const lower = String(level || "").toLowerCase();
  if (LEVELS.hasOwnProperty(lower)) return lower;
  return "info";
}

function isEnabled(level) {
  const target = LEVELS[normalizeLevel(level)];
  const current = LEVELS[normalizeLevel(config.level)];
  return target <= current && current !== LEVELS.silent;
}

function formatPrefix(level, scope) {
  const ts = new Date().toISOString();
  const fg =
    config.enableColors && LEVEL_TO_COLOR[level]
      ? LEVEL_TO_COLOR[level]
      : (s) => s;
  const bg =
    config.enableColors && LEVEL_TO_BG[level] ? LEVEL_TO_BG[level] : (s) => s;
  const levelBadge = ` ${level.toUpperCase().padEnd(5, " ")} `;
  const coloredLevelBadge = bg(levelBadge);
  const coloredTimestamp = fg(`[${ts}]`);
  const scopeText = scope ? `[${scope}]` : "";
  const coloredScope =
    config.enableColors && scope ? chalk.bold(scopeText) : scopeText;
  return `${coloredTimestamp} ${coloredLevelBadge}${
    coloredScope ? " " + coloredScope : ""
  }`;
}

function baseLog(level, scope, args) {
  const lvl = normalizeLevel(level);
  if (!isEnabled(lvl)) return;

  const prefix = formatPrefix(lvl, scope);
  const msg = toConsoleString(args);
  const coloredMsg =
    config.enableColors && LEVEL_TO_COLOR[lvl] ? LEVEL_TO_COLOR[lvl](msg) : msg;
  const line = `${prefix} ${coloredMsg}`;

  if (config.alsoConsole) {
    const method = LEVEL_TO_CONSOLE[lvl] || "log";
    try {
      // eslint-disable-next-line no-console
      console[method](line);
    } catch (_) {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  writeToFile(line);
}

function setLevel(level) {
  config.level = normalizeLevel(level);
}

function setConfig(partial) {
  if (!partial || typeof partial !== "object") return;
  config = { ...config, ...partial };
  if (partial.level) config.level = normalizeLevel(partial.level);
}

function patchConsole() {
  if (!config.patchConsole) return;
  const logger = getLogger("console");
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  // eslint-disable-next-line no-console
  console.log = (...a) => logger.info(...a);
  // eslint-disable-next-line no-console
  console.info = (...a) => logger.info(...a);
  // eslint-disable-next-line no-console
  console.warn = (...a) => logger.warn(...a);
  // eslint-disable-next-line no-console
  console.error = (...a) => logger.error(...a);
  // eslint-disable-next-line no-console
  console.debug = (...a) => logger.debug(...a);
  return () => {
    // Restore
    // eslint-disable-next-line no-console
    console.log = original.log;
    // eslint-disable-next-line no-console
    console.info = original.info;
    // eslint-disable-next-line no-console
    console.warn = original.warn;
    // eslint-disable-next-line no-console
    console.error = original.error;
    // eslint-disable-next-line no-console
    console.debug = original.debug;
  };
}

function getLogger(scope) {
  const scoped = String(scope || "").trim() || null;
  return {
    trace: (...args) => baseLog("trace", scoped, args),
    debug: (...args) => baseLog("debug", scoped, args),
    info: (...args) => baseLog("info", scoped, args),
    warn: (...args) => baseLog("warn", scoped, args),
    error: (...args) => baseLog("error", scoped, args),
    success: (...args) => baseLog("info", scoped, args.concat(["[success]"])),
    setLevel,
    setConfig,
  };
}

// Initialize based on defaults and environment
setLevel(config.level);

module.exports = {
  getLogger,
  setLevel,
  setConfig,
  patchConsole,
  levels: LEVELS,
};

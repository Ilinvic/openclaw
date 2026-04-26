import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { CommandHandler } from "./commands-types.js";

const FOREIGN_CONFIRM_MENTION_REGEX = /^\/trading-confirm@([^\s]+)(?:\s|$)/i;
const FOREIGN_REJECT_MENTION_REGEX = /^\/trading-reject@([^\s]+)(?:\s|$)/i;
const FOREIGN_WORK_MENTION_REGEX = /^\/trading-work@([^\s]+)(?:\s|$)/i;
const FOREIGN_SKIP_MENTION_REGEX = /^\/trading-skip@([^\s]+)(?:\s|$)/i;
const FOREIGN_FORCE_MENTION_REGEX = /^\/trading-force@([^\s]+)(?:\s|$)/i;
const FOREIGN_SET_SIZE_MENTION_REGEX = /^\/trading-set-size@([^\s]+)(?:\s|$)/i;
const FOREIGN_SET_LEV_MENTION_REGEX = /^\/trading-set-lev@([^\s]+)(?:\s|$)/i;
const CONFIRM_RE = /^\/trading-confirm(?:\s|$)/i;
const REJECT_RE = /^\/trading-reject(?:\s|$)/i;
const WORK_RE = /^\/trading-work(?:\s|$)/i;
const SKIP_RE = /^\/trading-skip(?:\s|$)/i;
const FORCE_RE = /^\/trading-force(?:\s|$)/i;
const SET_SIZE_RE = /^\/trading-set-size(?:\s|$)/i;
const SET_LEV_RE = /^\/trading-set-lev(?:\s|$)/i;
const POSITIONS_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/positions.mjs",
).href;
const STORE_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/store.mjs",
).href;
const EXECUTE_CONFIRMED_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/execute-confirmed-action.mjs",
).href;
const EXECUTION_PLAN_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/execution-plan.mjs",
).href;
const NOTIFIER_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/telegram-intake/telegram-notifier.mjs",
).href;
const TV_LINK_BUILDER_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/tradingview/link-builder.mjs",
).href;
const RECOVERY_BATCH_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/recovery-batch.mjs",
).href;
const BYBIT_CLIENT_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/bybit/bybit-client.mjs",
).href;
const TRADING_CONFIG_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/trading-config.mjs",
).href;
const CHANNEL_CONFIG_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/telegram-intake/channel-config.mjs",
).href;
const TRADER_GATE_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/trader-gate.mjs",
).href;
const TRADER_STATS_MODULE_URL = pathToFileURL(
  "/home/node/.openclaw/projects/trading-assistant/signal-store/trader-stats.mjs",
).href;
const CURRENT_SIGNALS_PATH = "/home/node/.openclaw/projects/trading-assistant/signal-store/data/current.json";
const INTAKE_PIDFILE = "/home/node/.openclaw/projects/trading-assistant/telegram-intake/.pid";
const SYNC_PIDFILE = "/home/node/.openclaw/projects/trading-assistant/bybit/.sync-watcher.pid";
const INTAKE_START = "/home/node/.openclaw/ops-bin/telegram-intake-start";
const INTAKE_STOP = "/home/node/.openclaw/ops-bin/telegram-intake-stop";
const INTAKE_STATUS = "/home/node/.openclaw/ops-bin/telegram-intake-status";
const INTAKE_RECOVER = "/home/node/.openclaw/ops-bin/telegram-intake-recover-latest";
const SYNC_STATUS = "/home/node/.openclaw/ops-bin/bybit-sync-watcher-status";
const HOST_RESTORE = "/home/node/.openclaw/ops-bin/trading-watchers-host-check";
const HEALTH_STATUS = "/home/node/.openclaw/ops-bin/trading-health-watcher-status";
const DASHBOARD_START = "/home/node/.openclaw/ops-bin/dashboard-start";
const DASHBOARD_TUNNEL_START = "/home/node/.openclaw/ops-bin/dashboard-tunnel-start";
const DASHBOARD_TUNNEL_URL = "/home/node/.openclaw/ops-bin/dashboard-tunnel-url";
const execFile = promisify(execFileCallback);
const LEVERAGE_MIN = 1;
const LEVERAGE_MAX = 25;
const TRADING_DASHBOARD_URL = process.env.TRADING_DASHBOARD_URL?.trim() || null;

type TradingCommand =
  | { action: "confirm" | "reject" | "work" | "skip" | "force" | "set_size" | "set_lev"; telegramMessageId: number | null }
  | { action: "menu" | "status" | "restore" | "start_watching" | "stop_watching" | "recover_signal" | "watching_status" | "sync_status" | "open_positions" | "open_positions_list" | "open_orders" | "open_orders_list" | "positions_and_orders" | "autonomous_mode_toggle" | "parsing_mode_toggle" | "traders" | "deposit" | "pnl_12h" | "pnl_24h" | "help" | "dashboard" }
  | { action: "position"; symbol: string }
  | { error: string };

function extractPifCommand(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/?pif\b\s*(.*)$/i);
  if (!match) {
    return null;
  }
  return match[1]?.trim().toLowerCase() ?? "";
}

type TradingPosition = {
  position_id?: string;
  telegram_message_id?: number;
  trader_id?: string | null;
  symbol?: string;
  side?: string;
  status?: string;
  stop_loss?: number | string | null;
  linked_position_id?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  exchange?: {
    submit_status?: string;
    tp_ladder_status?: string;
    desynced?: boolean;
    desync_kind?: string | null;
    order_snapshot?: {
      orderStatus?: string;
      reduceOnly?: boolean;
      avgPrice?: string | number;
      price?: string | number;
      qty?: string | number;
      leavesQty?: string | number;
      stopLoss?: string | number;
      side?: string;
    } | null;
    tp_ladder_payloads?: Array<{ tpSize?: string | number; takeProfit?: string | number }> | null;
    position_snapshot?: {
      size?: string | number;
      avgPrice?: string | number;
      stopLoss?: string | number;
      cumRealisedPnl?: string | number;
      unrealisedPnl?: string | number;
    } | null;
    last_sync_at?: string | null;
  } | null;
};

type TradingSignalSnapshot = {
  telegram_message_id?: number;
  trader_id?: string | null;
  signal_kind?: string | null;
  message_timestamp?: string | null;
  raw_text?: string | null;
  latest_parsed_signal?: {
    symbol?: string | null;
  } | null;
  last_decision_action?: string | null;
  last_decision_reason?: string | null;
  actionability_status?: string | null;
  awaiting_owner_input_type?: string | null;
  latest_delivery_mode?: string | null;
  last_notification_status?: string | null;
  last_notification_sent_at?: string | null;
  position_desynced?: boolean | null;
  updated_at?: string | null;
};

const STATUS_STALE_SYNC_MS = 5 * 60 * 1000;
const STATUS_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

function parseTradingActionCommand(raw: string): TradingCommand | null {
  const trimmed = raw.trim();
  const pifCommand = extractPifCommand(raw);
  if (
    FOREIGN_CONFIRM_MENTION_REGEX.test(trimmed) ||
    FOREIGN_REJECT_MENTION_REGEX.test(trimmed) ||
    FOREIGN_WORK_MENTION_REGEX.test(trimmed) ||
    FOREIGN_SKIP_MENTION_REGEX.test(trimmed) ||
    FOREIGN_FORCE_MENTION_REGEX.test(trimmed) ||
    FOREIGN_SET_SIZE_MENTION_REGEX.test(trimmed) ||
    FOREIGN_SET_LEV_MENTION_REGEX.test(trimmed)
  ) {
    return { error: "❌ This trading command targets a different Telegram bot." };
  }

  const lowered = trimmed.toLowerCase();
  const normalized = pifCommand ?? lowered;
  if (["открывай", "открываем", "работаем", "исполняй", "открыть"].includes(normalized)) {
    return { action: "work", telegramMessageId: null };
  }
  if (["пропускаем", "пропусти", "пропустить"].includes(normalized)) {
    return { action: "skip", telegramMessageId: null };
  }
  if (["исполнить принудительно", "форс", "force"].includes(normalized)) {
    return { action: "force", telegramMessageId: null };
  }
  if (normalized === "" || normalized === "start" || normalized === "help") return { action: "menu" };
  if (normalized === "restore" || normalized === "recover" || normalized === "fix" || lowered === "/restore") return { action: "restore" };
  if (normalized === "status" || lowered === "/status") return { action: "status" };
  if (normalized === "start watching" || lowered === "/start watching") return { action: "start_watching" };
  if (normalized === "stop watching" || lowered === "/stop watching") return { action: "stop_watching" };
  if (
    normalized === "recover signal" ||
    normalized === "catch up" ||
    normalized === "проверить пропуск" ||
    lowered === "/recover signal"
  ) return { action: "recover_signal" };
  if (normalized === "watching status" || lowered === "/watching status") return { action: "watching_status" };
  if (normalized === "sync status" || lowered === "/sync status") return { action: "sync_status" };
  if (normalized === "open positions" || lowered === "/open positions") return { action: "open_positions" };
  if (normalized === "open positions list" || lowered === "/open positions list") return { action: "open_positions_list" };
  if (normalized === "open orders" || lowered === "/open orders") return { action: "open_orders" };
  if (normalized === "open orders list" || lowered === "/open orders list") return { action: "open_orders_list" };
  if (normalized === "positions and orders" || lowered === "/positions and orders") return { action: "positions_and_orders" };
  if (normalized === "autonomous mode" || normalized === "авт режим" || lowered === "/autonomous mode") return { action: "autonomous_mode_toggle" };
  if (normalized === "parsing mode" || normalized === "режим парсинга" || lowered === "/parsing mode") return { action: "parsing_mode_toggle" };
  if (normalized === "traders" || normalized === "трейдеры") {
    return { action: "traders" };
  }
  if (normalized === "deposit" || lowered === "/deposit") return { action: "deposit" };
  if (normalized === "12h pnl" || lowered === "/12h pnl") return { action: "pnl_12h" };
  if (normalized === "24h pnl" || lowered === "/24h pnl") return { action: "pnl_24h" };
  if (normalized === "help" || lowered === "/help") return { action: "help" };
  if (normalized === "dashboard") return { action: "dashboard" };
  const positionMatch =
    pifCommand != null
      ? pifCommand.match(/^position(?:\s+(.+))$/i)
      : trimmed.match(/^\/position(?:\s+(.+))$/i);
  if (positionMatch) {
    const symbol = positionMatch[1]?.trim().toUpperCase();
    if (!symbol) {
      return { error: "Usage: pif position <symbol>" };
    }
    return { action: "position", symbol };
  }

  let action: "confirm" | "reject" | "work" | "skip" | "force" | "set_size" | "set_lev" | null = null;
  let commandLength = 0;
  const confirmMatch = trimmed.match(CONFIRM_RE);
  const rejectMatch = trimmed.match(REJECT_RE);
  const workMatch = trimmed.match(WORK_RE);
  const skipMatch = trimmed.match(SKIP_RE);
  const forceMatch = trimmed.match(FORCE_RE);
  const setSizeMatch = trimmed.match(SET_SIZE_RE);
  const setLevMatch = trimmed.match(SET_LEV_RE);
  if (confirmMatch) {
    action = "confirm";
    commandLength = confirmMatch[0].length;
  } else if (rejectMatch) {
    action = "reject";
    commandLength = rejectMatch[0].length;
  } else if (workMatch) {
    action = "work";
    commandLength = workMatch[0].length;
  } else if (skipMatch) {
    action = "skip";
    commandLength = skipMatch[0].length;
  } else if (forceMatch) {
    action = "force";
    commandLength = forceMatch[0].length;
  } else if (setSizeMatch) {
    action = "set_size";
    commandLength = setSizeMatch[0].length;
  } else if (setLevMatch) {
    action = "set_lev";
    commandLength = setLevMatch[0].length;
  } else {
    return null;
  }

  const arg = trimmed.slice(commandLength).trim().split(/\s+/).filter(Boolean)[0];
  if (!arg) {
    return { error: `Usage: /trading-${action} <telegram_message_id>` };
  }
  const telegramMessageId = Number(arg);
  if (!Number.isFinite(telegramMessageId)) {
    return { error: "telegram_message_id must be numeric" };
  }
  return { action, telegramMessageId };
}

function buildActorLabel(params: Parameters<CommandHandler>[0]): string {
  return params.command.senderId
    ? `${params.command.channel}:${params.command.senderId}`
    : `${params.command.channel}:unknown`;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNum(value: number, digits = 2): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildShortLinkHtml(label: string, href: string | null): string | null {
  if (!href) return null;
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${formatNum(value, 4)} USDT`;
}

function classifyExecutionFailure(error: unknown): {
  message: string;
  severity: "soft" | "hard";
} {
  const message = humanizeExecutionFailureMessage(error instanceof Error ? error.message : String(error));
  const lowered = message.toLowerCase();

  if (
    lowered.includes("unsafe demo preview payload") ||
    lowered.includes("risk_reward_below_minimum") ||
    lowered.includes("take_profits_missing") ||
    lowered.includes("stop_loss_missing") ||
    lowered.includes("position_size_invalid") ||
    lowered.includes("trader_id_missing") ||
    lowered.includes("qty_below_min_order_qty") ||
    lowered.includes("max_concurrent_positions")
  ) {
    return { message, severity: "soft" };
  }

  if (
    lowered.includes("bybit request failed") ||
    lowered.includes("not set") ||
    lowered.includes("unsupported") ||
    lowered.includes("spot_") ||
    lowered.includes("position not found") ||
    lowered.includes("signal snapshot not found")
  ) {
    return { message, severity: "hard" };
  }

  return { message, severity: "hard" };
}

function humanizeExecutionFailureMessage(message: string): string {
  const raw = String(message ?? "").trim();
  const lowered = raw.toLowerCase();

  const rrMatch = raw.match(/risk_reward_below_minimum:([0-9.]+)<([0-9.]+)/i);
  if (rrMatch) {
    return `Соотношение риск/прибыль слишком слабое для наших правил: ${rrMatch[1]} при минимуме ${rrMatch[2]}.`;
  }

  if (lowered.includes("unsafe demo preview payload")) {
    if (lowered.includes("take_profits_missing")) {
      return "Не хватает тейк-профитов для безопасного открытия позиции.";
    }
    if (lowered.includes("stop_loss_missing")) {
      return "Не хватает стоп-лосса для безопасного открытия позиции.";
    }
    if (lowered.includes("trader_id_missing")) {
      return "Не удалось определить трейдера для этого сигнала.";
    }
    if (lowered.includes("qty_below_min_order_qty")) {
      return "Размер позиции получился меньше минимально допустимого размера ордера на бирже.";
    }
    return "Сигнал не проходит наши предварительные проверки безопасности.";
  }

  const maxPosMatch = raw.match(/MAX_CONCURRENT_POSITIONS \((\d+)\) reached — (\d+) positions currently open/i);
  if (maxPosMatch) {
    return `Достигнут лимит одновременно открытых позиций: сейчас открыто ${maxPosMatch[2]} при лимите ${maxPosMatch[1]}.`;
  }

  if (lowered.includes("insufficient balance")) {
    return "На бирже не хватает доступного баланса для открытия этой позиции.";
  }

  if (lowered.includes("stoploss:") && lowered.includes("sell position should greater base_price")) {
    return "Биржа не приняла стоп-лосс: для шорта стоп должен быть выше текущей базовой цены.";
  }
  if (lowered.includes("stoploss:") && lowered.includes("buy position should lower base_price")) {
    return "Биржа не приняла стоп-лосс: для лонга стоп должен быть ниже текущей базовой цены.";
  }

  const bybitError = raw.match(/Bybit request failed:\s*\d+\s+(\d+)\s+(.+)/i);
  if (bybitError) {
    return `Биржа отклонила запрос (${bybitError[1]}): ${bybitError[2]}`;
  }

  return raw;
}

async function buildOwnerOverrideReply(snapshot: Record<string, unknown>): Promise<string> {
  const executionPlanModule = (await import(EXECUTION_PLAN_MODULE_URL)) as {
    buildDemoExecutionPlan: (snapshot: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  const balance = await readDepositBalance().catch(() => null);
  const plan = await executionPlanModule.buildDemoExecutionPlan(snapshot, {
    accountBalance: balance ?? 10000
  });
  const entries = Array.isArray((snapshot as { latest_parsed_signal?: { entries?: unknown[] } }).latest_parsed_signal?.entries)
    ? ((snapshot as { latest_parsed_signal?: { entries?: number[] } }).latest_parsed_signal?.entries ?? [])
    : [];
  const entry = Number(entries[0] ?? 0);
  const plannedUsd =
    Number(plan.position_size ?? 0) > 0 && entry > 0
      ? Number(plan.position_size) * entry
      : 0;

  return [
    "Настройки обновлены",
    `Риск: ${formatNum(Number(plan.risk_pct ?? 0), 4)}%`,
    `Размер: ${plannedUsd > 0 ? `${formatNum(plannedUsd, 2)} USDT` : "n/a"}`,
    `Плечо: ${Number(plan.leverage ?? 0) > 0 ? `${Number(plan.leverage)}x` : "n/a"}`,
    "Отправил обновлённую карточку."
  ].join("\n");
}

async function buildCurrentInputPrompt(
  snapshot: Record<string, unknown>,
  inputType: "position_usdt" | "leverage",
): Promise<string> {
  const executionPlanModule = (await import(EXECUTION_PLAN_MODULE_URL)) as {
    buildDemoExecutionPlan: (snapshot: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  const balance = await readDepositBalance().catch(() => null);
  const plan = await executionPlanModule.buildDemoExecutionPlan(snapshot, {
    accountBalance: balance ?? 10000
  });
  const entries = Array.isArray((snapshot as { latest_parsed_signal?: { entries?: unknown[] } }).latest_parsed_signal?.entries)
    ? ((snapshot as { latest_parsed_signal?: { entries?: number[] } }).latest_parsed_signal?.entries ?? [])
    : [];
  const entry = Number(entries[0] ?? 0);
  const plannedUsd =
    Number(plan.position_size ?? 0) > 0 && entry > 0
      ? Number(plan.position_size) * entry
      : 0;
  const currentLeverage = Number(plan.leverage ?? 0) > 0 ? `${Number(plan.leverage)}x` : "n/a";

  if (inputType === "position_usdt") {
    return [
      "Введи размер позиции ниже.",
      `Сейчас размер позиции: ${plannedUsd > 0 ? `${formatNum(plannedUsd, 2)} USDT` : "n/a"}`,
      "Пример: 400 USDT",
      "Можно написать `отмена`, чтобы выйти.",
    ].join("\n");
  }

  return [
    "Введи размер плеча ниже.",
    `Сейчас плечо: ${currentLeverage}`,
    `Пример: 5x`,
    `Диапазон: ${LEVERAGE_MIN}-${LEVERAGE_MAX}x`,
    "Можно написать `отмена`, чтобы выйти.",
  ].join("\n");
}

async function buildOwnerOverrideSavedReply(
  snapshot: Record<string, unknown>,
  inputType: "position_usdt" | "leverage",
): Promise<string> {
  const executionPlanModule = (await import(EXECUTION_PLAN_MODULE_URL)) as {
    buildDemoExecutionPlan: (snapshot: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  const balance = await readDepositBalance().catch(() => null);
  const plan = await executionPlanModule.buildDemoExecutionPlan(snapshot, {
    accountBalance: balance ?? 10000
  });
  const entries = Array.isArray((snapshot as { latest_parsed_signal?: { entries?: unknown[] } }).latest_parsed_signal?.entries)
    ? ((snapshot as { latest_parsed_signal?: { entries?: number[] } }).latest_parsed_signal?.entries ?? [])
    : [];
  const entry = Number(entries[0] ?? 0);
  const plannedUsd =
    Number(plan.position_size ?? 0) > 0 && entry > 0
      ? Number(plan.position_size) * entry
      : 0;
  const leverageText = Number(plan.leverage ?? 0) > 0 ? `${Number(plan.leverage)}x` : "n/a";

  if (inputType === "position_usdt") {
    return [
      `✅ Размер позиции обновлён: ${plannedUsd > 0 ? `${formatNum(plannedUsd, 2)} USDT` : "n/a"}`,
      "Отправил обновлённую карточку."
    ].join("\n");
  }

  return [
    `✅ Плечо обновлено: ${leverageText}`,
    "Отправил обновлённую карточку."
  ].join("\n");
}

function parsePositionSizeInput(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/usdt/g, "").replace(/usd/g, "").replace(/[,\s]+/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseLeverageInput(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/x/g, "").replace(/[,\s]+/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= LEVERAGE_MIN && rounded <= LEVERAGE_MAX ? rounded : null;
}

async function resolveAwaitingOwnerInputSnapshot(): Promise<Record<string, unknown> | null> {
  const storeModule = (await import(STORE_MODULE_URL)) as {
    readAllSignalSnapshots: () => Promise<Record<string, Record<string, unknown>>>;
  };
  const snapshots = Object.values(await storeModule.readAllSignalSnapshots());
  snapshots.sort((a, b) => {
    const timeB = Date.parse(String(b?.last_owner_review_at ?? ""));
    const timeA = Date.parse(String(a?.last_owner_review_at ?? ""));
    if (Number.isFinite(timeB) && Number.isFinite(timeA) && timeB !== timeA) {
      return timeB - timeA;
    }
    return Number(b?.telegram_message_id ?? 0) - Number(a?.telegram_message_id ?? 0);
  });
  return snapshots.find((snapshot) => String(snapshot?.awaiting_owner_input_type ?? "").length > 0) ?? null;
}

async function readTradingPositions(): Promise<TradingPosition[]> {
  const tradingModule = (await import(POSITIONS_MODULE_URL)) as {
    readPositionRegistry: () => Promise<Record<string, TradingPosition>>;
  };
  const registry = await tradingModule.readPositionRegistry();
  return Object.values(registry ?? {});
}

async function readLatestSignal(): Promise<TradingSignalSnapshot | null> {
  try {
    const storeModule = (await import(STORE_MODULE_URL)) as {
      readAllSignalSnapshots: () => Promise<Record<string, TradingSignalSnapshot>>;
    };
    const parsed = await storeModule.readAllSignalSnapshots();
    const snapshots = Object.values(parsed ?? {});
    snapshots.sort((a, b) => {
      const timeB = Date.parse(String(b?.message_timestamp ?? b?.updated_at ?? ""));
      const timeA = Date.parse(String(a?.message_timestamp ?? a?.updated_at ?? ""));
      if (Number.isFinite(timeB) && Number.isFinite(timeA) && timeB !== timeA) {
        return timeB - timeA;
      }
      return Number(b?.telegram_message_id ?? 0) - Number(a?.telegram_message_id ?? 0);
    });
    return snapshots[0] ?? null;
  } catch {
    try {
      const raw = await readFile(CURRENT_SIGNALS_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, TradingSignalSnapshot>;
      const snapshots = Object.values(parsed ?? {});
      snapshots.sort((a, b) => {
        const timeB = Date.parse(String(b?.message_timestamp ?? b?.updated_at ?? ""));
        const timeA = Date.parse(String(a?.message_timestamp ?? a?.updated_at ?? ""));
        if (Number.isFinite(timeB) && Number.isFinite(timeA) && timeB !== timeA) {
          return timeB - timeA;
        }
        return Number(b?.telegram_message_id ?? 0) - Number(a?.telegram_message_id ?? 0);
      });
      return snapshots[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function readTradingSignalSnapshots(): Promise<TradingSignalSnapshot[]> {
  try {
    const storeModule = (await import(STORE_MODULE_URL)) as {
      readAllSignalSnapshots: () => Promise<Record<string, TradingSignalSnapshot>>;
    };
    return Object.values(await storeModule.readAllSignalSnapshots());
  } catch {
    try {
      const raw = await readFile(CURRENT_SIGNALS_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, TradingSignalSnapshot>;
      return Object.values(parsed ?? {});
    } catch {
      return [];
    }
  }
}

function inferSymbolFromSnapshot(snapshot: TradingSignalSnapshot | null): string {
  if (!snapshot) {
    return "UNKNOWN";
  }
  const parsedSymbol = snapshot.latest_parsed_signal?.symbol;
  if (parsedSymbol && parsedSymbol !== "UNKNOWN") {
    return parsedSymbol;
  }
  return String(snapshot.raw_text ?? "").match(/\$?([A-Z]{2,10}USDT)\b/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
}

async function resolveRecentTradingMessageId(preferredAction: "work" | "skip" | "force"): Promise<number | null> {
  try {
    const raw = await readFile(CURRENT_SIGNALS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const candidates = Object.values(parsed ?? {})
      .filter((snapshot) => Number.isFinite(Number(snapshot?.telegram_message_id ?? NaN)))
      .filter((snapshot) => snapshot?.last_notification_status === "sent")
      .sort((a, b) => Date.parse(String(b?.last_notification_sent_at ?? "")) - Date.parse(String(a?.last_notification_sent_at ?? "")));

    const preferred = candidates.find((snapshot) => {
      const actionability = String(snapshot?.actionability_status ?? "");
      if (preferredAction === "force") {
        return actionability === "ready" || actionability === "pending_confirmation" || actionability === "pending";
      }
      return actionability === "pending_confirmation" || actionability === "pending";
    });
    const selected = preferred ?? candidates[0] ?? null;
    return selected ? Number(selected.telegram_message_id) : null;
  } catch {
    return null;
  }
}

function getOpenPositionSize(position: TradingPosition): number {
  return toNumber(position.exchange?.position_snapshot?.size);
}

function isOpenPosition(position: TradingPosition): boolean {
  return getOpenPositionSize(position) > 0;
}

function isOpenEntryOrder(position: TradingPosition): boolean {
  const orderStatus = String(position.exchange?.order_snapshot?.orderStatus ?? "");
  return (
    String(position.status ?? "") === "open" &&
    orderStatus === "New" &&
    position.exchange?.order_snapshot?.reduceOnly !== true &&
    getOpenPositionSize(position) <= 0
  );
}

function getLatestStop(position: TradingPosition): number {
  const exchangeStop = toNumber(position.exchange?.position_snapshot?.stopLoss);
  if (exchangeStop > 0) {
    return exchangeStop;
  }
  const orderStop = toNumber(position.exchange?.order_snapshot?.stopLoss);
  if (orderStop > 0) {
    return orderStop;
  }
  return toNumber(position.stop_loss);
}

function getAvgPrice(position: TradingPosition): number {
  const liveAvg = toNumber(position.exchange?.position_snapshot?.avgPrice);
  if (liveAvg > 0) {
    return liveAvg;
  }
  return toNumber(position.exchange?.order_snapshot?.avgPrice);
}

function getOpenOrders(positions: TradingPosition[]): TradingPosition[] {
  return positions.filter(isOpenEntryOrder);
}

async function readDepositBalance(): Promise<number> {
  const bybitModule = (await import(BYBIT_CLIENT_MODULE_URL)) as {
    createBybitDemoClient: () => {
      getWalletBalance: (args: { accountType: string; coin: string }) => Promise<unknown>;
    };
    extractWalletBalance: (response: unknown, options?: { preferredCoin?: string }) => number;
  };
  const client = bybitModule.createBybitDemoClient();
  const wallet = await client.getWalletBalance({ accountType: "UNIFIED", coin: "USDT" });
  return bybitModule.extractWalletBalance(wallet, { preferredCoin: "USDT" });
}

function computeWindowPnl(positions: TradingPosition[], hours: number): { pnl: number; count: number } {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  let pnl = 0;
  let count = 0;
  for (const position of positions) {
    const closedAt = Date.parse(String(position.closed_at ?? ""));
    if (!Number.isFinite(closedAt) || closedAt < cutoff) {
      continue;
    }
    pnl += toNumber(position.exchange?.position_snapshot?.cumRealisedPnl);
    count += 1;
  }
  return { pnl, count };
}

async function getPidfileStatus(pidfile: string): Promise<"RUNNING" | "STOPPED"> {
  try {
    const raw = await readFile(pidfile, "utf8");
    const pid = Number(raw.trim());
    if (!Number.isFinite(pid)) {
      return "STOPPED";
    }
    process.kill(pid, 0);
    return "RUNNING";
  } catch {
    return "STOPPED";
  }
}

async function runWrapper(path: string): Promise<string> {
  const result = await execFile(path, [], { env: process.env });
  return String(result.stdout ?? "").trim() || String(result.stderr ?? "").trim() || "OK";
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

function withStatusDot(summary: string, label: string): string {
  const normalized = String(summary ?? "").trim();
  const isRunning = normalized.toUpperCase().startsWith("RUNNING");
  return `${isRunning ? "🟢" : "🔴"} ${label}: ${normalized || "UNKNOWN"}`;
}

async function readWrapperFirstLine(path: string): Promise<string> {
  const output = stripAnsi(await runWrapper(path));
  return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "UNKNOWN";
}

/** Tolerance for floating-point size comparison when detecting TP hits */
const TP_SIZE_TOLERANCE = 0.02;

/**
 * Builds concise TP-progress lines for a position:
 *   ✅ TP1 (596.2) и TP2 (582.6) — взяты
 *   Размер: 3.57 → 0.72 ед. | Реализованный P&L: +75.45 USDT
 *   Остался TP3 (566.1, 0.71 ед.)
 *   Нереализованный P&L: +16.30 USDT 💰
 *
 * Returns an empty array when data is insufficient.
 */
function buildTpProgressLines(position: TradingPosition): string[] {
  const ladder = position.exchange?.tp_ladder_payloads;
  if (!Array.isArray(ladder) || ladder.length === 0) return [];
  const snapshotSize = position.exchange?.position_snapshot?.size;
  if (snapshotSize == null) return [];
  const currentSize = toNumber(snapshotSize);
  if (!(currentSize >= 0)) return [];

  const tpSizes = ladder.map((p) => toNumber(p.tpSize));
  const tpPrices = ladder.map((p) => String(p.takeProfit ?? "?"));
  if (tpSizes.some((s) => !(s > 0))) return [];

  const originalSize = tpSizes.reduce((a, b) => a + b, 0);

  // Compute cumulative remaining size after each TP
  const thresholds: number[] = [];
  let rem = originalSize;
  for (const sz of tpSizes) {
    rem -= sz;
    thresholds.push(rem);
  }

  // Determine which TPs are hit
  const hitFlags = thresholds.map((thresh) => currentSize <= thresh + TP_SIZE_TOLERANCE);
  const hitIndices = hitFlags.flatMap((hit, i) => (hit ? [i] : []));
  const pendingIndices = hitFlags.flatMap((hit, i) => (!hit ? [i] : []));

  const lines: string[] = [];

  if (hitIndices.length > 0) {
    const tpLabels = hitIndices.map((i) => `TP${i + 1} (${tpPrices[i]})`).join(" и ");
    lines.push(`✅ ${tpLabels} — взят${hitIndices.length > 1 ? "ы" : ""}`);
  }

  // Size transition + realised PnL
  const realisedPnl = toNumber(position.exchange?.position_snapshot?.cumRealisedPnl);
  const sizeTransition = `${formatNum(originalSize, 2)} → ${formatNum(currentSize, 2)} ед.`;
  const realisedPart = Number.isFinite(realisedPnl) && realisedPnl !== 0
    ? ` | Реализованный P&L: ${realisedPnl >= 0 ? "+" : ""}${realisedPnl.toFixed(2)} USDT`
    : "";
  lines.push(`Размер: ${sizeTransition}${realisedPart}`);

  if (pendingIndices.length > 0) {
    const label = pendingIndices.length === 1 ? "Остался" : "Остались";
    const parts = pendingIndices.map((i) => `TP${i + 1} (${tpPrices[i]}, ${tpSizes[i].toFixed(2)} ед.)`);
    lines.push(`${label} ${parts.join(", ")}`);
  }

  const unrealisedPnl = toNumber(position.exchange?.position_snapshot?.unrealisedPnl);
  if (Number.isFinite(unrealisedPnl) && unrealisedPnl !== 0) {
    const emoji = unrealisedPnl >= 0 ? "💰" : "📉";
    lines.push(`Нереализованный P&L: ${unrealisedPnl >= 0 ? "+" : ""}${unrealisedPnl.toFixed(2)} USDT ${emoji}`);
  }

  return lines;
}

function formatPositionLine(position: TradingPosition): string {
  const symbol = position.symbol ?? "UNKNOWN";
  const side = String(position.side ?? "").toUpperCase();
  const size = formatNum(getOpenPositionSize(position), 4);
  const avg = getAvgPrice(position);
  const stop = getLatestStop(position);
  const avgText = avg > 0 ? ` | avg ${formatNum(avg, 6)}` : "";
  const stopText = stop > 0 ? ` | SL ${formatNum(stop, 6)}` : "";
  return `• ${symbol} ${side} | size ${size}${avgText}${stopText}`;
}

function formatOrderLine(position: TradingPosition): string {
  const symbol = position.symbol ?? "UNKNOWN";
  const side = String(position.side ?? "").toUpperCase();
  const qty = toNumber(position.exchange?.order_snapshot?.leavesQty || position.exchange?.order_snapshot?.qty);
  const price = toNumber(position.exchange?.order_snapshot?.price);
  const stop = getLatestStop(position);
  const priceText = price > 0 ? ` | price ${formatNum(price, 6)}` : "";
  const stopText = stop > 0 ? ` | SL ${formatNum(stop, 6)}` : "";
  return `• ${symbol} ${side} | qty ${formatNum(qty, 4)}${priceText}${stopText}`;
}

function formatDesyncKindLabel(kind: string | null | undefined): string {
  if (kind === "local_open_exchange_closed") return "локально открыта, биржа считает закрытой";
  if (kind === "local_closed_exchange_open") return "локально закрыта, биржа показывает открытую";
  if (kind === "stale_seeded_snapshot") return "биржа долго не подтвердила отправленный ордер";
  if (kind === "post_mutation_sync_failed") return "после изменения не удалось быстро свериться с биржей";
  if (kind === "exchange_sync_failed") return "не удалось обновить состояние с биржи";
  return "статус расходится с биржей";
}

function formatAgeShort(timestamp: string | null | undefined): string {
  const ts = Date.parse(String(timestamp ?? ""));
  if (!Number.isFinite(ts)) {
    return "n/a";
  }
  const diffMs = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}м`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}ч`;
  return `${Math.floor(hours / 24)}д`;
}

function shouldIncludeRecoveryStatusSnapshot(snapshot: TradingSignalSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  const actionability = String(snapshot.actionability_status ?? "");
  if (actionability === "blocked") return false;
  const decisionAction = String(snapshot.last_decision_action ?? "");
  if (actionability === "pending_confirmation") return true;
  if (decisionAction === "REQUEST_CONFIRMATION") return true;
  if (decisionAction === "WAIT") {
    const reason = String(snapshot.last_decision_reason ?? "");
    return reason.startsWith("preserve_");
  }
  return false;
}

function isRecoverableMissedSnapshot(snapshot: TradingSignalSnapshot | null | undefined): boolean {
  if (!snapshot || typeof snapshot.telegram_message_id !== "number") return false;
  const kind = String(snapshot.signal_kind ?? "UNKNOWN");
  if (kind === "UNKNOWN") return false;

  const notifStatus = String(snapshot.last_notification_status ?? "");
  if (notifStatus === "sent" || notifStatus === "auto_executed") return false;

  const decisionAction = String(snapshot.last_decision_action ?? "");
  if (decisionAction === "IGNORE") return false;

  const ts = Date.parse(String(snapshot.message_timestamp ?? snapshot.updated_at ?? ""));
  if (Number.isFinite(ts) && Date.now() - ts > STATUS_RECOVERY_WINDOW_MS) return false;

  const actionability = String(snapshot.actionability_status ?? "");
  const deliveryMode = String(snapshot.latest_delivery_mode ?? "live");
  const isBackfill = deliveryMode === "backfill";

  if (isBackfill) {
    return shouldIncludeRecoveryStatusSnapshot(snapshot);
  }
  if (notifStatus === "failed" && actionability !== "blocked") {
    return true;
  }
  return shouldIncludeRecoveryStatusSnapshot(snapshot);
}

function summarizeOperationalStatus(
  positions: TradingPosition[],
  snapshots: TradingSignalSnapshot[],
): {
  desyncedActiveCount: number;
  pendingReviewCount: number;
  awaitingOwnerInputCount: number;
  missedDeliveryCount: number;
  activeObjectsWithStaleSync: number;
  latestActiveSyncAt: string | null;
} {
  const activeObjects = positions.filter((position) => isOpenPosition(position) || isOpenEntryOrder(position));
  const desyncedActiveCount = activeObjects.filter(
    (position) => position.exchange?.desynced === true,
  ).length;

  let latestActiveSyncAt: string | null = null;
  let latestActiveSyncTs = 0;
  let activeObjectsWithStaleSync = 0;
  for (const position of activeObjects) {
    const rawSyncAt = String(position.exchange?.last_sync_at ?? "");
    const syncTs = Date.parse(rawSyncAt);
    if (!Number.isFinite(syncTs)) {
      activeObjectsWithStaleSync += 1;
      continue;
    }
    if (Date.now() - syncTs > STATUS_STALE_SYNC_MS) {
      activeObjectsWithStaleSync += 1;
    }
    if (syncTs > latestActiveSyncTs) {
      latestActiveSyncTs = syncTs;
      latestActiveSyncAt = rawSyncAt;
    }
  }

  const pendingReviewCount = snapshots.filter(
    (snapshot) => String(snapshot?.actionability_status ?? "") === "pending_confirmation",
  ).length;
  const awaitingOwnerInputCount = snapshots.filter(
    (snapshot) => String(snapshot?.awaiting_owner_input_type ?? "").length > 0,
  ).length;
  const missedDeliveryCount = snapshots.filter(isRecoverableMissedSnapshot).length;

  return {
    desyncedActiveCount,
    pendingReviewCount,
    awaitingOwnerInputCount,
    missedDeliveryCount,
    activeObjectsWithStaleSync,
    latestActiveSyncAt,
  };
}

async function buildTradingUtilityReply(command: Exclude<TradingCommand, { action: "confirm" | "reject" | "work" | "skip" | "force"; telegramMessageId: number } | { error: string }>): Promise<string> {
  const positions = await readTradingPositions();

  switch (command.action) {
    case "start_watching": {
      const output = await runWrapper(INTAKE_START);
      return output.startsWith("Already running") ? "Watching уже запущен." : "Watching запущен.";
    }
    case "restore": {
      await runWrapper(HOST_RESTORE);
      const watcherSummary = await readWrapperFirstLine(INTAKE_STATUS).catch(() => "UNKNOWN");
      const syncSummary = await readWrapperFirstLine(SYNC_STATUS).catch(() => "UNKNOWN");
      const healthSummary = await readWrapperFirstLine(HEALTH_STATUS).catch(() => "UNKNOWN");
      return [
        "Восстановление выполнено",
        withStatusDot(watcherSummary, "Канал"),
        withStatusDot(syncSummary, "Биржа"),
        withStatusDot(healthSummary, "Автоконтроль"),
      ].join("\n");
    }
    case "stop_watching": {
      const output = await runWrapper(INTAKE_STOP);
      return output.startsWith("Stopped") ? "Watching остановлен." : "Watching уже был остановлен.";
    }
    case "recover_signal": {
      const output = stripAnsi(await runWrapper(INTAKE_RECOVER));
      return output || "Watcher поднят, последние сигналы догоняются.";
    }
    case "watching_status": {
      return withStatusDot(await readWrapperFirstLine(INTAKE_STATUS), "Канал");
    }
    case "sync_status": {
      return withStatusDot(await readWrapperFirstLine(SYNC_STATUS), "Биржа");
    }
    case "open_positions": {
      const open = positions.filter(isOpenPosition);
      return open.length === 0 ? "Сейчас открытых позиций нет." : `Открытых позиций: ${open.length}`;
    }
    case "open_positions_list": {
      const open = positions.filter(isOpenPosition);
      if (open.length === 0) {
        return "Сейчас открытых позиций нет.";
      }
      const linkBuilderModule = (await import(TV_LINK_BUILDER_MODULE_URL)) as {
        buildSignalChartLinkSafe: (signalId: string | number) => Promise<string | null>;
        buildBybitTradeUrl: (symbol: string, category?: string) => string | null;
      };
      const lines = await Promise.all(open.map(async (position) => {
        const symbol = position.symbol ?? "UNKNOWN";
        const side = String(position.side ?? "").toUpperCase();
        const size = formatNum(getOpenPositionSize(position), 4);
        const avg = getAvgPrice(position);
        const stop = getLatestStop(position);
        const avgText = avg > 0 ? ` · avg ${formatNum(avg, 6)}` : "";
        const stopText = stop > 0 ? ` · SL ${formatNum(stop, 6)}` : "";
        const category = String(
          (position.exchange as Record<string, unknown> | null)?.preview_payload?.category ??
          (position.exchange as Record<string, unknown> | null)?.request_payload?.category ??
          "linear"
        );
        const bybitUrl = linkBuilderModule.buildBybitTradeUrl(symbol, category);
        const tvUrl = await linkBuilderModule.buildSignalChartLinkSafe(position.telegram_message_id).catch(() => null);
        const header = `**${symbol} ${side}** · size ${size}${avgText}${stopText}`;
        const lineParts: string[] = [`• ${header}`];
        if (position.exchange?.desynced) {
          lineParts.push(`  ⚠️ Расхождение с биржей: ${formatDesyncKindLabel(position.exchange.desync_kind)}`);
        }
        const tpProgress = buildTpProgressLines(position);
        for (const tpLine of tpProgress) lineParts.push(`  ${tpLine}`);
        const linkParts = [
          tvUrl ? `[📊 Посмотреть на TradingView](${tvUrl})` : null,
          bybitUrl ? `[🔗 Открыть на ByBit](${bybitUrl})` : null,
        ].filter(Boolean) as string[];
        if (linkParts.length > 0) lineParts.push(`  ${linkParts.join(" · ")}`);
        return lineParts.join("\n");
      }));
      const positionsParts = ["Открытые позиции:", ...lines];
      if (TRADING_DASHBOARD_URL) positionsParts.push(`[📈 Дашборд](${TRADING_DASHBOARD_URL})`);
      return positionsParts.filter(Boolean).join("\n\n");
    }
    case "open_orders": {
      const openOrders = getOpenOrders(positions);
      return openOrders.length === 0 ? "Сейчас открытых ордеров нет." : `Открытых ордеров: ${openOrders.length}`;
    }
    case "open_orders_list": {
      const openOrders = getOpenOrders(positions);
      if (openOrders.length === 0) {
        return "Сейчас открытых ордеров нет.";
      }
      return ["Открытые ордера:", ...openOrders.map(formatOrderLine)].join("\n");
    }
    case "positions_and_orders": {
      const open = positions.filter(isOpenPosition);
      let positionsBlock: string;
      if (open.length === 0) {
        positionsBlock = "Сейчас открытых позиций нет.";
      } else {
        const linkBuilderModule = (await import(TV_LINK_BUILDER_MODULE_URL)) as {
          buildSignalChartLinkSafe: (signalId: string | number) => Promise<string | null>;
          buildBybitTradeUrl: (symbol: string, category?: string) => string | null;
        };
        const lines = await Promise.all(open.map(async (position) => {
          const symbol = position.symbol ?? "UNKNOWN";
          const side = String(position.side ?? "").toUpperCase();
          const size = formatNum(getOpenPositionSize(position), 4);
          const avg = getAvgPrice(position);
          const stop = getLatestStop(position);
          const avgText = avg > 0 ? ` · avg ${formatNum(avg, 6)}` : "";
          const stopText = stop > 0 ? ` · SL ${formatNum(stop, 6)}` : "";
          const category = String(
            (position.exchange as Record<string, unknown> | null)?.preview_payload?.category ??
            (position.exchange as Record<string, unknown> | null)?.request_payload?.category ??
            "linear"
          );
          const bybitUrl = linkBuilderModule.buildBybitTradeUrl(symbol, category);
          const tvUrl = await linkBuilderModule.buildSignalChartLinkSafe(position.telegram_message_id).catch(() => null);
          const header = `**${symbol} ${side}** · size ${size}${avgText}${stopText}`;
          const lineParts: string[] = [`• ${header}`];
          if (position.exchange?.desynced) {
            lineParts.push(`  ⚠️ Расхождение с биржей: ${formatDesyncKindLabel(position.exchange.desync_kind)}`);
          }
          const tpProgress = buildTpProgressLines(position);
          for (const tpLine of tpProgress) lineParts.push(`  ${tpLine}`);
          const linkParts = [
            tvUrl ? `[📊 Посмотреть на TradingView](${tvUrl})` : null,
            bybitUrl ? `[🔗 Открыть на ByBit](${bybitUrl})` : null,
          ].filter(Boolean) as string[];
          if (linkParts.length > 0) lineParts.push(`  ${linkParts.join(" · ")}`);
          return lineParts.join("\n");
        }));
        positionsBlock = ["Открытые позиции:", ...lines].join("\n\n");
      }
      const openOrders = getOpenOrders(positions);
      const ordersBlock = openOrders.length === 0
        ? "Сейчас открытых ордеров нет."
        : ["Открытые ордера:", ...openOrders.map(formatOrderLine)].join("\n");
      const dashboardLink = TRADING_DASHBOARD_URL ? `[📈 Дашборд](${TRADING_DASHBOARD_URL})` : null;
      return [positionsBlock, ordersBlock, dashboardLink].filter(Boolean).join("\n\n");
    }
    case "autonomous_mode_toggle": {
      const tradingConfigModule = (await import(TRADING_CONFIG_MODULE_URL)) as {
        readTradingConfig: () => Promise<{ autonomous_mode: boolean }>;
        setAutonomousMode: (enabled: boolean) => Promise<{ autonomous_mode: boolean }>;
      };
      const current = await tradingConfigModule.readTradingConfig();
      const nowEnabled = !current.autonomous_mode;
      await tradingConfigModule.setAutonomousMode(nowEnabled);
      if (nowEnabled) {
        return [
          "🟢 **Автономный режим включён**",
          "Поддержанные сигналы будут автоматически отправляться на биржу 24/7 — без окна подтверждений.",
          "",
          "Guardrails:",
          "• NEW\\_SIGNAL, PARTIAL\\_CLOSE и одиночный CLOSE\\_SIGNAL — авто",
          "• SL/TP/Breakeven-обновления применяются только по надёжно linked позиции",
          "• Только live-сигналы, backfill и recovery — исключены",
          "• trader#B (NEW\\_SIGNAL) — по-прежнему только вручную",
          "• Bulk close, reported stop-hit и неполные сигналы остаются на подтверждении",
          "• Требуется полный парс: символ, вход, стоп, тейки",
          "",
          "Отключить: нажми «Автономный режим» ещё раз."
        ].join("\n");
      } else {
        return [
          "⚪ **Автономный режим выключен**",
          "Новые сигналы снова ждут твоего решения."
        ].join("\n");
      }
    }
    case "parsing_mode_toggle": {
      const tradingConfigModule = (await import(TRADING_CONFIG_MODULE_URL)) as {
        readTradingConfig: () => Promise<{ autonomous_mode: boolean; parsing_mode: string }>;
        setParsingMode: (mode: string) => Promise<{ parsing_mode: string }>;
      };
      const current = await tradingConfigModule.readTradingConfig();
      const currentMode = current.parsing_mode ?? "machine_first";
      const newMode = currentMode === "llm_first" ? "machine_first" : "llm_first";
      await tradingConfigModule.setParsingMode(newMode);
      if (newMode === "llm_first") {
        return [
          "🧠 **Режим парсинга: LLM-first**",
          "LLM запускается первым только на trade-like сообщениях. Машинный парсер — резерв и арбитр качества.",
          "",
          "Guardrails:",
          "• Уверенность LLM должна быть medium или high",
          "• При таймауте (5с), конфликте с machine parse или слабой структуре — машинный парсер",
          "• Результат LLM хранится в `llm\\_advisory\\_*` полях снапшота",
          "",
          "Переключить обратно: нажми «Режим парсинга» ещё раз."
        ].join("\n");
      } else {
        return [
          "⚙️ **Режим парсинга: Machine-first**",
          "Детерминированный парсер как обычно. LLM подключается только для неполных и непонятных сигналов."
        ].join("\n");
      }
    }
    case "traders": {
      const channelConfigModule = (await import(CHANNEL_CONFIG_MODULE_URL)) as {
        TOPIC_TRADER_MAP?: Record<string, string>;
      };
      const traderGateModule = (await import(TRADER_GATE_MODULE_URL)) as {
        listTraderStates: () => Promise<Record<string, boolean>>;
      };
      const traderStatsModule = (await import(TRADER_STATS_MODULE_URL)) as {
        loadTraderStatsFromDisk: (traderId: string) => Promise<{
          signals_day?: number;
          signals_week?: number;
          signals_month?: number;
          positions_open?: number;
          positions_closed_total?: number;
        }>;
      };
      const traderIds = Array.from(new Set(Object.values(channelConfigModule.TOPIC_TRADER_MAP ?? {})));
      const states = await traderGateModule.listTraderStates();
      const lines = await Promise.all(
        traderIds.map(async (traderId) => {
          const enabled = states[traderId] !== false;
          const stats = await traderStatsModule.loadTraderStatsFromDisk(traderId).catch(() => ({}));
          const stateLabel = enabled ? "🟢 вкл" : "⏸️ пауза";
          return [
            `• ${traderId}: ${stateLabel}`,
            `  сигналы 24ч/7д/30д: ${stats.signals_day ?? 0}/${stats.signals_week ?? 0}/${stats.signals_month ?? 0}`,
            `  позиции: открыто ${stats.positions_open ?? 0}, закрыто ${stats.positions_closed_total ?? 0}`,
          ].join("\n");
        }),
      );
      return [
        "Трейдеры",
        "",
        ...(lines.length > 0 ? lines : ["Трейдеры не настроены."]),
      ].join("\n");
    }
    case "deposit": {
      const balance = await readDepositBalance();
      return `Депозит: ${formatNum(balance, 2)} USDT`;
    }
    case "pnl_12h": {
      const result = computeWindowPnl(positions, 12);
      return `PnL 12ч: ${formatSignedUsd(result.pnl)}${result.count > 0 ? ` | сделок: ${result.count}` : ""}`;
    }
    case "pnl_24h": {
      const result = computeWindowPnl(positions, 24);
      return `PnL 24ч: ${formatSignedUsd(result.pnl)}${result.count > 0 ? ` | сделок: ${result.count}` : ""}`;
    }
    case "position": {
      const symbol = command.symbol.toUpperCase();
      const match =
        positions.find((position) => isOpenPosition(position) && String(position.symbol).toUpperCase() === symbol) ??
        getOpenOrders(positions).find((position) => String(position.symbol).toUpperCase() === symbol) ??
        positions.find((position) => String(position.symbol).toUpperCase() === symbol);
      if (!match) {
        return `Позиция по ${symbol} не найдена.`;
      }
      if (isOpenPosition(match)) {
        const pnl = toNumber(match.exchange?.position_snapshot?.cumRealisedPnl);
        return [
          `${match.symbol} ${String(match.side ?? "").toUpperCase()}`,
          "Status: open",
          `Size: ${formatNum(getOpenPositionSize(match), 4)}`,
          `Avg: ${formatNum(getAvgPrice(match), 6)}`,
          `SL: ${formatNum(getLatestStop(match), 6)}`,
          `PnL: ${formatSignedUsd(pnl)}`,
          ...(match.exchange?.desynced ? [`⚠️ Расхождение: ${formatDesyncKindLabel(match.exchange.desync_kind)}`] : []),
        ].join("\n");
      }
      if (isOpenEntryOrder(match)) {
        return [
          `${match.symbol} ${String(match.side ?? "").toUpperCase()}`,
          "Status: open order",
          `Qty: ${formatNum(toNumber(match.exchange?.order_snapshot?.leavesQty || match.exchange?.order_snapshot?.qty), 4)}`,
          `Price: ${formatNum(toNumber(match.exchange?.order_snapshot?.price), 6)}`,
          `SL: ${formatNum(getLatestStop(match), 6)}`,
        ].join("\n");
      }
      return [
        `${match.symbol} ${String(match.side ?? "").toUpperCase()}`,
        `Status: ${match.status ?? "closed"}`,
        `Last sync: ${match.exchange?.last_sync_at ?? "n/a"}`,
      ].join("\n");
    }
    case "dashboard": {
      // Ensure dashboard server is running
      await execFile(DASHBOARD_START, [], { env: process.env }).catch(() => null);
      // Get tunnel URL (or start tunnel if not running)
      let dashUrl: string | null = null;
      try {
        const urlResult = await execFile(DASHBOARD_TUNNEL_URL, [], { env: process.env });
        dashUrl = String(urlResult.stdout ?? "").trim() || null;
      } catch {
        dashUrl = null;
      }
      if (!dashUrl) {
        // Tunnel not running — start it (may take up to 30s)
        try {
          const startResult = await execFile(DASHBOARD_TUNNEL_START, [], {
            env: process.env,
            timeout: 150_000,
          });
          dashUrl = String(startResult.stdout ?? "").trim().split("\n").pop() ?? null;
        } catch {
          dashUrl = null;
        }
      }
      if (!dashUrl) {
        return "❌ Не удалось запустить туннель дашборда";
      }
      return `📊 Dashboard: ${dashUrl}`;
    }
    case "help":
    case "menu": {
      const tradingConfigModule = (await import(TRADING_CONFIG_MODULE_URL)) as {
        readTradingConfig: () => Promise<{ autonomous_mode?: boolean; parsing_mode?: string }>;
      };
      const snapshots = await readTradingSignalSnapshots();
      const watcher = await getPidfileStatus(INTAKE_PIDFILE);
      const sync = await getPidfileStatus(SYNC_PIDFILE);
      const watcherSummary = await readWrapperFirstLine(INTAKE_STATUS).catch(() => watcher);
      const syncSummary = await readWrapperFirstLine(SYNC_STATUS).catch(() => sync);
      const healthSummary = await readWrapperFirstLine(HEALTH_STATUS).catch(() => "UNKNOWN");
      const openPositions = positions.filter(isOpenPosition);
      const openOrders = getOpenOrders(positions);
      const operational = summarizeOperationalStatus(positions, snapshots);
      const tradingConfig = await tradingConfigModule.readTradingConfig().catch(() => ({
        autonomous_mode: false,
        parsing_mode: "machine_first",
      }));
      const autonomousModeStatus = tradingConfig.autonomous_mode ? "🟢 вкл" : "⚪ выкл";
      const parsingModeStatus = tradingConfig.parsing_mode === "llm_first" ? "LLM-first" : "Machine-first";
      return [
        "Pif меню",
        "",
        withStatusDot(watcherSummary, "Канал"),
        withStatusDot(syncSummary, "Биржа"),
        withStatusDot(healthSummary, "Автоконтроль"),
        "",
        `Автономный режим: ${autonomousModeStatus}`,
        `Режим парсинга: ${parsingModeStatus}`,
        "",
        `Позиции: ${openPositions.length} | Ордера: ${openOrders.length}`,
        ...(operational.desyncedActiveCount > 0 ? [`Расхождения с биржей: ${operational.desyncedActiveCount}`] : []),
        ...(operational.activeObjectsWithStaleSync > 0 ? [`Без свежего sync: ${operational.activeObjectsWithStaleSync}`] : []),
        `Ждут решения: ${operational.pendingReviewCount}`,
        `Пропущено/не доставлено: ${operational.missedDeliveryCount}`,
        "",
        "Выбери нужный раздел кнопками ниже.",
      ].join("\n");
    }
    case "status":
    default: {
      const snapshots = await readTradingSignalSnapshots();
      const watcher = await getPidfileStatus(INTAKE_PIDFILE);
      const sync = await getPidfileStatus(SYNC_PIDFILE);
      const watcherSummary = await readWrapperFirstLine(INTAKE_STATUS).catch(() => watcher);
      const syncSummary = await readWrapperFirstLine(SYNC_STATUS).catch(() => sync);
      const balance = await readDepositBalance().catch(() => null);
      const openPositions = positions.filter(isOpenPosition);
      const openOrders = getOpenOrders(positions);
      const tradingConfigModule = (await import(TRADING_CONFIG_MODULE_URL)) as {
        readTradingConfig: () => Promise<{ autonomous_mode?: boolean; parsing_mode?: string }>;
      };
      const tradingConfig = await tradingConfigModule.readTradingConfig().catch(() => ({
        autonomous_mode: false,
        parsing_mode: "machine_first",
      }));
      const operational = summarizeOperationalStatus(positions, snapshots);
      const pnl12 = computeWindowPnl(positions, 12);
      const pnl24 = computeWindowPnl(positions, 24);
      const pnl7d = computeWindowPnl(positions, 24 * 7);
      const pnl30d = computeWindowPnl(positions, 24 * 30);
      return [
        "Trading Assistant",
        "",
        withStatusDot(watcherSummary, "Канал"),
        withStatusDot(syncSummary, "Биржа"),
        "---------------------------",
        `🤖 Автономный режим: ${tradingConfig.autonomous_mode ? "вкл" : "выкл"}`,
        `🧠 Режим парсинга: ${tradingConfig.parsing_mode === "llm_first" ? "LLM-first" : "Machine-first"}`,
        "---------------------------",
        `💰 Deposit: ${balance == null ? "n/a" : `${formatNum(balance, 2)} USDT`}`,
        "---------------------------",
        `📈 Open positions: ${openPositions.length}`,
        ...(operational.desyncedActiveCount > 0 ? [`⚠️ Расхождения с биржей: ${operational.desyncedActiveCount}`] : []),
        `🧾 Open orders: ${openOrders.length}`,
        `🔄 Последний sync биржи: ${formatAgeShort(operational.latestActiveSyncAt)}`,
        ...(operational.activeObjectsWithStaleSync > 0 ? [`⚠️ Без свежего sync: ${operational.activeObjectsWithStaleSync}`] : []),
        "---------------------------",
        `📝 Ждут твоего решения: ${operational.pendingReviewCount}`,
        `⌛ Ждут ввод размера/плеча: ${operational.awaitingOwnerInputCount}`,
        `📬 Пропущено или не доставлено: ${operational.missedDeliveryCount}`,
        "---------------------------",
        `🕒 12h PnL: ${formatSignedUsd(pnl12.pnl)}`,
        `📅 24h PnL: ${formatSignedUsd(pnl24.pnl)}`,
        `🗓️ 7d PnL: ${formatSignedUsd(pnl7d.pnl)}`,
        `📆 30d PnL: ${formatSignedUsd(pnl30d.pnl)}`,
      ].join("\n");
    }
  }
}

type PifMenuButton = { text: string; callback_data: string };

export function __test__buildPifMenuButtons(): PifMenuButton[][] {
  return [
    [
      { text: "Статус", callback_data: "pif status" },
    ],
    [
      { text: "Позиции и ордера", callback_data: "pif positions and orders" },
    ],
    [
      { text: "Автономный режим", callback_data: "pif autonomous mode" },
      { text: "Режим парсинга", callback_data: "pif parsing mode" },
    ],
    [
      { text: "Трейдеры", callback_data: "pif traders" },
    ],
    [
      { text: "Восстановить", callback_data: "pif restore" },
    ],
    [
      { text: "Проверить пропуск", callback_data: "pif проверить пропуск" },
    ],
    [{ text: "📊 Dashboard", callback_data: "pif dashboard" }],
  ];
}

function buildPifMenuButtons(): PifMenuButton[][] {
  return __test__buildPifMenuButtons();
}

export const handleTradingCommands: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  if (params.agentId !== "chief-trading-assistant") {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    return {
      shouldContinue: false,
      reply: { text: "❌ You are not authorized to confirm trading actions." },
    };
  }

  const parsed = parseTradingActionCommand(params.command.commandBodyNormalized);
  if (!parsed) {
    // Phase C: check for active recovery batch — owner may be replying with "1 3 4"
    const recoveryBatchModule = (await import(RECOVERY_BATCH_MODULE_URL)) as {
      readRecoveryBatch: () => Promise<{ batch_id: string; candidates: Array<{ index: number; telegram_message_id: number; symbol: string; side: string; signal_kind: string; trader_id: string }> } | null>;
      consumeRecoveryBatch: () => Promise<void>;
      parseRecoverySelection: (rawText: string) => number[] | null;
    };
    const activeBatch = await recoveryBatchModule.readRecoveryBatch();
    if (activeBatch) {
      const rawText = params.command.commandBodyNormalized.trim();
      if (["отмена", "cancel", "стоп"].includes(rawText.toLowerCase())) {
        await recoveryBatchModule.consumeRecoveryBatch();
        return {
          shouldContinue: false,
          reply: { text: "Recovery отменён." },
        };
      }
      const selection = recoveryBatchModule.parseRecoverySelection(rawText);
      if (selection === null) {
        return {
          shouldContinue: false,
          reply: { text: "Не понял. Пришли номера через пробел. Пример: 1 3\nЧтобы отменить — напиши: отмена" },
        };
      }

      const maxIdx = activeBatch.candidates.length;
      const validIndices = selection.filter((n) => n >= 1 && n <= maxIdx);
      if (validIndices.length === 0) {
        return {
          shouldContinue: false,
          reply: { text: `Нет сигналов с такими номерами. Доступны: 1–${maxIdx}` },
        };
      }

      await recoveryBatchModule.consumeRecoveryBatch();

      const selected = validIndices.map((n) => activeBatch.candidates.find((c) => c.index === n)).filter(Boolean) as Array<{ index: number; telegram_message_id: number; symbol: string; side: string; signal_kind: string; trader_id: string }>;

      const storeModule = (await import(STORE_MODULE_URL)) as {
        readSignalSnapshot: (telegramMessageId: number) => Promise<Record<string, unknown> | null>;
        updateSignalNotificationState: (
          telegramMessageId: number,
          update: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
      const notifierModule = (await import(NOTIFIER_MODULE_URL)) as {
        sendTradingConfirmationNotification: (snapshot: Record<string, unknown>) => Promise<{ messageId?: number | null }>;
      };

      let sent = 0;
      const failedSymbols: string[] = [];
      for (const candidate of selected) {
        try {
          const snap = await storeModule.readSignalSnapshot(candidate.telegram_message_id);
          if (!snap) {
            failedSymbols.push(`#${candidate.telegram_message_id}`);
            continue;
          }
          const result = await notifierModule.sendTradingConfirmationNotification(snap);
          const notifKey = [
            snap.telegram_message_id,
            snap.version_count,
            snap.signal_kind ?? "unknown",
            snap.last_decision_action ?? "none",
            snap.linked_position_id ?? "none"
          ].join(":");
          await storeModule.updateSignalNotificationState(candidate.telegram_message_id, {
            notification_key: notifKey,
            notification_status: "sent",
            message_id: result.messageId ?? null,
            sent_at: new Date().toISOString(),
          });
          sent++;
        } catch {
          failedSymbols.push(`${candidate.symbol} (#${candidate.telegram_message_id})`);
        }
      }

      const lines = [`📨 Отправил ${sent} карточк${sent === 1 ? "у" : sent >= 2 && sent <= 4 ? "и" : "ок"} на подтверждение.`];
      if (failedSymbols.length > 0) {
        lines.push(`⚠️ Не удалось отправить: ${failedSymbols.join(", ")}`);
      }
      return {
        shouldContinue: false,
        reply: { text: lines.join("\n") },
      };
    }

    const awaitingSnapshot = await resolveAwaitingOwnerInputSnapshot();
    if (!awaitingSnapshot) {
      return null;
    }
    const telegramMessageId = Number(awaitingSnapshot.telegram_message_id ?? 0);
    if (!Number.isFinite(telegramMessageId) || telegramMessageId <= 0) {
      return null;
    }
    const inputType = String(awaitingSnapshot.awaiting_owner_input_type ?? "");
    const rawText = params.command.commandBodyNormalized.trim();
    const lowered = rawText.toLowerCase();
    const storeModule = (await import(STORE_MODULE_URL)) as {
      updateSignalOwnerReviewState: (
        telegramMessageId: number,
        review: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
    const notifierModule = (await import(NOTIFIER_MODULE_URL)) as {
      sendTradingConfirmationNotification: (snapshot: Record<string, unknown>) => Promise<unknown>;
    };

    if (["отмена", "cancel", "стоп"].includes(lowered)) {
      await storeModule.updateSignalOwnerReviewState(telegramMessageId, {
        awaiting_owner_input_type: null,
        owner_review_by: buildActorLabel(params),
        updated_at: new Date().toISOString(),
      });
      return {
        shouldContinue: false,
        reply: { text: "Изменение параметра отменено." },
      };
    }

    let reviewUpdate: Record<string, unknown> | null = null;
    let errorText = "Не понял значение.";
    if (inputType === "position_usdt") {
      const positionUsd = parsePositionSizeInput(rawText);
      if (positionUsd == null) {
        errorText = "Напиши размер позиции числом в USDT. Пример: 5000";
      } else {
        reviewUpdate = {
          owner_override_position_usdt: Number(positionUsd.toFixed(2)),
          awaiting_owner_input_type: null,
          owner_review_by: buildActorLabel(params),
          updated_at: new Date().toISOString(),
        };
      }
    } else if (inputType === "leverage") {
      const leverage = parseLeverageInput(rawText);
      if (leverage == null) {
        errorText = `Напиши плечо числом от ${LEVERAGE_MIN} до ${LEVERAGE_MAX}. Пример: 7x`;
      } else {
        reviewUpdate = {
          owner_override_leverage: leverage,
          awaiting_owner_input_type: null,
          owner_review_by: buildActorLabel(params),
          updated_at: new Date().toISOString(),
        };
      }
    } else {
      return null;
    }

    if (!reviewUpdate) {
      return {
        shouldContinue: false,
        reply: { text: errorText },
      };
    }

    const updatedSnapshot = await storeModule.updateSignalOwnerReviewState(telegramMessageId, reviewUpdate);
    await notifierModule.sendTradingConfirmationNotification(updatedSnapshot);
      return {
        shouldContinue: false,
        reply: { text: await buildOwnerOverrideSavedReply(updatedSnapshot, inputType as "position_usdt" | "leverage") },
      };
  }
  if ("error" in parsed) {
    return {
      shouldContinue: false,
      reply: { text: parsed.error },
    };
  }

  try {
    if (
      parsed.action !== "confirm" &&
      parsed.action !== "reject" &&
      parsed.action !== "work" &&
      parsed.action !== "skip" &&
      parsed.action !== "force" &&
      parsed.action !== "set_size" &&
      parsed.action !== "set_lev"
    ) {
      const text = await buildTradingUtilityReply(parsed);
      const buttons = parsed.action === "menu" ? buildPifMenuButtons() : undefined;
        return {
          shouldContinue: false,
          reply: buttons
            ? { text, channelData: { telegram: { buttons } } }
            : { text },
        };
    }

    const tradingModule = (await import(POSITIONS_MODULE_URL)) as {
      confirmSignalAction: (
        telegramMessageId: number,
        options: { confirmedBy: string; note?: string | null },
      ) => Promise<{ position_id?: string | null; status?: string | null }>;
      rejectSignalAction: (
        telegramMessageId: number,
        options: { rejectedBy: string; note?: string | null },
      ) => Promise<{ status?: string | null }>;
    };

    if (parsed.action === "confirm" || parsed.action === "work") {
      const targetTelegramMessageId =
        parsed.telegramMessageId ??
        await resolveRecentTradingMessageId(parsed.action);
      if (!targetTelegramMessageId) {
        return {
          shouldContinue: false,
          reply: {
            text: "Не вижу свежей торговой карточки, к которой можно применить это действие.",
          },
        };
      }
      const storeModule = (await import(STORE_MODULE_URL)) as {
        readSignalSnapshot: (telegramMessageId: number) => Promise<Record<string, unknown> | null>;
        updateSignalLifecycleState: (
          telegramMessageId: number,
          update: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
      const executionModule = (await import(EXECUTE_CONFIRMED_MODULE_URL)) as {
        executeConfirmedTradingAction: (snapshot: Record<string, unknown>) => Promise<Record<string, unknown>>;
      };
      let snapshotBeforeConfirm = await storeModule.readSignalSnapshot(targetTelegramMessageId);
      if (!snapshotBeforeConfirm) {
        throw new Error(`signal snapshot not found for telegram_message_id=${targetTelegramMessageId}`);
      }
      let actionability = String(snapshotBeforeConfirm.actionability_status ?? "");
      if (actionability !== "pending_confirmation") {
        const parsedSignal = (snapshotBeforeConfirm.latest_parsed_signal as { symbol?: string; entries?: unknown[] } | null) ?? null;
        const symbol = String(parsedSignal?.symbol ?? "UNKNOWN");
        const referenceId = String(snapshotBeforeConfirm.signal_reference_id ?? "").trim();
        const referenceLine = referenceId ? ` по сигналу #${referenceId}` : "";
        const missingLevels =
          snapshotBeforeConfirm.signal_kind === "INCOMPLETE_SIGNAL" ||
          snapshotBeforeConfirm.signal_kind === "SYMBOL_PING" ||
          ((parsedSignal?.entries?.length ?? 0) === 0);

        // If the signal was explicitly rejected ("Пропускаем") but has complete data,
        // reinstate it to pending_confirmation so it proceeds as a normal confirmation.
        const canReinstate =
          actionability === "blocked" &&
          snapshotBeforeConfirm.last_decision_action === "IGNORE" &&
          snapshotBeforeConfirm.signal_kind !== "UNKNOWN" &&
          snapshotBeforeConfirm.signal_kind !== "INCOMPLETE_SIGNAL" &&
          snapshotBeforeConfirm.signal_kind !== "SYMBOL_PING" &&
          (snapshotBeforeConfirm.signal_kind !== "NEW_SIGNAL" || !missingLevels);

        if (canReinstate) {
          await storeModule.updateSignalLifecycleState(targetTelegramMessageId, {
            lifecycle_status: snapshotBeforeConfirm.lifecycle_status ?? "parsed",
            linked_position_id: snapshotBeforeConfirm.linked_position_id ?? null,
            actionability_status: "pending_confirmation",
            position_state: snapshotBeforeConfirm.position_state ?? "not_opened",
            decision_action: "REQUEST_CONFIRMATION",
            decision_reason: "owner_reinstated_after_reject",
            updated_at: new Date().toISOString()
          });
          snapshotBeforeConfirm = await storeModule.readSignalSnapshot(targetTelegramMessageId) ?? snapshotBeforeConfirm;
          actionability = "pending_confirmation";
        } else {
          await storeModule.updateSignalLifecycleState(targetTelegramMessageId, {
            lifecycle_status: snapshotBeforeConfirm.lifecycle_status ?? "parsed",
            linked_position_id: snapshotBeforeConfirm.linked_position_id ?? null,
            actionability_status: "pending",
            position_state: snapshotBeforeConfirm.position_state ?? "not_opened",
            decision_action: "WAIT",
            decision_reason: "owner_requested_manual_watch_wait_for_follow_up",
            updated_at: new Date().toISOString()
          });
          return {
            shouldContinue: false,
            reply: {
              text: missingLevels
                ? `⚠️ Не могу открыть ${symbol}${referenceLine}: в этом сообщении нет полного entry/SL/TP.\nЖду исходный полный сигнал, edit или следующее сообщение трейдера.`
                : `👀 Берём в наблюдение: #${targetTelegramMessageId}\nЖдём SL/TP, edit или следующее сообщение.`,
            },
          };
        }
      }
      try {
        const result = await tradingModule.confirmSignalAction(targetTelegramMessageId, {
          confirmedBy: buildActorLabel(params),
        });
        let executionResult;
        executionResult = await executionModule.executeConfirmedTradingAction(snapshotBeforeConfirm);
        const extra =
          executionResult?.mode === "executed"
            ? `\nБиржа: действие выполнено (${String(executionResult.action ?? "done")})`
            : executionResult?.mode === "not_supported"
              ? `\nБиржа: не выполнено (${String(executionResult.reason ?? "not_supported")})`
              : "";
        return {
          shouldContinue: false,
          reply: {
            text:
              `✅ Подтверждено: #${targetTelegramMessageId}` +
              (result.position_id ? `\nPosition: ${result.position_id}` : "") +
              extra,
          },
        };
      } catch (error) {
        const failure = classifyExecutionFailure(error);
        const buttons =
          failure.severity === "soft"
            ? [[
                { text: "Исполнить принудительно", callback_data: `/trading-force ${targetTelegramMessageId}` },
                { text: "Пропускаем", callback_data: `/trading-skip ${targetTelegramMessageId}` }
              ]]
            : [[
                { text: "Пропускаем", callback_data: `/trading-skip ${targetTelegramMessageId}` }
              ]];
        return {
          shouldContinue: false,
          reply: {
            text:
              `⚠️ Подтверждено, но не исполнено: #${targetTelegramMessageId}\n` +
              `Причина: ${failure.message}\n` +
              (failure.severity === "soft"
                ? "Это мягкий блок. Можно выполнить принудительно."
                : "Это жёсткий блок. Принудительное исполнение не предлагаю."),
            channelData: {
              telegram: {
                buttons
              }
            }
          },
        };
      }
    }

    if (parsed.action === "force") {
      const targetTelegramMessageId =
        parsed.telegramMessageId ??
        await resolveRecentTradingMessageId(parsed.action);
      if (!targetTelegramMessageId) {
        return {
          shouldContinue: false,
          reply: {
            text: "Не вижу свежей торговой карточки, для которой можно выполнить принудительное исполнение.",
          },
        };
      }
      const storeModule = (await import(STORE_MODULE_URL)) as {
        readSignalSnapshot: (telegramMessageId: number) => Promise<Record<string, unknown> | null>;
      };
      const executionModule = (await import(EXECUTE_CONFIRMED_MODULE_URL)) as {
        executeConfirmedTradingAction: (snapshot: Record<string, unknown>) => Promise<Record<string, unknown>>;
      };
      const tvLinkModule = (await import(TV_LINK_BUILDER_MODULE_URL)) as {
        buildSignalChartLinkSafe: (signalId: number) => Promise<string | null>;
        buildBybitTradeUrl: (symbol: string, category?: string) => string | null;
      };
      const snapshot = await storeModule.readSignalSnapshot(targetTelegramMessageId);
      if (!snapshot) {
        throw new Error(`signal snapshot not found for telegram_message_id=${targetTelegramMessageId}`);
      }
      if (String(snapshot.signal_kind ?? "") === "NEW_SIGNAL" && !snapshot.linked_position_id) {
        const tradingModule = (await import(TRADING_MODULE_URL)) as {
          confirmSignalAction: (
            telegramMessageId: number,
            options?: Record<string, unknown>,
          ) => Promise<Record<string, unknown>>;
        };
        await tradingModule.confirmSignalAction(targetTelegramMessageId, {
          confirmedBy: `${buildActorLabel(params)}:force`,
          ignoreConcurrentLimit: true,
        });
      }
      const executionResult = await executionModule.executeConfirmedTradingAction(snapshot, {
        forceUnsafe: true
      });
      const extra =
        executionResult?.mode === "executed"
          ? `\nБиржа: действие выполнено (${String(executionResult.action ?? "done")})`
          : executionResult?.mode === "not_supported"
            ? `\nБиржа: не выполнено (${String(executionResult.reason ?? "not_supported")})`
            : "";
      const isNewSignal = String(snapshot.signal_kind ?? "") === "NEW_SIGNAL";
      const chartLink = isNewSignal
        ? await tvLinkModule.buildSignalChartLinkSafe(targetTelegramMessageId).catch(() => null)
        : null;
      const bybitSymbol = String(snapshot.latest_parsed_signal?.symbol ?? snapshot.symbol ?? "");
      const bybitLink = bybitSymbol && bybitSymbol !== "UNKNOWN"
        ? tvLinkModule.buildBybitTradeUrl(bybitSymbol)
        : null;
      const linkParts = [
        buildShortLinkHtml("📊 Посмотреть на TradingView", chartLink),
        buildShortLinkHtml("🔗 Открыть на ByBit", bybitLink)
      ].filter(Boolean) as string[];
      const linksBlock = linkParts.length > 0 ? `\n${linkParts.join(" · ")}` : "";
      return {
        shouldContinue: false,
        reply: {
          text:
            `🔥 Принудительное исполнение: #${targetTelegramMessageId}` +
            extra +
            linksBlock,
        },
      };
    }

    if (parsed.action === "set_size" || parsed.action === "set_lev") {
      const storeModule = (await import(STORE_MODULE_URL)) as {
        readSignalSnapshot: (telegramMessageId: number) => Promise<Record<string, unknown> | null>;
        updateSignalOwnerReviewState: (
          telegramMessageId: number,
          review: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
      const snapshot = await storeModule.readSignalSnapshot(parsed.telegramMessageId);
      if (!snapshot) {
        throw new Error(`signal snapshot not found for telegram_message_id=${parsed.telegramMessageId}`);
      }
      if (String(snapshot.signal_kind ?? "") !== "NEW_SIGNAL") {
        return {
          shouldContinue: false,
          reply: { text: "Эти настройки доступны только для нового входа." },
        };
      }
      if (parsed.action === "set_lev" && String(snapshot.trader_id ?? "") === "trader#B") {
        return {
          shouldContinue: false,
          reply: { text: "Для spot-сигналов плечо не используется." },
        };
      }
      const reviewUpdate: Record<string, unknown> = {
        owner_review_by: buildActorLabel(params),
        updated_at: new Date().toISOString(),
        awaiting_owner_input_type: parsed.action === "set_size" ? "position_usdt" : "leverage"
      };

      await storeModule.updateSignalOwnerReviewState(
        parsed.telegramMessageId,
        reviewUpdate,
      );
      return {
        shouldContinue: false,
        reply: {
          text: await buildCurrentInputPrompt(
            snapshot,
            parsed.action === "set_size" ? "position_usdt" : "leverage"
          ),
        },
      };
    }

    if (parsed.action === "reject" || parsed.action === "skip") {
      const targetTelegramMessageId =
        parsed.telegramMessageId ??
        await resolveRecentTradingMessageId(parsed.action);
      if (!targetTelegramMessageId) {
        return {
          shouldContinue: false,
          reply: {
            text: "Не вижу свежей торговой карточки, к которой можно применить пропуск.",
          },
        };
      }
      const storeModule = (await import(STORE_MODULE_URL)) as {
        readSignalSnapshot: (telegramMessageId: number) => Promise<Record<string, unknown> | null>;
        updateSignalLifecycleState: (
          telegramMessageId: number,
          update: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
      const snapshot = await storeModule.readSignalSnapshot(targetTelegramMessageId);
      if (!snapshot) {
        throw new Error(`signal snapshot not found for telegram_message_id=${targetTelegramMessageId}`);
      }
      if (String(snapshot.actionability_status ?? "") !== "pending_confirmation") {
        await storeModule.updateSignalLifecycleState(targetTelegramMessageId, {
          lifecycle_status: snapshot.lifecycle_status ?? "observed",
          linked_position_id: snapshot.linked_position_id ?? null,
          actionability_status: "blocked",
          position_state: snapshot.position_state ?? "not_opened",
          decision_action: "IGNORE",
          decision_reason: "owner_skipped_message",
          updated_at: new Date().toISOString()
        });
        return {
          shouldContinue: false,
          reply: {
            text: `⏭️ Пропускаем: #${targetTelegramMessageId}`,
          },
        };
      }
    }

    const targetTelegramMessageId =
      parsed.telegramMessageId ??
      await resolveRecentTradingMessageId(parsed.action);
    if (!targetTelegramMessageId) {
      return {
        shouldContinue: false,
        reply: {
          text: "Не вижу свежей торговой карточки, к которой можно применить пропуск.",
        },
      };
    }
    const result = await tradingModule.rejectSignalAction(targetTelegramMessageId, {
      rejectedBy: buildActorLabel(params),
    });
    return {
      shouldContinue: false,
      reply: {
        text: `🛑 Отклонено: #${targetTelegramMessageId}${result.status ? `\nStatus: ${result.status}` : ""}`,
      },
    };
  } catch (error) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Не удалось исполнить действие: ${humanizeExecutionFailureMessage(error instanceof Error ? error.message : String(error))}`,
      },
    };
  }
};

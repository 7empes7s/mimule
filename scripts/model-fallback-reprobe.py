#!/usr/bin/env python3
"""
model-fallback-reprobe — keep the editorial fallback chains healthy automatically.

Probes every cloud model exposed by LiteLLM (:4000), prunes dead/renamed IDs, promotes
recovered ones, and rebuilds the editorial fallback chains in BOTH routing layers:
  - LiteLLM router_settings.fallbacks  (/etc/litellm/config.yaml)  — global / autopipeline
  - control-surface gateway            (/etc/tib-builder/gateway.yaml) — editorial-heavy/-fast

Ordering follows the operator's provider priority:
  zen -> opencode-go -> groq -> openrouter -> github -> cloudflare -> nvidia -> cerebras
  -> gemini/premium -> zen-claude (last resort).

Design notes:
  * KEEP a model if it answers 200/429/500/503 (live or transiently limited — will recover).
    PRUNE terminal 400/401/402/403/404/410 immediately. Incumbent 000/408 timeout-like
    failures require three consecutive observations before pruning.
  * A model outside the pool requires three consecutive routable observations before promotion;
    200/429/500/503 are one category, so provider throttling does not reset recovery evidence.
  * Ordering is by provider only (NOT by live-vs-429), so a 200<->429 flap does NOT churn the
    chain; only membership changes (a model dies or recovers) trigger an apply + LiteLLM restart.
  * Idempotent: if the rendered lines equal what's already on disk, nothing is written/restarted.
  * Safety: if fewer than MIN_LIVE models answer 200, ABORT (likely LiteLLM down or a total
    provider outage) — never destroy working chains on a bad probe. YAML is validated (parse +
    no dangling references) before anything is written; a timestamped backup is kept.
  * The control-surface gateway re-reads its yaml every 60s (no restart needed). Local GPU models
    are never touched here (the GPU is off by operator decision; see project_gpu_off_free_cloud).

Usage:  model-fallback-reprobe.py [--dry-run] [--verbose] [--ledger-report]
"""
import concurrent.futures as cf
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

LITELLM_CONFIG = "/etc/litellm/config.yaml"
LITELLM_ENV = "/etc/litellm/litellm.env"
GATEWAY_CONFIG = "/etc/tib-builder/gateway.yaml"
LITELLM_URL = "http://127.0.0.1:4000/v1/chat/completions"
STATE_FILE = "/var/lib/mimule/model-fallback-reprobe.json"
LEDGER_DB = "/var/lib/control-surface/dashboard.sqlite"
BACKUP_DIR = "/etc/litellm"
BACKUP_KEEP = 6

PROBE_TIMEOUT = 30          # seconds per model
PROBE_WORKERS = 10          # parallel probes (modest — avoid self-inflicted rate limiting)
MIN_LIVE = 6                # abort rebuild if fewer than this answer 200 (bad probe / outage)
KEEP_CODES = {200, 429, 500, 503}   # 200 live, 429 rate-limited (resets), 5xx transient
DEAD_CODES = {400, 401, 402, 403, 404, 410}  # terminal missing/auth/gone responses
TIMEOUT_CODES = {0, 408}     # local timeout/connection failure or upstream request timeout
TIMEOUT_STREAK = 3           # consecutive timeout-like probes before pruning an incumbent
PROMOTE_STREAK = 3           # consecutive routable probes before promoting a non-incumbent
LEDGER_WINDOW_DAYS = 7       # production evidence window for route quarantine
LEDGER_DEAD_MIN_CALLS = 20   # do not prune on a small or exploratory sample
LEDGER_DEGRADED_MIN_CALLS = 5
LEDGER_POLICY_VERSION = 1
LEDGER_MODE = "shadow"       # observe three scheduled cycles before enabling prune enforcement
LEDGER_TENANT_ID = os.environ.get("MIMULE_LEDGER_TENANT_ID", "mimule")
LEDGER_IGNORED_BACKENDS = {"cli-direct"}
# Destructive routing decisions use an allowlist. Historical unknown includes
# pre-infra-retry restart casualties; server_error is unsafe until the broad
# classifyError("5") fallback is repaired in the Control Surface.
LEDGER_ATTRIBUTABLE_ERROR_CLASSES = {"rate_limit", "auth", "timeout", "unavailable"}
LEDGER_EARNED_MIN_CALLS = 50
LEDGER_EARNED_MIN_RATE = 0.60
LEDGER_RATE_LIMIT_MIN_SPAN_HOURS = 48

LITELLM_TARGETS = ["editorial-heavy", "editorial-fast", "editorial-cloud-heavy",
                   "editorial-cloud-fast", "github-gpt41"]
GATEWAY_TARGETS = ["editorial-heavy", "editorial-fast"]

# Sub-8B / non-chat / role-excluded models kept OUT of editorial chains (flagship quality).
WEAK = ['phi-2', 'llama-2-7b', 'mistral-7b-instruct-v0-1', 'mistral-7b-instruct-v0-2', 'gemma-7b',
        'hermes-2-pro-mistral-7b', 'granite-4-0-h-micro', '-gemma-3-4b', '-3n-e4b', 'llama-3-2-1b',
        'llama-3-2-3b', 'laguna-xs', 'ling-2-6-flash', 'prompt-guard', 'qianfan-ocr', 'allam-2-7b',
        'safeguard', 'liquid-lfm', 'nemotron-nano-9b', 'nemotron-nano-12b', 'nemotron-3-nano',
        'baidu-cobuddy', 'elephant-alpha', 'owl-alpha', 'openrouter-free', 'dolphin-mistral',
        'tencent-hy3', 'sea-lion', 'poolside-laguna-m']
# Not probed / never chained: local (GPU off) + specials.
LOCAL_OR_SPECIAL = {'editorial-heavy', 'editorial-fast', 'routing-cheap', 'mimule-chat',
                    'mimule-chat-gemma', 'mimule-chat-qwen', 'openrouter/mimule-chat',
                    'coding-heavy', 'coding-fast', 'coding-cloud', 'web-research',
                    'editorial-cloud-heavy', 'editorial-cloud-fast'}

DRY = "--dry-run" in sys.argv
VERBOSE = "--verbose" in sys.argv or DRY
LEDGER_REPORT = "--ledger-report" in sys.argv


def log(msg):
    print(f"[reprobe] {msg}", flush=True)


def load_master_key():
    with open(LITELLM_ENV) as f:
        for line in f:
            if line.startswith("LITELLM_MASTER_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("[reprobe] LITELLM_MASTER_KEY not found")


def model_names():
    names = []
    with open(LITELLM_CONFIG) as f:
        for line in f:
            m = re.match(r'\s*-\s*model_name:\s*(\S+)', line)
            if m:
                names.append(m.group(1).strip().strip('"').strip("'"))
    return names


def is_weak(m):
    return any(w in m for w in WEAK)


def is_premium(m):
    return (m.startswith('github-') or m == 'gpt5-mini' or m.startswith('gemini-')
            or m.startswith('zen-gpt-5') or m.startswith('zen-claude-') or m.startswith('zen-gemini-')
            or m.endswith('-paid')
            or m in {'zen-glm-5', 'zen-glm-5-1', 'zen-kimi-k2-5', 'zen-kimi-k2-6', 'zen-minimax',
                     'zen-minimax-m2-7', 'zen-qwen3-5-plus', 'zen-qwen3-6-plus'})


def prov_rank(m):
    for pre, r in [('zen-', 1), ('coding-go', 2), ('groq-', 3), ('openrouter-', 4),
                   ('github-', 5), ('cf-', 6), ('nvidia-', 7), ('cerebras-', 8)]:
        if m.startswith(pre):
            return r
    return 6


def prem_rank(m):
    if m.startswith('gemini-') or m.startswith('zen-gemini-'):
        return 1
    if m.startswith('github-'):
        return 2
    if m == 'gpt5-mini' or m.startswith('zen-gpt-5'):
        return 3
    if m.endswith('-paid') or m.startswith('cerebras'):
        return 4
    if m.startswith('zen-claude-'):      # claude LAST resort
        return 9
    return 5


def probe(model, key):
    # "fallbacks": [] disables the group's router fallbacks for this request only,
    # so the response carries the group's OWN true status instead of a 200 served by
    # a fallback backend (2026-07-02: cerebras removed qwen-3-235b, yet probes kept
    # seeing fallback-masked 200s and re-promoting the dead group). Verified: dead
    # cerebras -> 404, quota-exhausted github -> 429, live groq -> 200.
    body = json.dumps({"model": model,
                       "messages": [{"role": "user", "content": "reply OK"}],
                       "max_tokens": 4,
                       "fallbacks": []}).encode()
    req = urllib.request.Request(LITELLM_URL, data=body,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception:
        code = 0                   # timeout / connection / hang
    return model, code, int(round((time.monotonic() - started) * 1000))


def classify_probe_code(code):
    """Map a raw probe result to the category used for membership hysteresis."""
    if code in KEEP_CODES:
        return "routable"
    if code in DEAD_CODES:
        return "dead"
    if code in TIMEOUT_CODES:
        return "timeout"
    return "other"


def _valid_history_record(record):
    return (isinstance(record, dict)
            and isinstance(record.get("code"), int) and not isinstance(record.get("code"), bool)
            and isinstance(record.get("streak"), int) and not isinstance(record.get("streak"), bool)
            and record.get("streak") >= 1
            and isinstance(record.get("since"), int) and not isinstance(record.get("since"), bool))


def advance_probe_history(previous, code, ms, observed_at):
    """Return a history record whose streak follows categories, not exact HTTP codes."""
    category = classify_probe_code(code)
    if _valid_history_record(previous) and classify_probe_code(previous["code"]) == category:
        streak = previous["streak"] + 1
        since = previous["since"]
    else:
        streak = 1
        since = observed_at
    return {"code": code, "category": category, "streak": streak, "since": since, "ms": ms}


def resolve_pool_observation(model, code, ms, prev_pool, prev_history, observed_at,
                             has_pool_baseline=True):
    """Return (history, effective pool code, decision) for one probe observation.

    Terminal dead responses are always immediate. Timeout-like responses get incumbent-only
    pruning hysteresis. Routable non-incumbents get symmetric promotion hysteresis. When no
    previous pool baseline exists, routable observations bootstrap immediately so a missing or
    corrupt state file cannot force the MIN_LIVE guard into a permanent empty-pool loop.
    """
    previous_record = prev_history.get(model)
    has_valid_history = _valid_history_record(previous_record)
    record = advance_probe_history(previous_record, code, ms, observed_at)
    category = record["category"]
    incumbent = model in prev_pool

    if category == "dead":
        return record, code, "pruned-dead"

    if incumbent:
        if category == "timeout":
            # A missing/corrupt history file must never manufacture a hold. This
            # preserves the original fail-safe behavior while valid legacy rows
            # still seed the category-based timeout streak.
            if not has_valid_history:
                return record, code, "pruned-timeout-unseeded"
            if record["streak"] < TIMEOUT_STREAK:
                return record, 200, "held-timeout"
            return record, code, "pruned-timeout"
        return record, code, "kept" if category == "routable" else "excluded"

    if category == "routable":
        if not has_pool_baseline:
            return record, code, "bootstrap-routable"
        if record["streak"] >= PROMOTE_STREAK:
            return record, code, "promoted"
        return record, None, "pending-promotion"

    return record, code, "excluded"


def build_pool(status):
    """Return the ordered list of models whose effective status is routable."""
    cand = [m for m, c in status.items()
            if c in KEEP_CODES and not is_weak(m) and 'codex' not in m
            and m not in LOCAL_OR_SPECIAL]
    free = sorted([m for m in cand if not is_premium(m)], key=lambda m: (prov_rank(m), m))
    prem = sorted([m for m in cand if is_premium(m)], key=lambda m: (prem_rank(m), m))
    full, seen = [], set()
    for m in free + prem:
        if m not in seen:
            seen.add(m)
            full.append(m)
    return full


def _empty_ledger_decisions(now_ms):
    as_of = datetime.fromtimestamp(now_ms / 1000, timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "policy_version": LEDGER_POLICY_VERSION,
        "mode": LEDGER_MODE,
        "enforced": False,
        "as_of": as_of,
        "models": {},
        "would_prune": [],
        "would_quarantine": [],
        "would_limit_tail": [],
    }


def ledger_route_decisions(db_path=LEDGER_DB, now_ms=None):
    """Return guarded R2a route decisions from trusted production evidence.

    The Control Surface ledger is opened read-only. CLI-direct traffic is outside the
    fallback router. Only successes and an explicit model-attributable failure allowlist
    count toward the recent sample or earned-history shield. The caller decides how to fail
    open if the ledger is absent or unreadable.

    Unearned zero-success routes become prune candidates. Earned routes are reported as a
    shadow quarantine only; R2b must define their recovery/canary exit before enforcement.
    """
    effective_now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    cutoff_ms = effective_now_ms - LEDGER_WINDOW_DAYS * 86400 * 1000
    backend_placeholders = ", ".join("?" for _ in LEDGER_IGNORED_BACKENDS)
    error_placeholders = ", ".join("?" for _ in LEDGER_ATTRIBUTABLE_ERROR_CLASSES)
    trusted_predicate = f"""
        backend NOT IN ({backend_placeholders})
        AND (tenant_id IS NULL OR tenant_id = ?)
        AND resolved_model != ''
        AND (error_class IS NULL OR error_class != 'gateway_unreachable')
        AND (success = 1 OR (success = 0 AND error_class IN ({error_placeholders})))
    """
    recent_query = f"""
        SELECT resolved_model AS model,
               COUNT(*) AS attributable_calls,
               SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
               SUM(CASE WHEN error_class = 'rate_limit' THEN 1 ELSE 0 END) AS rate_limits,
               SUM(CASE WHEN error_class = 'auth' THEN 1 ELSE 0 END) AS auth_failures,
               SUM(CASE WHEN error_class = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
               SUM(CASE WHEN error_class = 'unavailable' THEN 1 ELSE 0 END) AS unavailable_failures,
               MIN(ts) AS first_ts,
               MAX(ts) AS last_ts
        FROM gateway_calls
        WHERE ts >= ?
          AND {trusted_predicate}
        GROUP BY resolved_model
        HAVING COUNT(*) >= ?
           AND SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) = 0
        ORDER BY resolved_model
    """
    all_time_query = f"""
        SELECT resolved_model AS model,
               COUNT(*) AS attributable_calls,
               SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes
        FROM gateway_calls
        WHERE {trusted_predicate}
        GROUP BY resolved_model
    """
    trusted_params = [*sorted(LEDGER_IGNORED_BACKENDS), LEDGER_TENANT_ID,
                      *sorted(LEDGER_ATTRIBUTABLE_ERROR_CLASSES)]
    recent_params = [cutoff_ms, *trusted_params, LEDGER_DEGRADED_MIN_CALLS]
    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = ON")
        connection.execute("PRAGMA busy_timeout = 2000")
        all_time = {
            row["model"]: (row["attributable_calls"], row["successes"])
            for row in connection.execute(all_time_query, trusted_params)
        }
        decisions = _empty_ledger_decisions(effective_now_ms)
        for row in connection.execute(recent_query, recent_params):
            model = row["model"]
            span_hours = (row["last_ts"] - row["first_ts"]) / (3600 * 1000)
            all_calls, all_successes = all_time.get(model, (0, 0))
            all_rate = (all_successes / all_calls) if all_calls else 0.0
            earned = all_calls >= LEDGER_EARNED_MIN_CALLS and all_rate >= LEDGER_EARNED_MIN_RATE
            credential_or_quota = row["auth_failures"] > 0 or row["rate_limits"] > 0
            if earned:
                if row["attributable_calls"] < LEDGER_DEGRADED_MIN_CALLS or not credential_or_quota:
                    continue
                action = "shadow-quarantine"
                state = "degraded"
                target_list = "would_quarantine"
                reason = (
                    f"earned {all_successes}/{all_calls} trusted calls, now 0/{row['attributable_calls']} "
                    f"in {LEDGER_WINDOW_DAYS}d on credential/quota failures; recovery policy not yet enforced"
                )
            else:
                if row["attributable_calls"] < LEDGER_DEAD_MIN_CALLS:
                    continue
                # R2b owns mixed throttling decay. R2a only proposes a rate-limit prune
                # when every trusted failure is 429 and the evidence spans 48 hours.
                if row["rate_limits"] > 0:
                    rate_limit_only = row["rate_limits"] == row["attributable_calls"]
                    if not rate_limit_only or span_hours < LEDGER_RATE_LIMIT_MIN_SPAN_HOURS:
                        continue
                action = "shadow-prune"
                state = "dead"
                target_list = "would_prune"
                reason = (
                    f"never earned a working record; 0/{row['attributable_calls']} trusted calls "
                    f"in {LEDGER_WINDOW_DAYS}d"
                )
            decisions["models"][model] = {
                "state": state,
                "action": action,
                "reason": reason,
                "evidence": {
                    "recentCalls": row["attributable_calls"],
                    "recentSuccesses": row["successes"],
                    "recentFirstTs": row["first_ts"],
                    "recentLastTs": row["last_ts"],
                    "recentSpanHours": round(span_hours, 1),
                    "rateLimitFailures": row["rate_limits"],
                    "authFailures": row["auth_failures"],
                    "timeoutFailures": row["timeouts"],
                    "unavailableFailures": row["unavailable_failures"],
                    "allTimeCalls": all_calls,
                    "allTimeSuccesses": all_successes,
                    "allTimeSuccessRate": round(all_rate, 4),
                },
            }
            decisions[target_list].append(model)
        return decisions
    finally:
        connection.close()


def load_ledger_decisions(db_path=LEDGER_DB, now_ms=None):
    """Fail-open wrapper for the scheduled routing path."""
    effective_now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    try:
        return ledger_route_decisions(db_path, effective_now_ms), None
    except (OSError, sqlite3.Error, ValueError) as error:
        return _empty_ledger_decisions(effective_now_ms), type(error).__name__


def apply_ledger_decisions(pool_status, ledger_decisions):
    """Return a copy with only policy-approved destructive decisions enforced."""
    reconciled = dict(pool_status)
    for model in ledger_decisions.get("would_prune", []):
        if model in reconciled:
            reconciled[model] = None
    return reconciled


def reconcile_pool_with_ledger(pool_status, ledger_decisions, mode=LEDGER_MODE):
    """Apply only explicitly enabled decisions and report the effective prune set."""
    if mode != "enforce-prune":
        return dict(pool_status), set()
    enforced = set(ledger_decisions.get("would_prune", []))
    return apply_ledger_decisions(pool_status, ledger_decisions), enforced


def splice_litellm(pool, dead=frozenset()):
    lines = open(LITELLM_CONFIG).read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.strip() == "fallbacks:")
    end = next(i for i, l in enumerate(lines) if l.strip() == "context_window_fallbacks:")
    for i in range(start + 1, end):
        s = lines[i].strip()
        managed = False
        for tgt in LITELLM_TARGETS:
            if s.startswith(f"- {tgt}:"):
                lst = [m for m in pool if m != tgt]
                lines[i] = f"    - {tgt}: [{', '.join(lst)}]"
                managed = True
        # Unmanaged chains (coding-cloud, per-model fallbacks, ...) keep their curated
        # order but must not waste hops on probe-confirmed-dead models.
        if not managed and dead:
            m2 = re.match(r"^(\s+- )([A-Za-z0-9._-]+)(: \[)([^\]]*)(\].*)$", lines[i])
            if m2:
                kept = [x for x in (t.strip() for t in m2.group(4).split(",")) if x and x not in dead]
                lines[i] = f"{m2.group(1)}{m2.group(2)}{m2.group(3)}{', '.join(kept)}{m2.group(5)}"
    return "\n".join(lines)


def splice_gateway(pool):
    lines = open(GATEWAY_CONFIG).read().split("\n")
    out, cur = [], None
    for l in lines:
        s = l.strip()
        if s.startswith("editorial-heavy:"):
            cur = "editorial-heavy"
        elif s.startswith("editorial-fast:"):
            cur = "editorial-fast"
        if s.startswith("fallback_chain:") and cur in GATEWAY_TARGETS:
            lst = [m for m in pool if m != cur]
            out.append(f"    fallback_chain: [{', '.join(lst)}]")
            cur = None
            continue
        out.append(l)
    return "\n".join(out)


def validate_litellm(text):
    import yaml
    d = yaml.safe_load(text)
    names = {m['model_name'] for m in d['model_list']}
    for entry in d['router_settings']['fallbacks']:
        for k, lst in entry.items():
            for m in [k] + lst:
                if m not in names:
                    raise ValueError(f"dangling fallback ref: {m}")
    return True


def backup(path, tag):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dst = f"{path}.bak-reprobe-{stamp}"
    shutil.copy2(path, dst)
    # prune old reprobe backups
    d = os.path.dirname(path)
    olds = sorted([f for f in os.listdir(d) if f.startswith(os.path.basename(path) + ".bak-reprobe-")])
    for f in olds[:-BACKUP_KEEP]:
        try:
            os.remove(os.path.join(d, f))
        except OSError:
            pass
    return dst


def main():
    t0 = time.time()
    observed_at = int(time.time())
    if LEDGER_REPORT:
        ledger_decisions, ledger_error = load_ledger_decisions(now_ms=observed_at * 1000)
        if ledger_error:
            log(f"ERROR: ledger report unavailable ({ledger_error})")
            return 2
        print(json.dumps(ledger_decisions, indent=2, sort_keys=True))
        return 0

    key = load_master_key()
    all_models = model_names()
    to_probe = [m for m in all_models if m not in LOCAL_OR_SPECIAL
                and not re.search(r'prompt-guard|qianfan-ocr', m)]

    # Previous state is best-effort: malformed/missing history seeds fresh records
    # but never grants a hysteresis hold on this cycle.
    prev_state = {}
    try:
        loaded = json.load(open(STATE_FILE))
        if isinstance(loaded, dict):
            prev_state = loaded
    except Exception:
        pass
    prev = prev_state.get("pool", {})
    if isinstance(prev, (list, set)):
        prev_set = {m for m in prev if isinstance(m, str)}
    elif isinstance(prev, dict):
        prev_set = {m for m in prev if isinstance(m, str)}
    else:
        prev_set = set()
    prev_history = prev_state.get("history", {})
    if not isinstance(prev_history, dict):
        prev_history = {}
    has_pool_baseline = bool(prev_set)

    log(f"probing {len(to_probe)} cloud models (timeout {PROBE_TIMEOUT}s, {PROBE_WORKERS} workers){' [DRY-RUN]' if DRY else ''}")

    status = {}
    pool_status = {}
    history = {}
    held = []
    pending = []
    with cf.ThreadPoolExecutor(max_workers=PROBE_WORKERS) as ex:
        for m, code, ms in ex.map(lambda mm: probe(mm, key), to_probe):
            status[m] = code
            record, pool_code, decision = resolve_pool_observation(
                m, code, ms, prev_set, prev_history, observed_at, has_pool_baseline)
            history[m] = record
            pool_status[m] = pool_code
            if decision == "held-timeout":
                held.append(m)
            elif decision == "pending-promotion":
                pending.append(m)

    live = sorted(m for m, c in status.items() if c == 200)
    limited = sorted(m for m, c in status.items() if c == 429)
    dead = sorted(m for m, c in status.items() if c in DEAD_CODES)
    hang = sorted(m for m, c in status.items() if c == 0)
    timed_out = sorted(m for m, c in status.items() if c == 408)
    held.sort()
    pending.sort()
    log(f"live(200)={len(live)}  limited(429)={len(limited)}  dead(terminal)={len(dead)}  "
        f"hang(000)={len(hang)}  timeout(408)={len(timed_out)} ({len(held)} held by hysteresis)")
    if held:
        log("HELD BY HYSTERESIS (kept in pool): " + ", ".join(held))
    if pending:
        log("PENDING PROMOTION (needs 3 routable probes): " + ", ".join(pending))
    if VERBOSE:
        log("LIVE: " + ", ".join(live))

    if len(live) < MIN_LIVE:
        log(f"ABORT: only {len(live)} live (< {MIN_LIVE}) — probable outage / LiteLLM down; leaving chains unchanged")
        return 2

    # Production outcomes outrank a synthetic probe. The ledger read is deliberately
    # fail-open: an unavailable observability database must never destroy a working pool.
    ledger_decisions, ledger_error = load_ledger_decisions(now_ms=observed_at * 1000)
    if ledger_error:
        log(f"WARN: ledger reconciliation unavailable ({ledger_error}); using probe evidence only")
    if ledger_decisions["would_prune"]:
        detail = ", ".join(
            f"{model} (0/{ledger_decisions['models'][model]['evidence']['recentCalls']} in {LEDGER_WINDOW_DAYS}d)"
            for model in ledger_decisions["would_prune"]
        )
        log("LEDGER SHADOW PRUNE (not enforced): " + detail)
    if ledger_decisions["would_quarantine"]:
        log("LEDGER SHADOW QUARANTINE (not enforced): " + ", ".join(ledger_decisions["would_quarantine"]))

    # R2a starts in shadow mode. Once three scheduled cycles agree on the exact
    # decision set, a separate reviewed slice can enable prune-only enforcement.
    pool_status, enforced_ledger_prunes = reconcile_pool_with_ledger(
        pool_status, ledger_decisions, LEDGER_MODE)
    pool = build_pool(pool_status)
    if len(pool) < MIN_LIVE:
        log(f"ABORT: rebuilt pool has {len(pool)} models (< {MIN_LIVE}); leaving chains unchanged")
        return 2

    new_ll = splice_litellm(pool, dead=set(dead) | enforced_ledger_prunes)
    new_gw = splice_gateway(pool)
    validate_litellm(new_ll)              # raises on bad YAML / dangling ref

    cur_ll = open(LITELLM_CONFIG).read()
    cur_gw = open(GATEWAY_CONFIG).read()
    ll_changed = new_ll.rstrip("\n") != cur_ll.rstrip("\n")
    gw_changed = new_gw.rstrip("\n") != cur_gw.rstrip("\n")

    # membership diff vs last run (for the log / state)
    promoted = sorted(set(pool) - prev_set)
    pruned = sorted(prev_set - set(pool))

    log(f"pool={len(pool)} models | litellm_changed={ll_changed} gateway_changed={gw_changed}")
    if promoted:
        log(f"PROMOTED (now in chain): {', '.join(promoted)}")
    if pruned:
        log(f"PRUNED (dropped): {', '.join(pruned)}")

    if DRY:
        log("dry-run: no files written, no restart")
        log(f"lead(10): {', '.join(pool[:10])}")
        return 0

    if ll_changed:
        backup(LITELLM_CONFIG, "reprobe")
        open(LITELLM_CONFIG, "w").write(new_ll)
    if gw_changed:
        shutil.copy2(GATEWAY_CONFIG, GATEWAY_CONFIG + ".bak-reprobe")
        open(GATEWAY_CONFIG, "w").write(new_gw)

    # persist state (probe snapshot + current pool) for the next diff
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    json.dump({"ts": int(time.time()), "pool": pool, "live": live, "limited": limited,
               "dead": dead, "hang": hang, "timeout": timed_out,
               "ledger_decisions": ledger_decisions,
               "changed": bool(ll_changed or gw_changed),
               "history": history},
              open(STATE_FILE, "w"), indent=2)

    if ll_changed:
        log("litellm config changed -> restarting litellm.service")
        r = subprocess.run(["systemctl", "restart", "litellm.service"])
        if r.returncode != 0:
            log("WARN: litellm restart returned non-zero")
    else:
        log("no litellm change -> no restart (gateway auto-reloads within 60s)")

    log(f"done in {time.time()-t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

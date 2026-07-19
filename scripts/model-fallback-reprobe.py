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
  * A model outside the pool requires three consecutive HTTP 200 observations before promotion;
    429/500/503 keep incumbents during transient provider trouble but cannot prove recovery.
  * Ordering is by provider only (NOT by live-vs-429), so a 200<->429 flap does NOT churn the
    chain; only membership changes (a model dies or recovers) trigger a transactional config
    apply. This script records whether a LiteLLM restart is required but never performs one.
  * Idempotent: if the rendered bytes equal what's already on disk, nothing is written.
  * Safety: if fewer than MIN_LIVE models answer 200, ABORT (likely LiteLLM down or a total
    provider outage) — never destroy working chains on a bad probe. Both YAML candidates are
    validated (parse + no dangling references) before either target is written; each replace is
    fsynced and a failed pair apply rolls back to the original bytes and metadata.
  * The control-surface gateway re-reads its yaml every 60s (no restart needed). Local GPU models
    are never touched here (the GPU is off by operator decision; see project_gpu_off_free_cloud).

Usage:  model-fallback-reprobe.py [--dry-run] [--verbose] [--ledger-report]
"""
import concurrent.futures as cf
import errno
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import stat as statmod
import sys
import time
import urllib.request
from datetime import datetime, timezone

LITELLM_CONFIG = "/etc/litellm/config.yaml"
LITELLM_ENV = "/etc/litellm/litellm.env"
GATEWAY_CONFIG = "/etc/tib-builder/gateway.yaml"
LITELLM_URL = "http://127.0.0.1:4000/v1/chat/completions"
STATE_FILE = "/var/lib/mimule/model-fallback-reprobe.json"
MODEL_CATALOG_FILE = "/var/lib/mimule/model-catalog.json"
LEDGER_DB = "/var/lib/control-surface/dashboard.sqlite"
BACKUP_DIR = "/etc/litellm"
BACKUP_KEEP = 6
HEALTH_RUN_LOCK = "/run/model-health-check.lock"
MALFORMED_LOCK_GRACE_SECONDS = 30
MODEL_CATALOG_SCHEMA_VERSION = 1
MODEL_CATALOG_POLICY_VERSION = "bounded-provider-inventory-v1"
MODEL_CATALOG_MAX_BYTES = 4 * 1024 * 1024
MODEL_CATALOG_TTL_MS = 13 * 60 * 60 * 1000
MODEL_CATALOG_FUTURE_SKEW_MS = 5 * 60 * 1000
MODEL_POLICY_FILE = "/etc/mimule/model-policy.json"
MODEL_POLICY_MAX_BYTES = 1024 * 1024
MAX_DYNAMIC_CATALOG_ROUTES = 10_000
MAX_REPROBE_STATE_BYTES = 4 * 1024 * 1024
MAX_CONFIG_BYTES = 8 * 1024 * 1024
SAFE_CATALOG_NAME = re.compile(r"^[A-Za-z0-9@][A-Za-z0-9._/@:+-]{0,511}$")
OPERATOR_APPROVAL = re.compile(r"^operator:[A-Za-z0-9._@+-]{1,96}$")

PROBE_TIMEOUT = 30          # seconds per model
PROBE_WORKERS = 10          # parallel probes (modest — avoid self-inflicted rate limiting)
MIN_LIVE = 6                # abort rebuild if fewer than this answer 200 (bad probe / outage)
PROBE_CONTRACT_FAILED = 460  # local sentinel: HTTP 200 without the exact substantive payload
PROBE_MAX_RESPONSE_BYTES = 256 * 1024
KEEP_CODES = {200, 429, 500, 503}   # 200 substantive, 429 rate-limited, 5xx transient
DEAD_CODES = {400, 401, 402, 403, 404, 410, PROBE_CONTRACT_FAILED}
TIMEOUT_CODES = {0, 408}     # local timeout/connection failure or upstream request timeout
TIMEOUT_STREAK = 3           # consecutive timeout-like probes before pruning an incumbent
PROMOTE_STREAK = 3           # consecutive HTTP 200 probes before promoting a non-incumbent
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

DYNAMIC_PROVIDER_ADMISSION = {
    "aihubmix": {"pricingEvidence": "verified-zero-price", "pricingTier": "free-rate-limited",
                 "rotationClass": "free-first", "autoPromotionPolicy": "automatic-verified-zero"},
    "openrouter": {"pricingEvidence": "verified-zero-price", "pricingTier": "free-rate-limited",
                   "rotationClass": "free-first", "autoPromotionPolicy": "automatic-verified-zero"},
    "github": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
               "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "groq": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
             "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "cloudflare": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
                   "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "cerebras": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
                 "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "nvidia": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
               "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "gemini": {"pricingEvidence": "included-quota-unverified", "pricingTier": "unverified",
               "rotationClass": "manual-approval-required", "autoPromotionPolicy": "manual-approval-required"},
    "zen": {"pricingEvidence": "subscription-policy", "pricingTier": "subscription",
            "rotationClass": "subscription", "autoPromotionPolicy": "operator-approved-subscription"},
    "alibaba": {"pricingEvidence": "subscription-policy", "pricingTier": "subscription",
                "rotationClass": "subscription", "autoPromotionPolicy": "operator-approved-subscription"},
    "opencode": {"pricingEvidence": "subscription-policy", "pricingTier": "subscription",
                 "rotationClass": "subscription", "autoPromotionPolicy": "operator-approved-subscription"},
}

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


def _process_start_ticks(pid):
    try:
        with open(f"/proc/{pid}/stat") as proc_stat:
            text = proc_stat.read(4096)
        close_paren = text.rfind(")")
        if close_paren < 0:
            return None
        fields = text[close_paren + 1:].strip().split()
        ticks = fields[19]
        return ticks if ticks.isdigit() else None
    except (OSError, IndexError):
        return None


def acquire_health_run_lock(path=HEALTH_RUN_LOCK):
    """Acquire the same PID/start-tick lock used by model-health-check.mjs."""
    own_ticks = _process_start_ticks(os.getpid())
    if own_ticks is None:
        raise RuntimeError("cannot identify reprobe process")
    stamp = f"{os.getpid()} {own_ticks}\n".encode()

    for _attempt in range(2):
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except OSError as error:
            if error.errno != errno.EEXIST:
                raise
            try:
                read_fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    stat_before = os.fstat(read_fd)
                    raw = os.read(read_fd, 128)
                finally:
                    os.close(read_fd)
                if not statmod.S_ISREG(stat_before.st_mode):
                    return None
                match = re.fullmatch(rb"(\d+) (\d+)\n", raw)
                if match:
                    active = _process_start_ticks(int(match.group(1))) == match.group(2).decode()
                else:
                    active = time.time() - stat_before.st_mtime <= MALFORMED_LOCK_GRACE_SECONDS
                if active:
                    return None
                stat_now = os.lstat(path)
                if (stat_before.st_dev, stat_before.st_ino) != (stat_now.st_dev, stat_now.st_ino):
                    return None
                os.unlink(path)
                continue
            except OSError:
                return None
        else:
            try:
                os.write(fd, stamp)
                os.fchmod(fd, 0o600)
                os.fsync(fd)
                identity = os.fstat(fd)
            finally:
                os.close(fd)

            def release():
                try:
                    current = os.lstat(path)
                    if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino) and not os.path.islink(path):
                        os.unlink(path)
                except OSError:
                    pass

            return release
    return None


def log(msg):
    print(f"[reprobe] {msg}", flush=True)


def _read_private_bounded_json(path, max_bytes):
    """Read one private regular JSON file without following links or trusting its size."""
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not statmod.S_ISREG(info.st_mode):
            raise ValueError("not a regular file")
        if info.st_uid != os.geteuid() or statmod.S_IMODE(info.st_mode) & 0o077:
            raise PermissionError("artifact is not private to its owner")
        if info.st_size <= 0 or info.st_size > max_bytes:
            raise ValueError("artifact size outside bounds")
        chunks = []
        remaining = info.st_size
        while remaining:
            chunk = os.read(fd, min(remaining, 64 * 1024))
            if not chunk:
                raise ValueError("artifact was truncated while reading")
            chunks.append(chunk)
            remaining -= len(chunk)
        # A writer must replace atomically. Reject an in-place append racing this read.
        if os.read(fd, 1):
            raise ValueError("artifact changed while reading")
        return json.loads(b"".join(chunks).decode("utf-8"))
    finally:
        os.close(fd)


def _fresh_catalog_timestamp(value, now_ms):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and now_ms - MODEL_CATALOG_TTL_MS <= value
            and value <= now_ms + MODEL_CATALOG_FUTURE_SKEW_MS)


def _catalog_dynamic_rows(document):
    routes = document.get("dynamicRoutes")
    if isinstance(routes, dict):
        if len(routes) > MAX_DYNAMIC_CATALOG_ROUTES:
            raise ValueError("too many dynamic catalog routes")
        for logical_name, row in routes.items():
            if isinstance(row, dict):
                yield logical_name, row
        return
    if isinstance(routes, list):
        if len(routes) > MAX_DYNAMIC_CATALOG_ROUTES:
            raise ValueError("too many dynamic catalog routes")
        for row in routes:
            if isinstance(row, dict):
                yield row.get("logicalName"), row


def load_dynamic_catalog_evidence(path=MODEL_CATALOG_FILE, now_ms=None):
    """Return bounded, policy-validated evidence for explicit dynamic routes."""
    effective_now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    try:
        document = _read_private_bounded_json(path, MODEL_CATALOG_MAX_BYTES)
        if not isinstance(document, dict):
            return {}
        if document.get("schemaVersion") != MODEL_CATALOG_SCHEMA_VERSION:
            return {}
        if document.get("policyVersion") != MODEL_CATALOG_POLICY_VERSION:
            return {}
        providers = document.get("providers")
        if not isinstance(providers, dict):
            return {}
        artifact_fresh = _fresh_catalog_timestamp(document.get("generatedAt"), effective_now_ms)
        evidence = {}
        for route_key, row in _catalog_dynamic_rows(document):
            logical_name = row.get("logicalName", route_key)
            provider = row.get("provider")
            model_id = row.get("modelId")
            if (row.get("provenance") != "catalog-auto-v1"
                    or not isinstance(logical_name, str)
                    or not SAFE_CATALOG_NAME.fullmatch(logical_name)
                    or not isinstance(provider, str)
                    or not SAFE_CATALOG_NAME.fullmatch(provider)
                    or not isinstance(model_id, str)
                    or not SAFE_CATALOG_NAME.fullmatch(model_id)):
                continue
            admission = DYNAMIC_PROVIDER_ADMISSION.get(provider)
            policy_matches = (isinstance(admission, dict)
                              and all(row.get(key) == value for key, value in admission.items()))
            # A duplicate logical name with conflicting metadata is never authoritative.
            if logical_name in evidence:
                evidence[logical_name]["eligibility"] = "unknown"
                continue
            route_evidence = {
                "provider": provider,
                "model_id": model_id,
                "eligibility": "unknown",
                "rotation_class": admission.get("rotationClass") if policy_matches else None,
                "auto_promotion_policy": admission.get("autoPromotionPolicy") if policy_matches else None,
                "policy_valid": policy_matches,
            }
            evidence[logical_name] = route_evidence
            if not policy_matches:
                continue
            inventory = providers.get(provider)
            complete = (artifact_fresh and isinstance(inventory, dict)
                        and inventory.get("complete") is True
                        and row.get("catalogComplete") is True
                        and _fresh_catalog_timestamp(inventory.get("lastSuccessfulAt"), effective_now_ms))
            if not complete:
                continue
            eligible_ids = inventory.get("eligibleIds")
            if not isinstance(eligible_ids, list) or len(eligible_ids) > MAX_DYNAMIC_CATALOG_ROUTES:
                continue
            eligible_set = {
                item for item in eligible_ids
                if isinstance(item, str) and SAFE_CATALOG_NAME.fullmatch(item)
            }
            # A still-visible model that newly fails price/type policy must be
            # quarantined immediately. The inventory's one-cycle carry-forward
            # is only for a model absent from an otherwise authoritative scan.
            raw_ids = inventory.get("rawIds")
            observed_eligible_ids = inventory.get("observedEligibleIds")
            if (isinstance(raw_ids, list)
                    and len(raw_ids) <= MAX_DYNAMIC_CATALOG_ROUTES
                    and isinstance(observed_eligible_ids, list)
                    and len(observed_eligible_ids) <= MAX_DYNAMIC_CATALOG_ROUTES
                    and model_id in raw_ids):
                eligible_set = {
                    item for item in observed_eligible_ids
                    if isinstance(item, str) and SAFE_CATALOG_NAME.fullmatch(item)
                }
            derived = "eligible" if model_id in eligible_set else "ineligible"
            declared = row.get("eligibility")
            route_evidence["eligibility"] = derived if declared == derived else "unknown"
        return evidence
    except (OSError, ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return {}


def load_dynamic_catalog_eligibility(path=MODEL_CATALOG_FILE, now_ms=None):
    """Compatibility view containing only each explicit dynamic route's state."""
    return {
        name: row.get("eligibility", "unknown")
        for name, row in load_dynamic_catalog_evidence(path, now_ms).items()
    }


def load_explicit_billing_approvals(path=MODEL_POLICY_FILE):
    """Load only distinct operator billing approvals; forceAllow is irrelevant."""
    try:
        document = _read_private_bounded_json(path, MODEL_POLICY_MAX_BYTES)
        models = document.get("models") if isinstance(document, dict) else None
        if not isinstance(models, dict) or len(models) > MAX_DYNAMIC_CATALOG_ROUTES:
            return set()
        approved = set()
        for logical_name, row in models.items():
            if (isinstance(logical_name, str) and SAFE_CATALOG_NAME.fullmatch(logical_name)
                    and isinstance(row, dict)
                    and row.get("billingApproved") is True
                    and isinstance(row.get("billingApprovalProvenance"), str)
                    and OPERATOR_APPROVAL.fullmatch(row["billingApprovalProvenance"])):
                approved.add(logical_name)
        return approved
    except (OSError, ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return set()


def effective_dynamic_eligibility(evidence, billing_approvals=frozenset()):
    result = {}
    for logical_name, row in evidence.items():
        state = row.get("eligibility", "unknown")
        if (state == "eligible"
                and row.get("auto_promotion_policy") == "manual-approval-required"
                and logical_name not in billing_approvals):
            state = "billing-approval-required"
        result[logical_name] = state
    return result


def apply_dynamic_catalog_eligibility(model, record, pool_code, decision,
                                      prev_pool, eligibility):
    """Apply the additive catalog gate to one already-resolved probe observation."""
    catalog_state = eligibility.get(model)
    if catalog_state not in {"eligible", "ineligible", "unknown", "billing-approval-required"}:
        return record, pool_code, decision

    gated_record = dict(record)
    gated_record["catalog_eligibility"] = catalog_state
    if catalog_state == "eligible":
        return gated_record, pool_code, decision
    if catalog_state == "ineligible":
        gated_record["success_streak"] = 0
        return gated_record, None, "pruned-catalog-ineligible"
    if catalog_state == "billing-approval-required":
        gated_record["success_streak"] = 0
        return gated_record, None, "pending-billing-approval"
    if model in prev_pool:
        # Unknown catalog evidence must not independently evict an incumbent. A
        # real terminal/timeout probe decision remains authoritative, however.
        return gated_record, pool_code, decision
    gated_record["success_streak"] = 0
    return gated_record, None, "pending-catalog-eligibility"


def plan_reprobe_targets(all_models, eligibility, prev_pool):
    """Exclude non-actionable dynamic routes before opening any probe request."""
    targets = []
    for model in all_models:
        if (model in LOCAL_OR_SPECIAL
                or re.search(r'prompt-guard|qianfan-ocr', model)):
            continue
        state = eligibility.get(model)
        if state in {"ineligible", "billing-approval-required"}:
            continue
        if state == "unknown" and model not in prev_pool:
            continue
        targets.append(model)
    return targets


def write_json_atomic_0600(path, document, max_bytes=MAX_REPROBE_STATE_BYTES):
    """Serialize, fsync, and atomically replace a private state artifact."""
    serialized = (json.dumps(document, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if not serialized or len(serialized) > max_bytes:
        raise ValueError("state artifact size outside bounds")
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, mode=0o700, exist_ok=True)
    temporary = os.path.join(
        directory,
        f".{os.path.basename(path)}.{os.getpid()}.{secrets.token_hex(8)}.tmp",
    )
    flags = (os.O_WRONLY | os.O_CREAT | os.O_EXCL
             | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0))
    fd = None
    try:
        fd = os.open(temporary, flags, 0o600)
        offset = 0
        while offset < len(serialized):
            written = os.write(fd, serialized[offset:])
            if written <= 0:
                raise OSError("short state write")
            offset += written
        os.fchmod(fd, 0o600)
        if os.geteuid() == 0:
            os.fchown(fd, 0, 0)
        os.fsync(fd)
        os.close(fd)
        fd = None
        os.replace(temporary, path)
        directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
        directory_fd = os.open(directory, directory_flags)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


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


def is_substantive_probe_body(body):
    """Accept only an exact assistant {status: ok} response from a bounded body."""
    try:
        if isinstance(body, bytes):
            body = body.decode("utf-8")
        document = json.loads(body)
        choices = document.get("choices")
        if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
            return False
        choice = choices[0]
        message = choice.get("message")
        content = message.get("content") if isinstance(message, dict) else choice.get("text")
        if isinstance(content, str):
            content = json.loads(content.strip())
        return isinstance(content, dict) and content == {"status": "ok"}
    except (UnicodeError, ValueError, TypeError, AttributeError):
        return False


def probe(model, key):
    # "fallbacks": [] disables the group's router fallbacks for this request only,
    # so the response carries the group's OWN true status instead of a 200 served by
    # a fallback backend (2026-07-02: cerebras removed qwen-3-235b, yet probes kept
    # seeing fallback-masked 200s and re-promoting the dead group). Verified: dead
    # cerebras -> 404, quota-exhausted github -> 429, live groq -> 200.
    body = json.dumps({"model": model,
                       "messages": [{"role": "user", "content":
                                     'Reply with exactly this JSON object on one line, nothing else: {"status":"ok"}'}],
                       "max_tokens": 40,
                       "fallbacks": []}).encode()
    req = urllib.request.Request(LITELLM_URL, data=body,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as r:
            code = r.status
            if code == 200:
                response_body = r.read(PROBE_MAX_RESPONSE_BYTES + 1)
                if (len(response_body) > PROBE_MAX_RESPONSE_BYTES
                        or not is_substantive_probe_body(response_body)):
                    code = PROBE_CONTRACT_FAILED
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
    """Return category history plus a separate consecutive-200 recovery streak."""
    category = classify_probe_code(code)
    if _valid_history_record(previous) and classify_probe_code(previous["code"]) == category:
        streak = previous["streak"] + 1
        since = previous["since"]
    else:
        streak = 1
        since = observed_at
    previous_success_streak = previous.get("success_streak", 0) if isinstance(previous, dict) else 0
    previous_category_streak = previous.get("streak", 0) if isinstance(previous, dict) else 0
    if (not isinstance(previous_category_streak, int)
            or isinstance(previous_category_streak, bool)
            or previous_category_streak < 0):
        previous_category_streak = 0
    if (not isinstance(previous_success_streak, int)
            or isinstance(previous_success_streak, bool)
            or previous_success_streak < 0
            or previous_success_streak > previous_category_streak
            or (previous_success_streak > 0 and previous.get("code") != 200)):
        previous_success_streak = 0
    continues_success = code == 200 and isinstance(previous, dict) and previous.get("code") == 200
    success_streak = previous_success_streak + 1 if continues_success else (1 if code == 200 else 0)
    return {"code": code, "category": category, "streak": streak,
            "success_streak": success_streak, "since": since, "ms": ms}


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
        if not has_pool_baseline and code == 200:
            return record, code, "bootstrap-routable"
        if record["success_streak"] >= PROMOTE_STREAK:
            return record, code, "promoted"
        return record, None, "pending-promotion"

    return record, code, "excluded"


def build_pool(status, dynamic_rotation_classes=None):
    """Return the ordered list of models whose effective status is routable."""
    dynamic_rotation_classes = dynamic_rotation_classes or {}
    cand = [m for m, c in status.items()
            if c in KEEP_CODES and not is_weak(m) and 'codex' not in m
            and m not in LOCAL_OR_SPECIAL]
    verified_free = sorted(
        [m for m in cand if dynamic_rotation_classes.get(m) == "free-first"],
        key=lambda m: (prov_rank(m), m))
    static_free = sorted(
        [m for m in cand if m not in dynamic_rotation_classes and not is_premium(m)],
        key=lambda m: (prov_rank(m), m))
    subscriptions = sorted(
        [m for m in cand if dynamic_rotation_classes.get(m) == "subscription"],
        key=lambda m: (prem_rank(m), m))
    static_premium = sorted(
        [m for m in cand if m not in dynamic_rotation_classes and is_premium(m)],
        key=lambda m: (prem_rank(m), m))
    approved_unverified = sorted(
        [m for m in cand if dynamic_rotation_classes.get(m) == "manual-approval-required"],
        key=lambda m: (prov_rank(m), m))
    full, seen = [], set()
    for m in verified_free + static_free + subscriptions + static_premium + approved_unverified:
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
    if not isinstance(d, dict) or not isinstance(d.get('model_list'), list):
        raise ValueError("LiteLLM model_list is missing")
    names = set()
    for item in d['model_list']:
        if not isinstance(item, dict) or not isinstance(item.get('model_name'), str):
            raise ValueError("LiteLLM model_list contains an invalid entry")
        names.add(item['model_name'])
    fallbacks = d.get('router_settings', {}).get('fallbacks')
    if not isinstance(fallbacks, list):
        raise ValueError("LiteLLM fallbacks are missing")
    for entry in fallbacks:
        if not isinstance(entry, dict):
            raise ValueError("LiteLLM fallback entry is invalid")
        for k, lst in entry.items():
            if not isinstance(k, str) or not isinstance(lst, list):
                raise ValueError("LiteLLM fallback mapping is invalid")
            for m in [k] + lst:
                if not isinstance(m, str) or m not in names:
                    raise ValueError(f"dangling fallback ref: {m}")
    return names


def validate_gateway(text, litellm_names):
    import yaml
    document = yaml.safe_load(text)
    if not isinstance(document, dict) or not isinstance(document.get("models"), dict):
        raise ValueError("gateway models mapping is missing")
    models = document["models"]
    for target in GATEWAY_TARGETS:
        if not isinstance(models.get(target), dict):
            raise ValueError(f"gateway target missing: {target}")
    for logical_name, row in models.items():
        if not isinstance(logical_name, str) or not isinstance(row, dict):
            raise ValueError("gateway model entry is invalid")
        model = row.get("model")
        if not isinstance(model, str) or model not in litellm_names:
            raise ValueError(f"dangling gateway model ref: {model}")
        fallback_chain = row.get("fallback_chain", [])
        if not isinstance(fallback_chain, list):
            raise ValueError(f"gateway fallback chain is invalid: {logical_name}")
        for fallback in fallback_chain:
            if not isinstance(fallback, str) or fallback not in litellm_names:
                raise ValueError(f"dangling gateway fallback ref: {fallback}")
    return True


def validate_configuration_pair(litellm_text, gateway_text):
    names = validate_litellm(litellm_text)
    validate_gateway(gateway_text, names)
    return names


class ConfigApplyError(RuntimeError):
    """Transactional config apply failed; receipt contains bounded evidence."""

    def __init__(self, message, receipt):
        super().__init__(message)
        self.receipt = receipt


def _sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def _read_config_snapshot(path):
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not statmod.S_ISREG(info.st_mode):
            raise ValueError("config target is not a regular file")
        if info.st_size <= 0 or info.st_size > MAX_CONFIG_BYTES:
            raise ValueError("config size outside bounds")
        chunks = []
        remaining = info.st_size
        while remaining:
            chunk = os.read(fd, min(remaining, 64 * 1024))
            if not chunk:
                raise ValueError("config was truncated while reading")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(fd, 1):
            raise ValueError("config changed while reading")
        return b"".join(chunks), info
    finally:
        os.close(fd)


def _fsync_config_directory(path):
    directory = os.path.dirname(path) or "."
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(directory, flags)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _stage_config_payload(path, payload, metadata, purpose):
    if not payload or len(payload) > MAX_CONFIG_BYTES:
        raise ValueError("candidate config size outside bounds")
    directory = os.path.dirname(path) or "."
    temporary = os.path.join(
        directory,
        f".{os.path.basename(path)}.{os.getpid()}.{purpose}.{secrets.token_hex(8)}.tmp",
    )
    flags = (os.O_WRONLY | os.O_CREAT | os.O_EXCL
             | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0))
    fd = os.open(temporary, flags, statmod.S_IMODE(metadata.st_mode))
    try:
        offset = 0
        while offset < len(payload):
            written = os.write(fd, payload[offset:])
            if written <= 0:
                raise OSError("short config write")
            offset += written
        os.fchmod(fd, statmod.S_IMODE(metadata.st_mode))
        if os.geteuid() == 0:
            os.fchown(fd, metadata.st_uid, metadata.st_gid)
        os.fsync(fd)
    except Exception:
        os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
    else:
        os.close(fd)
    return temporary


def _unlink_if_present(path):
    if not path:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def apply_config_candidates(litellm_path, gateway_path, litellm_candidate,
                            gateway_candidate, create_backups=False):
    """Validate, stage, and transactionally replace the two routing configs."""
    candidate_bytes = {
        "litellm": litellm_candidate.encode("utf-8"),
        "gateway": gateway_candidate.encode("utf-8"),
    }
    paths = {"litellm": litellm_path, "gateway": gateway_path}
    snapshots = {}
    receipt = {
        "schemaVersion": 1,
        "operation": "fallback-config-apply",
        "observedAt": int(time.time() * 1000),
        "validatedBeforeMutation": False,
        "outcome": "pending",
        "restartPerformed": False,
        "rollback": {"attempted": False, "complete": None},
        "files": {},
    }
    try:
        for name, path in paths.items():
            before, metadata = _read_config_snapshot(path)
            snapshots[name] = {"before": before, "metadata": metadata}
            receipt["files"][name] = {
                "changed": before != candidate_bytes[name],
                "beforeSha256": _sha256_bytes(before),
                "candidateSha256": _sha256_bytes(candidate_bytes[name]),
                "afterSha256": None,
            }
        validate_configuration_pair(litellm_candidate, gateway_candidate)
        receipt["validatedBeforeMutation"] = True
    except Exception as error:
        receipt["outcome"] = "validation-failed"
        receipt["errorClass"] = type(error).__name__
        for name, snapshot in snapshots.items():
            receipt["files"][name]["afterSha256"] = _sha256_bytes(snapshot["before"])
        raise ConfigApplyError("candidate validation failed", receipt) from error

    changed = [name for name in ("litellm", "gateway") if receipt["files"][name]["changed"]]
    if not changed:
        receipt["outcome"] = "unchanged"
        for name in paths:
            receipt["files"][name]["afterSha256"] = receipt["files"][name]["beforeSha256"]
        return receipt

    staged_candidates = {}
    staged_rollbacks = {}
    applied = []
    backup_paths = {}
    try:
        for name in changed:
            snapshot = snapshots[name]
            staged_candidates[name] = _stage_config_payload(
                paths[name], candidate_bytes[name], snapshot["metadata"], "candidate")
            staged_rollbacks[name] = _stage_config_payload(
                paths[name], snapshot["before"], snapshot["metadata"], "rollback")
        if create_backups:
            for name in changed:
                backup_paths[name] = backup(paths[name], "reprobe")
            receipt["backups"] = backup_paths
        # Refuse to overwrite a config that changed after the validated
        # snapshot. The health-run lock excludes scheduled peers; this catches
        # an operator or other writer racing the apply.
        for name, path in paths.items():
            current, _metadata = _read_config_snapshot(path)
            if current != snapshots[name]["before"]:
                raise RuntimeError("config changed after validation")
        for name in changed:
            os.replace(staged_candidates[name], paths[name])
            staged_candidates[name] = None
            applied.append(name)
            _fsync_config_directory(paths[name])
        for name, path in paths.items():
            after, metadata = _read_config_snapshot(path)
            receipt["files"][name]["afterSha256"] = _sha256_bytes(after)
            expected = candidate_bytes[name] if name in changed else snapshots[name]["before"]
            if after != expected:
                raise RuntimeError("post-apply config hash mismatch")
            before_metadata = snapshots[name]["metadata"]
            if ((metadata.st_uid, metadata.st_gid, statmod.S_IMODE(metadata.st_mode))
                    != (before_metadata.st_uid, before_metadata.st_gid,
                        statmod.S_IMODE(before_metadata.st_mode))):
                raise RuntimeError("post-apply config metadata mismatch")
        receipt["outcome"] = "applied"
        receipt["rollback"]["complete"] = None
    except Exception as error:
        receipt["rollback"]["attempted"] = bool(applied)
        rollback_complete = True
        for name in reversed(applied):
            try:
                os.replace(staged_rollbacks[name], paths[name])
                staged_rollbacks[name] = None
                _fsync_config_directory(paths[name])
            except Exception:
                rollback_complete = False
        receipt["rollback"]["complete"] = rollback_complete if applied else None
        receipt["outcome"] = "rolled-back" if applied and rollback_complete else "apply-failed"
        receipt["errorClass"] = type(error).__name__
        for name, path in paths.items():
            try:
                after, _metadata = _read_config_snapshot(path)
                receipt["files"][name]["afterSha256"] = _sha256_bytes(after)
            except Exception:
                receipt["files"][name]["afterSha256"] = None
        raise ConfigApplyError("transactional config apply failed", receipt) from error
    finally:
        for temporary in [*staged_candidates.values(), *staged_rollbacks.values()]:
            _unlink_if_present(temporary)
    return receipt


def apply_config_candidates_recording_failure(litellm_path, gateway_path,
                                               litellm_candidate, gateway_candidate,
                                               failure_state, state_path=STATE_FILE,
                                               create_backups=False):
    """Apply the pair and durably persist bounded evidence for every failure."""
    try:
        return apply_config_candidates(
            litellm_path, gateway_path, litellm_candidate, gateway_candidate,
            create_backups=create_backups)
    except ConfigApplyError as error:
        state = dict(failure_state)
        state["config_apply_receipt"] = error.receipt
        write_json_atomic_0600(state_path, state)
        raise


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
    catalog_evidence = load_dynamic_catalog_evidence(
        MODEL_CATALOG_FILE, now_ms=observed_at * 1000)
    billing_approvals = load_explicit_billing_approvals(MODEL_POLICY_FILE)
    catalog_eligibility = effective_dynamic_eligibility(catalog_evidence, billing_approvals)
    dynamic_rotation_classes = {
        name: row.get("rotation_class")
        for name, row in catalog_evidence.items()
        if row.get("rotation_class") in {"free-first", "subscription", "manual-approval-required"}
    }
    prior_dynamic_routes = prev_state.get("dynamic_catalog_routes", [])
    if isinstance(prior_dynamic_routes, list):
        for logical_name in prior_dynamic_routes:
            if isinstance(logical_name, str) and SAFE_CATALOG_NAME.fullmatch(logical_name):
                catalog_eligibility.setdefault(logical_name, "unknown")

    to_probe = plan_reprobe_targets(all_models, catalog_eligibility, prev_set)

    log(f"probing {len(to_probe)} cloud models (timeout {PROBE_TIMEOUT}s, {PROBE_WORKERS} workers){' [DRY-RUN]' if DRY else ''}")

    status = {}
    pool_status = {}
    history = {}
    held = []
    pending = []
    catalog_pending = []
    catalog_pruned = []
    billing_pending = []
    for model, state in catalog_eligibility.items():
        if model not in all_models:
            continue
        if state == "ineligible":
            pool_status[model] = None
            catalog_pruned.append(model)
        elif state == "billing-approval-required":
            pool_status[model] = None
            billing_pending.append(model)
        elif state == "unknown" and model not in prev_set:
            pool_status[model] = None
            catalog_pending.append(model)
    with cf.ThreadPoolExecutor(max_workers=PROBE_WORKERS) as ex:
        for m, code, ms in ex.map(lambda mm: probe(mm, key), to_probe):
            status[m] = code
            record, pool_code, decision = resolve_pool_observation(
                m, code, ms, prev_set, prev_history, observed_at, has_pool_baseline)
            record, pool_code, decision = apply_dynamic_catalog_eligibility(
                m, record, pool_code, decision, prev_set, catalog_eligibility)
            history[m] = record
            pool_status[m] = pool_code
            if decision == "held-timeout":
                held.append(m)
            elif decision == "pending-promotion":
                pending.append(m)
            elif decision == "pending-catalog-eligibility":
                catalog_pending.append(m)
            elif decision == "pruned-catalog-ineligible":
                catalog_pruned.append(m)
            elif decision == "pending-billing-approval":
                billing_pending.append(m)

    live = sorted(m for m, c in status.items() if c == 200)
    limited = sorted(m for m, c in status.items() if c == 429)
    dead = sorted(m for m, c in status.items() if c in DEAD_CODES)
    hang = sorted(m for m, c in status.items() if c == 0)
    timed_out = sorted(m for m, c in status.items() if c == 408)
    held.sort()
    pending.sort()
    catalog_pending.sort()
    catalog_pruned.sort()
    billing_pending.sort()
    log(f"live(200)={len(live)}  limited(429)={len(limited)}  dead(terminal)={len(dead)}  "
        f"hang(000)={len(hang)}  timeout(408)={len(timed_out)} ({len(held)} held by hysteresis)")
    if held:
        log("HELD BY HYSTERESIS (kept in pool): " + ", ".join(held))
    if pending:
        log("PENDING PROMOTION (needs 3 consecutive HTTP 200 probes): " + ", ".join(pending))
    if catalog_pending:
        log("PENDING CATALOG ELIGIBILITY (dynamic, not promotable): " + ", ".join(catalog_pending))
    if catalog_pruned:
        log("CATALOG INELIGIBLE (dynamic, removed from routing): " + ", ".join(catalog_pruned))
    if billing_pending:
        log("BILLING APPROVAL REQUIRED (dynamic, not probed/routed): " + ", ".join(billing_pending))
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
    pool = build_pool(pool_status, dynamic_rotation_classes)
    if len(pool) < MIN_LIVE:
        log(f"ABORT: rebuilt pool has {len(pool)} models (< {MIN_LIVE}); leaving chains unchanged")
        return 2

    new_ll = splice_litellm(
        pool,
        dead=set(dead) | set(catalog_pruned) | enforced_ledger_prunes,
    )
    new_gw = splice_gateway(pool)
    cur_ll = open(LITELLM_CONFIG).read()
    cur_gw = open(GATEWAY_CONFIG).read()
    ll_changed = new_ll != cur_ll
    gw_changed = new_gw != cur_gw

    # membership diff vs last run (for the log / state)
    promoted = sorted(set(pool) - prev_set)
    pruned = sorted(prev_set - set(pool))

    log(f"pool={len(pool)} models | litellm_changed={ll_changed} gateway_changed={gw_changed}")
    if promoted:
        log(f"PROMOTED (now in chain): {', '.join(promoted)}")
    if pruned:
        log(f"PRUNED (dropped): {', '.join(pruned)}")

    if DRY:
        try:
            validate_configuration_pair(new_ll, new_gw)
        except Exception as error:
            log(f"dry-run: candidate validation failed ({type(error).__name__}); no files written")
            return 2
        log("dry-run: no files written, no restart")
        log(f"lead(10): {', '.join(pool[:10])}")
        return 0

    failure_state = {
        "ts": int(time.time()), "pool": sorted(prev_set), "live": live,
        "limited": limited, "dead": dead, "hang": hang, "timeout": timed_out,
        "ledger_decisions": ledger_decisions,
        "changed": False, "restart_required": False,
        "dynamic_catalog_routes": sorted(catalog_eligibility),
        "catalog_eligibility": catalog_eligibility,
        "dynamic_rotation_classes": dynamic_rotation_classes,
        "history": history,
    }
    try:
        config_apply_receipt = apply_config_candidates_recording_failure(
            LITELLM_CONFIG,
            GATEWAY_CONFIG,
            new_ll,
            new_gw,
            failure_state,
            STATE_FILE,
            create_backups=True,
        )
    except ConfigApplyError as error:
        log(f"ERROR: config apply failed ({error.receipt.get('outcome', 'unknown')}); prior configs retained")
        return 2

    # Persist state (probe snapshot + current pool) for the next diff. Explicit
    # dynamic provenance survives a temporarily unreadable catalog as unknown;
    # static/manual routes are never inferred from their names.
    write_json_atomic_0600(
        STATE_FILE,
        {"ts": int(time.time()), "pool": pool, "live": live, "limited": limited,
         "dead": dead, "hang": hang, "timeout": timed_out,
         "ledger_decisions": ledger_decisions,
         "changed": bool(ll_changed or gw_changed),
         "restart_required": bool(ll_changed),
         "dynamic_catalog_routes": sorted(catalog_eligibility),
         "catalog_eligibility": catalog_eligibility,
         "dynamic_rotation_classes": dynamic_rotation_classes,
         "config_apply_receipt": config_apply_receipt,
         "history": history},
    )

    if ll_changed:
        log("litellm config changed; restart required via separate authorized workflow")
    else:
        log("no litellm change -> no restart (gateway auto-reloads within 60s)")

    log(f"done in {time.time()-t0:.1f}s")
    return 0


if __name__ == "__main__":
    release_health_run_lock = acquire_health_run_lock()
    if release_health_run_lock is None:
        log("another model health/reprobe run is active; leaving state unchanged")
        sys.exit(0)
    try:
        exit_code = main()
    finally:
        release_health_run_lock()
    sys.exit(exit_code)

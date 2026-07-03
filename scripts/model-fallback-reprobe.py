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
    PRUNE 401/404/400/402/403 (dead/renamed upstream) and 000 (hang/timeout — would stall a chain).
  * Ordering is by provider only (NOT by live-vs-429), so a 200<->429 flap does NOT churn the
    chain; only membership changes (a model dies or recovers) trigger an apply + LiteLLM restart.
  * Idempotent: if the rendered lines equal what's already on disk, nothing is written/restarted.
  * Safety: if fewer than MIN_LIVE models answer 200, ABORT (likely LiteLLM down or a total
    provider outage) — never destroy working chains on a bad probe. YAML is validated (parse +
    no dangling references) before anything is written; a timestamped backup is kept.
  * The control-surface gateway re-reads its yaml every 60s (no restart needed). Local GPU models
    are never touched here (the GPU is off by operator decision; see project_gpu_off_free_cloud).

Usage:  model-fallback-reprobe.py [--dry-run] [--verbose]
"""
import concurrent.futures as cf
import json
import os
import re
import shutil
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
BACKUP_DIR = "/etc/litellm"
BACKUP_KEEP = 6

PROBE_TIMEOUT = 12          # seconds per model
PROBE_WORKERS = 10          # parallel probes (modest — avoid self-inflicted rate limiting)
MIN_LIVE = 6                # abort rebuild if fewer than this answer 200 (bad probe / outage)
KEEP_CODES = {200, 429, 500, 503}   # 200 live, 429 rate-limited (resets), 5xx transient

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
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as r:
            return model, r.status
    except urllib.error.HTTPError as e:
        return model, e.code
    except Exception:
        return model, 0            # timeout / connection / hang


def build_pool(status):
    """Return the ordered list of models to place in fallback chains (dead/hanging pruned)."""
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
    key = load_master_key()
    all_models = model_names()
    to_probe = [m for m in all_models if m not in LOCAL_OR_SPECIAL
                and not re.search(r'prompt-guard|qianfan-ocr', m)]
    log(f"probing {len(to_probe)} cloud models (timeout {PROBE_TIMEOUT}s, {PROBE_WORKERS} workers){' [DRY-RUN]' if DRY else ''}")

    status = {}
    with cf.ThreadPoolExecutor(max_workers=PROBE_WORKERS) as ex:
        for m, code in ex.map(lambda mm: probe(mm, key), to_probe):
            status[m] = code

    live = sorted(m for m, c in status.items() if c == 200)
    limited = sorted(m for m, c in status.items() if c == 429)
    dead = sorted(m for m, c in status.items() if c in (401, 404, 400, 402, 403))
    hang = sorted(m for m, c in status.items() if c == 0)
    log(f"live(200)={len(live)}  limited(429)={len(limited)}  dead(4xx)={len(dead)}  hang(000)={len(hang)}")
    if VERBOSE:
        log("LIVE: " + ", ".join(live))

    if len(live) < MIN_LIVE:
        log(f"ABORT: only {len(live)} live (< {MIN_LIVE}) — probable outage / LiteLLM down; leaving chains unchanged")
        return 2

    pool = build_pool(status)
    if len(pool) < MIN_LIVE:
        log(f"ABORT: rebuilt pool has {len(pool)} models (< {MIN_LIVE}); leaving chains unchanged")
        return 2

    new_ll = splice_litellm(pool, dead=set(dead))
    new_gw = splice_gateway(pool)
    validate_litellm(new_ll)              # raises on bad YAML / dangling ref

    cur_ll = open(LITELLM_CONFIG).read()
    cur_gw = open(GATEWAY_CONFIG).read()
    ll_changed = new_ll.rstrip("\n") != cur_ll.rstrip("\n")
    gw_changed = new_gw.rstrip("\n") != cur_gw.rstrip("\n")

    # membership diff vs last run (for the log / state)
    prev = {}
    try:
        prev = json.load(open(STATE_FILE)).get("pool", {})
    except Exception:
        prev = {}
    prev_set = set(prev) if isinstance(prev, (list, set)) else set(prev.keys()) if isinstance(prev, dict) else set()
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
               "dead": dead, "hang": hang, "changed": bool(ll_changed or gw_changed)},
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

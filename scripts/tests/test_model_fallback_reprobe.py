"""Hermetic tests for fallback-pool membership hysteresis."""
import importlib.util
import json
import os
import sqlite3
import stat
import tempfile
import unittest
from unittest import mock
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "model-fallback-reprobe.py"
SPEC = importlib.util.spec_from_file_location("model_fallback_reprobe", SCRIPT)
REPROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPROBE)


class ProbeClassificationTests(unittest.TestCase):
    class Response:
        def __init__(self, body, status=200):
            self.status = status
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, size=-1):
            return self.body[:size]

    def test_http_200_requires_the_exact_substantive_probe_contract(self):
        exact = json.dumps({"choices": [{"message": {"content": '{"status":"ok"}'}}]}).encode()
        canned = json.dumps({"choices": [{"message": {"content": "quota exhausted"}}],
                             "usage": {"total_tokens": 0}}).encode()
        self.assertTrue(REPROBE.is_substantive_probe_body(exact))
        for body in (b"", b"not-json", canned,
                     json.dumps({"choices": [{"message": {"content": '{"status":"ok","extra":1}'}}]}).encode()):
            with self.subTest(body=body[:20]):
                self.assertFalse(REPROBE.is_substantive_probe_body(body))

        with mock.patch.object(REPROBE.urllib.request, "urlopen",
                               return_value=self.Response(exact)):
            self.assertEqual(REPROBE.probe("model", "key")[1], 200)
        with mock.patch.object(REPROBE.urllib.request, "urlopen",
                               return_value=self.Response(canned)):
            self.assertEqual(REPROBE.probe("model", "key")[1], REPROBE.PROBE_CONTRACT_FAILED)

    def test_expected_status_categories(self):
        for code in (200, 429, 500, 503):
            with self.subTest(code=code):
                self.assertEqual(REPROBE.classify_probe_code(code), "routable")
        for code in (400, 401, 402, 403, 404, 410, REPROBE.PROBE_CONTRACT_FAILED):
            with self.subTest(code=code):
                self.assertEqual(REPROBE.classify_probe_code(code), "dead")
        for code in (0, 408):
            with self.subTest(code=code):
                self.assertEqual(REPROBE.classify_probe_code(code), "timeout")

    def test_legacy_history_uses_the_raw_code_category(self):
        previous = {"code": 200, "streak": 2, "since": 10, "ms": 5}

        record = REPROBE.advance_probe_history(previous, 429, 7, 20)

        self.assertEqual(record["category"], "routable")
        self.assertEqual(record["streak"], 3)
        self.assertEqual(record["since"], 10)
        self.assertEqual(record["success_streak"], 0)

    def test_shared_health_run_lock_excludes_overlap_and_recovers_stale_malformed_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "health.lock")
            release = REPROBE.acquire_health_run_lock(path)
            self.assertIsNotNone(release)
            self.assertIsNone(REPROBE.acquire_health_run_lock(path))
            release()

            Path(path).write_text("")
            old = 1_700_000_000
            os.utime(path, (old, old))
            recovered = REPROBE.acquire_health_run_lock(path)
            self.assertIsNotNone(recovered)
            recovered()


class PoolMembershipTests(unittest.TestCase):
    model = "nvidia-test-model"

    def test_incumbent_timeout_is_pruned_on_the_third_timeout_like_cycle(self):
        previous_history = {
            self.model: {"code": 200, "category": "routable", "streak": 4, "since": 50, "ms": 10}
        }
        decisions = []
        pool_codes = []

        for cycle, code in enumerate((408, 0, 408), start=1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                self.model,
                code,
                20_000,
                {self.model},
                previous_history,
                100 + cycle,
            )
            previous_history = {self.model: record}
            decisions.append(decision)
            pool_codes.append(pool_code)
            self.assertEqual(record["streak"], cycle)
            self.assertEqual(record["category"], "timeout")

        self.assertEqual(decisions, ["held-timeout", "held-timeout", "pruned-timeout"])
        self.assertEqual(pool_codes, [200, 200, 408])

    def test_malformed_history_never_grants_an_incumbent_timeout_hold(self):
        record, pool_code, decision = REPROBE.resolve_pool_observation(
            self.model,
            408,
            20_000,
            {self.model},
            {self.model: {"code": "408", "streak": "2"}},
            150,
        )

        self.assertEqual(record["streak"], 1)
        self.assertEqual(record["category"], "timeout")
        self.assertEqual(pool_code, 408)
        self.assertEqual(decision, "pruned-timeout-unseeded")

    def test_one_timeout_between_routable_incumbent_probes_does_not_flap_membership(self):
        previous_history = {
            self.model: {"code": 200, "category": "routable", "streak": 5, "since": 1, "ms": 10}
        }
        decisions = []

        for cycle, code in enumerate((408, 200), start=1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                self.model,
                code,
                20_000 if code == 408 else 100,
                {self.model},
                previous_history,
                170 + cycle,
            )
            previous_history = {self.model: record}
            decisions.append(decision)
            self.assertIn(pool_code, REPROBE.KEEP_CODES)

        self.assertEqual(decisions, ["held-timeout", "kept"])

    def test_non_incumbent_requires_three_consecutive_http_200_cycles(self):
        previous_history = {}
        decisions = []
        pool_codes = []

        for cycle, code in enumerate((200, 200, 200), start=1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                self.model,
                code,
                12,
                {"existing-model"},
                previous_history,
                200 + cycle,
            )
            previous_history = {self.model: record}
            decisions.append(decision)
            pool_codes.append(pool_code)
            self.assertEqual(record["streak"], cycle)
            self.assertEqual(record["category"], "routable")
            self.assertEqual(record["success_streak"], cycle)

        self.assertEqual(decisions, ["pending-promotion", "pending-promotion", "promoted"])
        self.assertEqual(pool_codes, [None, None, 200])

    def test_rate_limits_and_provider_errors_cannot_build_promotion_evidence(self):
        previous_history = {}
        decisions = []

        for cycle, code in enumerate((429, 500, 503, 429), start=1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                self.model,
                code,
                12,
                {"existing-model"},
                previous_history,
                250 + cycle,
            )
            previous_history = {self.model: record}
            decisions.append(decision)
            self.assertEqual(record["success_streak"], 0)
            self.assertIsNone(pool_code)

        self.assertEqual(decisions, ["pending-promotion"] * 4)

    def test_transient_response_resets_a_partial_success_promotion_streak(self):
        previous_history = {}
        observed = []
        for cycle, code in enumerate((200, 200, 429, 200, 200, 200), start=1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                self.model, code, 10, {"existing-model"}, previous_history, 270 + cycle)
            previous_history = {self.model: record}
            observed.append((record["success_streak"], pool_code, decision))

        self.assertEqual([item[0] for item in observed], [1, 2, 0, 1, 2, 3])
        self.assertEqual(observed[-1][2], "promoted")
        self.assertEqual(observed[-1][1], 200)

    def test_missing_pool_baseline_does_not_bootstrap_a_transient_only_response(self):
        record, pool_code, decision = REPROBE.resolve_pool_observation(
            self.model, 429, 9, set(), {}, 399, has_pool_baseline=False)

        self.assertEqual(record["success_streak"], 0)
        self.assertIsNone(pool_code)
        self.assertEqual(decision, "pending-promotion")

    def test_terminal_dead_codes_prune_an_incumbent_immediately(self):
        previous_history = {
            self.model: {"code": 200, "category": "routable", "streak": 9, "since": 1, "ms": 4}
        }

        for code in sorted(REPROBE.DEAD_CODES):
            with self.subTest(code=code):
                record, pool_code, decision = REPROBE.resolve_pool_observation(
                    self.model,
                    code,
                    8,
                    {self.model},
                    previous_history,
                    300,
                )
                self.assertEqual(record["category"], "dead")
                self.assertEqual(record["streak"], 1)
                self.assertEqual(pool_code, code)
                self.assertEqual(decision, "pruned-dead")

    def test_missing_pool_baseline_bootstraps_routable_models(self):
        record, pool_code, decision = REPROBE.resolve_pool_observation(
            self.model,
            200,
            9,
            set(),
            {},
            400,
            has_pool_baseline=False,
        )

        self.assertEqual(record["streak"], 1)
        self.assertEqual(pool_code, 200)
        self.assertEqual(decision, "bootstrap-routable")


class DynamicCatalogEligibilityTests(unittest.TestCase):
    now_ms = 1_800_000_000_000

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.catalog_path = Path(self.tmp.name) / "model-catalog.json"

    def tearDown(self):
        self.tmp.cleanup()

    def catalog(self, *, generated_at=None, complete=True, last_successful_at=None):
        now = self.now_ms
        return {
            "schemaVersion": REPROBE.MODEL_CATALOG_SCHEMA_VERSION,
            "policyVersion": REPROBE.MODEL_CATALOG_POLICY_VERSION,
            "generatedAt": now if generated_at is None else generated_at,
            "providers": {
                "aihubmix": {
                    "complete": complete,
                    "lastSuccessfulAt": now if last_successful_at is None else last_successful_at,
                    "eligibleIds": ["free-model"],
                },
            },
            "dynamicRoutes": {
                "aihubmix-free-model": {
                    "logicalName": "aihubmix-free-model",
                    "provider": "aihubmix",
                    "modelId": "free-model",
                    "provenance": "catalog-auto-v1",
                    "catalogComplete": complete,
                    "eligibility": "eligible" if complete else "unknown",
                    **REPROBE.DYNAMIC_PROVIDER_ADMISSION["aihubmix"],
                },
                "aihubmix-retired-model": {
                    "logicalName": "aihubmix-retired-model",
                    "provider": "aihubmix",
                    "modelId": "retired-model",
                    "provenance": "catalog-auto-v1",
                    "catalogComplete": complete,
                    "eligibility": "ineligible" if complete else "unknown",
                    **REPROBE.DYNAMIC_PROVIDER_ADMISSION["aihubmix"],
                },
            },
        }

    def write_catalog(self, document, mode=0o600):
        self.catalog_path.write_text(json.dumps(document), encoding="utf-8")
        self.catalog_path.chmod(mode)

    def test_fresh_complete_catalog_derives_eligible_and_ineligible_routes(self):
        self.write_catalog(self.catalog())

        result = REPROBE.load_dynamic_catalog_eligibility(
            str(self.catalog_path), self.now_ms)

        self.assertEqual(result, {
            "aihubmix-free-model": "eligible",
            "aihubmix-retired-model": "ineligible",
        })
        self.assertNotIn("manually-added-route", result)

    def test_catalog_model_ids_may_use_cloudflare_at_prefix(self):
        document = self.catalog()
        document["providers"]["cloudflare"] = {
            "complete": True,
            "lastSuccessfulAt": self.now_ms,
            "eligibleIds": ["@cf/meta/llama-text"],
        }
        document["dynamicRoutes"]["cf-llama-text"] = {
            "logicalName": "cf-llama-text",
            "provider": "cloudflare",
            "modelId": "@cf/meta/llama-text",
            "provenance": "catalog-auto-v1",
            "catalogComplete": True,
            "eligibility": "eligible",
            **REPROBE.DYNAMIC_PROVIDER_ADMISSION["cloudflare"],
        }
        self.write_catalog(document)
        result = REPROBE.load_dynamic_catalog_eligibility(
            str(self.catalog_path), self.now_ms)
        self.assertEqual(result["cf-llama-text"], "eligible")

    def test_stale_or_incomplete_catalog_can_only_return_unknown(self):
        stale = self.catalog(
            generated_at=self.now_ms - REPROBE.MODEL_CATALOG_TTL_MS - 1,
        )
        self.write_catalog(stale)
        self.assertEqual(
            set(REPROBE.load_dynamic_catalog_eligibility(
                str(self.catalog_path), self.now_ms).values()),
            {"unknown"},
        )

        incomplete = self.catalog(complete=False)
        self.write_catalog(incomplete)
        self.assertEqual(
            set(REPROBE.load_dynamic_catalog_eligibility(
                str(self.catalog_path), self.now_ms).values()),
            {"unknown"},
        )

    def test_catalog_claim_must_match_the_provider_inventory(self):
        document = self.catalog()
        document["dynamicRoutes"]["aihubmix-free-model"]["eligibility"] = "ineligible"
        self.write_catalog(document)

        result = REPROBE.load_dynamic_catalog_eligibility(
            str(self.catalog_path), self.now_ms)

        self.assertEqual(result["aihubmix-free-model"], "unknown")
        self.assertEqual(result["aihubmix-retired-model"], "ineligible")

    def test_catalog_billing_metadata_must_match_the_canonical_provider_policy(self):
        document = self.catalog()
        document["dynamicRoutes"]["aihubmix-free-model"]["pricingEvidence"] = "included-quota-unverified"
        self.write_catalog(document)

        result = REPROBE.load_dynamic_catalog_eligibility(
            str(self.catalog_path), self.now_ms)

        self.assertEqual(result["aihubmix-free-model"], "unknown")

    def test_visible_model_that_loses_price_eligibility_is_immediately_ineligible(self):
        document = self.catalog()
        inventory = document["providers"]["aihubmix"]
        inventory["rawIds"] = ["free-model"]
        inventory["eligibleIds"] = ["free-model"]  # prior carry-forward
        inventory["observedEligibleIds"] = []       # current price policy result
        document["dynamicRoutes"]["aihubmix-free-model"]["eligibility"] = "ineligible"
        self.write_catalog(document)

        result = REPROBE.load_dynamic_catalog_eligibility(
            str(self.catalog_path), self.now_ms)

        self.assertEqual(result["aihubmix-free-model"], "ineligible")

    def test_catalog_reader_rejects_non_private_files_and_symlinks(self):
        self.write_catalog(self.catalog(), mode=0o644)
        self.assertEqual(
            REPROBE.load_dynamic_catalog_eligibility(str(self.catalog_path), self.now_ms),
            {},
        )

        private_path = Path(self.tmp.name) / "private-catalog.json"
        private_path.write_text(json.dumps(self.catalog()), encoding="utf-8")
        private_path.chmod(0o600)
        self.catalog_path.unlink()
        self.catalog_path.symlink_to(private_path)
        self.assertEqual(
            REPROBE.load_dynamic_catalog_eligibility(str(self.catalog_path), self.now_ms),
            {},
        )

    def test_eligible_dynamic_route_can_complete_normal_promotion(self):
        model = "aihubmix-free-model"
        history = {}
        observed = None
        for cycle in range(1, REPROBE.PROMOTE_STREAK + 1):
            record, pool_code, decision = REPROBE.resolve_pool_observation(
                model, 200, 10, {"existing-model"}, history, 100 + cycle)
            record, pool_code, decision = REPROBE.apply_dynamic_catalog_eligibility(
                model, record, pool_code, decision, {"existing-model"}, {model: "eligible"})
            history = {model: record}
            observed = (pool_code, decision)

        self.assertEqual(observed, (200, "promoted"))

    def test_ineligible_dynamic_route_is_pruned_even_after_a_success(self):
        model = "aihubmix-retired-model"
        record = {"code": 200, "success_streak": 5, "streak": 5, "since": 1, "ms": 8}

        gated, pool_code, decision = REPROBE.apply_dynamic_catalog_eligibility(
            model, record, 200, "kept", {model}, {model: "ineligible"})

        self.assertIsNone(pool_code)
        self.assertEqual(decision, "pruned-catalog-ineligible")
        self.assertEqual(gated["success_streak"], 0)

    def test_unknown_dynamic_route_blocks_new_promotion_but_preserves_incumbent(self):
        model = "aihubmix-free-model"
        promotable = {"code": 200, "success_streak": 3, "streak": 3, "since": 1, "ms": 8}

        gated, pool_code, decision = REPROBE.apply_dynamic_catalog_eligibility(
            model, promotable, 200, "promoted", {"existing-model"}, {model: "unknown"})
        self.assertIsNone(pool_code)
        self.assertEqual(decision, "pending-catalog-eligibility")
        self.assertEqual(gated["success_streak"], 0)

        held, pool_code, decision = REPROBE.apply_dynamic_catalog_eligibility(
            model, promotable, 200, "kept", {model}, {model: "unknown"})
        self.assertEqual(pool_code, 200)
        self.assertEqual(decision, "kept")
        self.assertEqual(held["catalog_eligibility"], "unknown")

    def test_static_or_manual_route_is_not_changed_without_explicit_provenance(self):
        record = {"code": 200, "success_streak": 3}

        result = REPROBE.apply_dynamic_catalog_eligibility(
            "manual-route", record, 200, "promoted", set(), {})

        self.assertEqual(result, (record, 200, "promoted"))

    def test_prefilter_prevents_network_fanout_for_ineligible_unknown_new_and_unapproved(self):
        models = ["static-route", "dynamic-ok", "dynamic-gone", "dynamic-unknown",
                  "dynamic-incumbent", "dynamic-billing"]
        eligibility = {
            "dynamic-ok": "eligible", "dynamic-gone": "ineligible",
            "dynamic-unknown": "unknown", "dynamic-incumbent": "unknown",
            "dynamic-billing": "billing-approval-required",
        }
        targets = REPROBE.plan_reprobe_targets(models, eligibility, {"dynamic-incumbent"})
        self.assertEqual(targets, ["static-route", "dynamic-ok", "dynamic-incumbent"])

    def test_force_allow_is_not_billing_approval_and_explicit_operator_provenance_is(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.json"
            path.write_text(json.dumps({"models": {
                "force-only": {"forceAllow": True},
                "approved": {"billingApproved": True,
                             "billingApprovalProvenance": "operator:alice"},
                "bad-provenance": {"billingApproved": True,
                                   "billingApprovalProvenance": "ticket-only"},
            }}), encoding="utf-8")
            path.chmod(0o600)
            self.assertEqual(REPROBE.load_explicit_billing_approvals(str(path)), {"approved"})

        evidence = {
            "force-only": {"eligibility": "eligible", "auto_promotion_policy": "manual-approval-required"},
            "approved": {"eligibility": "eligible", "auto_promotion_policy": "manual-approval-required"},
        }
        self.assertEqual(REPROBE.effective_dynamic_eligibility(evidence, {"approved"}), {
            "force-only": "billing-approval-required", "approved": "eligible",
        })

    def test_dynamic_rotation_order_is_evidence_based(self):
        status = {"verified": 200, "static": 200, "subscription": 200, "approved-quota": 200}
        rotation = {"verified": "free-first", "subscription": "subscription",
                    "approved-quota": "manual-approval-required"}
        pool = REPROBE.build_pool(status, rotation)
        self.assertLess(pool.index("verified"), pool.index("static"))
        self.assertLess(pool.index("static"), pool.index("subscription"))
        self.assertLess(pool.index("subscription"), pool.index("approved-quota"))


class TransactionalConfigApplyTests(unittest.TestCase):
    @staticmethod
    def litellm(chain="model-one", suffix=""):
        return f"""model_list:
  - model_name: editorial-heavy
  - model_name: editorial-fast
  - model_name: model-one
  - model_name: model-two
router_settings:
  fallbacks:
    - editorial-heavy: [{chain}]
    - editorial-fast: [{chain}]
{suffix}"""

    @staticmethod
    def gateway(chain="model-one"):
        return f"""version: 1
models:
  editorial-heavy:
    backend: litellm
    model: editorial-heavy
    fallback_chain: [{chain}]
  editorial-fast:
    backend: litellm
    model: editorial-fast
    fallback_chain: [{chain}]
  model-one:
    backend: litellm
    model: model-one
  model-two:
    backend: litellm
    model: model-two
"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.litellm_path = Path(self.tmp.name) / "litellm.yaml"
        self.gateway_path = Path(self.tmp.name) / "gateway.yaml"
        self.before_litellm = self.litellm()
        self.before_gateway = self.gateway()
        self.litellm_path.write_text(self.before_litellm, encoding="utf-8")
        self.gateway_path.write_text(self.before_gateway, encoding="utf-8")
        self.litellm_path.chmod(0o640)
        self.gateway_path.chmod(0o600)

    def tearDown(self):
        self.tmp.cleanup()

    def assert_originals_intact(self):
        self.assertEqual(self.litellm_path.read_text(encoding="utf-8"), self.before_litellm)
        self.assertEqual(self.gateway_path.read_text(encoding="utf-8"), self.before_gateway)
        self.assertEqual(stat.S_IMODE(self.litellm_path.stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE(self.gateway_path.stat().st_mode), 0o600)

    def test_pair_validation_failure_cannot_mutate_either_config(self):
        invalid_gateway = self.gateway("not-in-litellm")
        with self.assertRaises(REPROBE.ConfigApplyError) as raised:
            REPROBE.apply_config_candidates(
                str(self.litellm_path), str(self.gateway_path),
                self.litellm("model-two"), invalid_gateway,
            )
        self.assertEqual(raised.exception.receipt["outcome"], "validation-failed")
        self.assertFalse(raised.exception.receipt["validatedBeforeMutation"])
        self.assert_originals_intact()
        self.assertEqual(list(Path(self.tmp.name).glob(".*.tmp")), [])

    def test_preapply_validation_failure_persists_bounded_receipt_state(self):
        state_path = Path(self.tmp.name) / "reprobe-state.json"
        invalid_gateway = self.gateway("not-in-litellm")
        with self.assertRaises(REPROBE.ConfigApplyError):
            REPROBE.apply_config_candidates_recording_failure(
                str(self.litellm_path), str(self.gateway_path),
                self.litellm("model-two"), invalid_gateway,
                {"pool": ["model-one"], "changed": False},
                str(state_path),
            )
        persisted = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertEqual(persisted["pool"], ["model-one"])
        self.assertEqual(persisted["config_apply_receipt"]["outcome"], "validation-failed")
        self.assertFalse(persisted["config_apply_receipt"]["validatedBeforeMutation"])
        self.assertEqual(stat.S_IMODE(state_path.stat().st_mode), 0o600)
        self.assert_originals_intact()

    def test_second_replace_failure_rolls_first_config_back_atomically(self):
        real_replace = os.replace
        candidate_replaces = 0

        def fail_second_candidate(source, target):
            nonlocal candidate_replaces
            if ".candidate." in str(source):
                candidate_replaces += 1
                if candidate_replaces == 2:
                    raise OSError("simulated second replace failure")
            return real_replace(source, target)

        with mock.patch.object(REPROBE.os, "replace", side_effect=fail_second_candidate):
            with self.assertRaises(REPROBE.ConfigApplyError) as raised:
                REPROBE.apply_config_candidates(
                    str(self.litellm_path), str(self.gateway_path),
                    self.litellm("model-two"), self.gateway("model-two"),
                )

        receipt = raised.exception.receipt
        self.assertEqual(receipt["outcome"], "rolled-back")
        self.assertEqual(receipt["rollback"], {"attempted": True, "complete": True})
        for row in receipt["files"].values():
            self.assertEqual(row["beforeSha256"], row["afterSha256"])
        self.assert_originals_intact()
        self.assertEqual(list(Path(self.tmp.name).glob(".*.tmp")), [])

    def test_operator_config_race_is_detected_without_overwriting_the_new_bytes(self):
        real_stage = REPROBE._stage_config_payload
        stage_calls = 0
        operator_gateway = self.gateway("model-one") + "# operator-race\n"

        def race_after_staging(path, payload, metadata, purpose):
            nonlocal stage_calls
            temporary = real_stage(path, payload, metadata, purpose)
            stage_calls += 1
            if stage_calls == 4:
                self.gateway_path.write_text(operator_gateway, encoding="utf-8")
                self.gateway_path.chmod(0o600)
            return temporary

        with mock.patch.object(REPROBE, "_stage_config_payload", side_effect=race_after_staging):
            with self.assertRaises(REPROBE.ConfigApplyError) as raised:
                REPROBE.apply_config_candidates(
                    str(self.litellm_path), str(self.gateway_path),
                    self.litellm("model-two"), self.gateway("model-two"),
                )

        self.assertEqual(raised.exception.receipt["outcome"], "apply-failed")
        self.assertEqual(raised.exception.receipt["rollback"], {"attempted": False, "complete": None})
        self.assertEqual(self.litellm_path.read_text(encoding="utf-8"), self.before_litellm)
        self.assertEqual(self.gateway_path.read_text(encoding="utf-8"), operator_gateway)
        self.assertEqual(list(Path(self.tmp.name).glob(".*.tmp")), [])

    def test_large_candidate_is_fully_fsynced_without_truncation(self):
        suffix = "# " + ("bounded-payload-" * 8192) + "\n"
        candidate = self.litellm("model-two", suffix)
        real_write = os.write

        def partial_write(fd, payload):
            return real_write(fd, payload[:max(1, len(payload) // 3)])

        with mock.patch.object(REPROBE.os, "write", side_effect=partial_write):
            receipt = REPROBE.apply_config_candidates(
                str(self.litellm_path), str(self.gateway_path),
                candidate, self.before_gateway,
            )
        self.assertEqual(receipt["outcome"], "applied")
        self.assertEqual(self.litellm_path.read_text(encoding="utf-8"), candidate)
        self.assertEqual(self.gateway_path.read_text(encoding="utf-8"), self.before_gateway)
        self.assertEqual(stat.S_IMODE(self.litellm_path.stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE(self.gateway_path.stat().st_mode), 0o600)
        self.assertEqual(receipt["files"]["litellm"]["candidateSha256"],
                         receipt["files"]["litellm"]["afterSha256"])

    def test_byte_identical_candidates_are_a_true_noop(self):
        before_inodes = (self.litellm_path.stat().st_ino, self.gateway_path.stat().st_ino)
        with mock.patch.object(REPROBE.os, "replace") as replace:
            receipt = REPROBE.apply_config_candidates(
                str(self.litellm_path), str(self.gateway_path),
                self.before_litellm, self.before_gateway,
            )
        replace.assert_not_called()
        self.assertEqual(receipt["outcome"], "unchanged")
        self.assertEqual(before_inodes,
                         (self.litellm_path.stat().st_ino, self.gateway_path.stat().st_ino))
        self.assert_originals_intact()


class AtomicStateTests(unittest.TestCase):
    def test_state_replace_is_atomic_private_and_leaves_no_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "reprobe.json"
            state_path.write_text('{"old": true}\n', encoding="utf-8")
            state_path.chmod(0o644)

            REPROBE.write_json_atomic_0600(str(state_path), {"new": True})

            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8")), {"new": True})
            self.assertEqual(stat.S_IMODE(state_path.stat().st_mode), 0o600)
            self.assertEqual(list(Path(directory).glob(".reprobe.json.*.tmp")), [])

    def test_state_writer_rejects_an_oversized_document_without_replacing_target(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "reprobe.json"
            state_path.write_text('{"old": true}\n', encoding="utf-8")
            state_path.chmod(0o600)

            with self.assertRaises(ValueError):
                REPROBE.write_json_atomic_0600(
                    str(state_path), {"large": "x" * 128}, max_bytes=32)

            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8")), {"old": True})


class LedgerReconciliationTests(unittest.TestCase):
    now_ms = 1_800_000_000_000

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "dashboard.sqlite")
        self.db = sqlite3.connect(self.db_path)
        self.db.execute("""
            CREATE TABLE gateway_calls (
              ts INTEGER NOT NULL,
              resolved_model TEXT NOT NULL,
              backend TEXT NOT NULL,
              success INTEGER NOT NULL,
              error_class TEXT,
              tenant_id TEXT
            )
        """)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def add_calls(self, model, count, *, success=0, error_class="rate_limit",
                  backend="litellm", age_days=1, span_hours=0, tenant_id="mimule"):
        first_ts = self.now_ms - age_days * 86400 * 1000
        step_ms = (span_hours * 3600 * 1000 / (count - 1)) if count > 1 else 0
        self.db.executemany(
            "INSERT INTO gateway_calls VALUES (?, ?, ?, ?, ?, ?)",
            [(int(first_ts + i * step_ms), model, backend, success, error_class, tenant_id)
             for i in range(count)],
        )
        self.db.commit()

    def test_deepseek_fixture_qualifies_after_45_rate_limits_over_125_hours(self):
        self.add_calls("zen-deepseek-v4-flash-free", 45, age_days=6, span_hours=124.9)

        result = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(result["would_prune"], ["zen-deepseek-v4-flash-free"])
        evidence = result["models"]["zen-deepseek-v4-flash-free"]["evidence"]
        self.assertEqual(evidence["recentCalls"], 45)
        self.assertEqual(evidence["recentSuccesses"], 0)
        self.assertEqual(evidence["rateLimitFailures"], 45)
        self.assertEqual(evidence["recentSpanHours"], 124.9)

    def test_does_not_quarantine_small_or_successful_samples(self):
        self.add_calls("nineteen-failures", 19)
        self.add_calls("one-success", 19)
        self.add_calls("one-success", 1, success=1, error_class=None)

        result = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertNotIn("nineteen-failures", result["models"])
        self.assertNotIn("one-success", result["models"])

    def test_excludes_infrastructure_unknown_cli_and_expired_evidence(self):
        self.add_calls("infra-only", 20, error_class="gateway_unreachable")
        self.add_calls("legacy-unknown", 20, error_class="unknown")
        self.add_calls("cli-only", 20, backend="cli-direct")
        self.add_calls("expired", 20, age_days=8)
        self.add_calls("demo-tenant", 20, age_days=3, span_hours=49, tenant_id="acme-demo")

        result = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(result["models"], {})

    def test_ignored_rows_do_not_help_reach_the_sample_floor(self):
        self.add_calls("mixed", 19)
        self.add_calls("mixed", 40, error_class="unknown")
        self.add_calls("mixed", 40, error_class="gateway_unreachable")

        result = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertNotIn("mixed", result["models"])

    def test_prune_overrides_a_routable_probe_without_inventing_a_status(self):
        status = {"zen-bad": 429, "groq-good": 200}
        reconciled = REPROBE.apply_ledger_decisions(
            status,
            {"would_prune": ["zen-bad"], "would_quarantine": []},
        )

        self.assertIsNone(reconciled["zen-bad"])
        self.assertEqual(reconciled["groq-good"], 200)
        self.assertEqual(status["zen-bad"], 429)
        self.assertNotIn("zen-bad", REPROBE.build_pool(reconciled))

    def test_earned_route_is_shadow_quarantined_but_not_removed(self):
        self.add_calls("earned-then-bad", 60, success=1, error_class=None, age_days=8)
        self.add_calls("earned-then-bad", 200, error_class="unknown", age_days=8)
        self.add_calls("earned-then-bad", 20, age_days=3, span_hours=49)

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)
        reconciled = REPROBE.apply_ledger_decisions(
            {"earned-then-bad": 429},
            decisions,
        )

        self.assertEqual(decisions["would_prune"], [])
        self.assertEqual(decisions["would_quarantine"], ["earned-then-bad"])
        self.assertEqual(decisions["models"]["earned-then-bad"]["state"], "degraded")
        self.assertEqual(decisions["models"]["earned-then-bad"]["action"], "shadow-quarantine")
        self.assertEqual(decisions["models"]["earned-then-bad"]["evidence"]["allTimeCalls"], 80)
        self.assertEqual(reconciled["earned-then-bad"], 429)

    def test_earned_degradation_uses_the_five_call_floor(self):
        self.add_calls("earned-auth-regression", 50, success=1, error_class=None, age_days=8)
        self.add_calls("earned-auth-regression", 5, error_class="auth")

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(decisions["would_quarantine"], ["earned-auth-regression"])
        self.assertEqual(decisions["would_prune"], [])

    def test_null_seed_tenant_is_in_scope(self):
        self.add_calls("legacy-seed-route", 20, error_class="auth", tenant_id=None)

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(decisions["would_prune"], ["legacy-seed-route"])
        self.assertEqual(decisions["policy_version"], 1)
        self.assertEqual(decisions["mode"], "shadow")

    def test_short_rate_limit_burst_is_not_pruned(self):
        self.add_calls("short-throttle", 20, age_days=1, span_hours=12)

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertNotIn("short-throttle", decisions["models"])

    def test_non_rate_limit_failure_does_not_require_a_48_hour_span(self):
        self.add_calls("expired-auth", 20, error_class="auth", span_hours=1)

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(decisions["would_prune"], ["expired-auth"])

    def test_mixed_throttle_failures_are_deferred_to_r2b(self):
        self.add_calls("mixed-throttle", 19, span_hours=1)
        self.add_calls("mixed-throttle", 1, error_class="auth")

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertNotIn("mixed-throttle", decisions["models"])

    def test_server_error_is_not_trusted_until_classifier_is_fixed(self):
        self.add_calls("ambiguous-five", 30, error_class="server_error")

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertNotIn("ambiguous-five", decisions["models"])

    def test_gateway_unreachable_is_excluded_even_on_a_malformed_success_row(self):
        self.add_calls("malformed-infra", 60, success=1,
                       error_class="gateway_unreachable", age_days=8)
        self.add_calls("malformed-infra", 20, age_days=3, span_hours=49)

        decisions = REPROBE.ledger_route_decisions(self.db_path, self.now_ms)

        self.assertEqual(decisions["would_prune"], ["malformed-infra"])
        self.assertEqual(decisions["would_quarantine"], [])

    def test_shadow_mode_cannot_change_pool_membership(self):
        status = {"zen-bad": 429, "groq-good": 200}
        decisions = {"would_prune": ["zen-bad"]}

        reconciled, enforced = REPROBE.reconcile_pool_with_ledger(
            status, decisions, mode="shadow")

        self.assertEqual(reconciled, status)
        self.assertEqual(enforced, set())
        self.assertEqual(REPROBE.build_pool(reconciled), REPROBE.build_pool(status))

    def test_missing_database_fails_open(self):
        decisions, error = REPROBE.load_ledger_decisions(
            str(Path(self.tmp.name) / "missing.sqlite"),
            self.now_ms,
        )

        self.assertIsNotNone(error)
        self.assertEqual(decisions["mode"], "shadow")
        self.assertEqual(decisions["would_prune"], [])


if __name__ == "__main__":
    unittest.main()

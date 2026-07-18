"""Hermetic tests for fallback-pool membership hysteresis."""
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "model-fallback-reprobe.py"
SPEC = importlib.util.spec_from_file_location("model_fallback_reprobe", SCRIPT)
REPROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPROBE)


class ProbeClassificationTests(unittest.TestCase):
    def test_expected_status_categories(self):
        for code in (200, 429, 500, 503):
            with self.subTest(code=code):
                self.assertEqual(REPROBE.classify_probe_code(code), "routable")
        for code in (400, 401, 402, 403, 404, 410):
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

    def test_non_incumbent_promotes_on_third_routable_category_cycle(self):
        previous_history = {}
        decisions = []
        pool_codes = []

        for cycle, code in enumerate((200, 429, 200), start=1):
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

        self.assertEqual(decisions, ["pending-promotion", "pending-promotion", "promoted"])
        self.assertEqual(pool_codes, [None, None, 200])

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

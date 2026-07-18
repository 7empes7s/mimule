"""Hermetic tests for fallback-pool membership hysteresis."""
import importlib.util
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


if __name__ == "__main__":
    unittest.main()

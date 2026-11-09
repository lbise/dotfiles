#!/usr/bin/env python3
"""herdr-tickets against a fake herdr binary that logs calls and replays canned JSON."""

from __future__ import annotations

import json
import os
import runpy
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "herdr-tickets"

FAKE_HERDR = textwrap.dedent(
    """\
    #!/usr/bin/env python3
    import json, os, sys
    root = os.environ["FAKE_ROOT"]
    args = sys.argv[3:]  # drop --machine <label>
    with open(os.path.join(root, "calls.jsonl"), "a") as f:
        f.write(json.dumps(sys.argv[1:]) + "\\n")
    if os.path.exists(os.path.join(root, "fail-" + "-".join(args[:2]))):
        print("boom", file=sys.stderr); sys.exit(1)
    if args[:2] == ["workspace", "list"]:
        ws = json.load(open(os.path.join(root, "workspaces.json"))).get(sys.argv[2], [])
        print(json.dumps({"result": {"workspaces": ws}}))
    elif args[:2] == ["workspace", "create"]:
        print(json.dumps({"result": {"workspace": {"workspace_id": "w9"}, "root_pane": {"pane_id": "w9:p1"}}}))
    else:
        print(json.dumps({"result": {}}))
    """
)


class HerdrTicketsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        herdr = self.tmp / "herdr"
        herdr.write_text(FAKE_HERDR)
        herdr.chmod(0o755)
        cfg = self.tmp / "herdr-tickets"
        cfg.mkdir()
        (cfg / "machines.json").write_text(json.dumps({
            "pevb12": {"family": "PEVB", "repo": "/r"},
            "uboard310": {"family": "UBOARD3", "repo": "/r"},
        }))
        (cfg / "start-prompt.md").write_text("Do #{ticket}\n")
        self.set_workspaces({})
        self.env = {"HERDR_BIN_PATH": str(herdr), "FAKE_ROOT": str(self.tmp), "XDG_CONFIG_HOME": str(self.tmp)}
        self.old_env = {k: os.environ.get(k) for k in self.env}
        os.environ.update(self.env)
        self.mod = runpy.run_path(str(SCRIPT), run_name="herdr_tickets")

    def tearDown(self) -> None:
        for k, v in self.old_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def set_workspaces(self, by_machine: dict) -> None:
        (self.tmp / "workspaces.json").write_text(json.dumps(by_machine))

    def calls(self) -> list[list[str]]:
        path = self.tmp / "calls.jsonl"
        lines = path.read_text().splitlines() if path.exists() else []
        return [json.loads(line)[2:] for line in lines if json.loads(line)[2:4] != ["workspace", "list"]]

    def test_start_creates_workspace_starts_pi_and_prompts(self) -> None:
        self.assertEqual(self.mod["main"](["start", "#1234", "pevb12"]), 0)
        create, agent, prompt = self.calls()
        self.assertEqual(create[:6], ["workspace", "create", "--cwd", "/r", "--label", "rm-1234"])
        self.assertEqual(agent[:6], ["agent", "start", "rm-1234", "--kind", "pi", "--pane"])
        self.assertEqual(agent[-3:], ["--", "--session-id", "rm-1234"])
        self.assertEqual(prompt[:4], ["agent", "prompt", "rm-1234", "Do #1234"])

    def test_resume_skips_prompt(self) -> None:
        self.assertEqual(self.mod["main"](["start", "1234", "pevb12", "--resume"]), 0)
        self.assertEqual([c[:2] for c in self.calls()], [["workspace", "create"], ["agent", "start"]])

    def test_refuses_busy_machine_and_duplicate_ticket(self) -> None:
        self.set_workspaces({"pevb12": [{"label": "rm-1", "workspace_id": "w1"}, {"label": "rom"}]})
        self.assertEqual(self.mod["main"](["start", "2", "pevb12"]), 1)
        self.assertEqual(self.mod["main"](["start", "1", "uboard310"]), 1)
        self.assertEqual(self.calls(), [])

    def test_failed_agent_start_closes_workspace(self) -> None:
        (self.tmp / "fail-agent-start").touch()
        self.assertEqual(self.mod["main"](["start", "5", "pevb12"]), 1)
        self.assertEqual(self.calls()[-1], ["workspace", "close", "w9"])

    def test_rejects_relative_repo(self) -> None:
        (self.tmp / "herdr-tickets" / "machines.json").write_text(json.dumps({"x": {"repo": "~/a"}}))
        self.assertEqual(self.mod["main"](["status"]), 1)


if __name__ == "__main__":
    unittest.main()

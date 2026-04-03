# SEED LR Language Risk Check

Evaluate AI-generated text against adversarial interpreter profiles before it ships.
Flags compliance risk, coercive language, and absolute claims that would not survive
a regulatory review.

Built by SEED LR -- https://review.seedengine.systems

---

## Usage

Add this to your workflow:

```yaml
- name: SEED LR Language Risk Check
  uses: bmcghee98/seed-lr-action@v1
  with:
    inputs: outputs.json
    api_key: ${{ secrets.SEED_API_KEY }}
    fail_on: ESCALATE
    mode: fintech
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| inputs | Yes | | Path to JSON file of text outputs to evaluate |
| api_key | Yes | | SEED LR API key (store in GitHub Secrets) |
| api_url | No | https://seed-9n9a0g.fly.dev | SEED LR API base URL |
| fail_on | No | ESCALATE | Recommendation level that fails the build |
| mode | No | fintech | Evaluation mode |

---

## Outputs

| Output | Description |
|--------|-------------|
| recommendation | Worst-case recommendation across all inputs |
| ship_count | Number of inputs that received SHIP |
| hold_count | Number of inputs that received HOLD |
| escalate_count | Number of inputs that received ESCALATE |
| failed | true if any input hit the fail_on threshold |

---

## Input file format

Simple array of strings:

```json
["Output text one", "Output text two"]
```

Or array of objects with IDs:

```json
[
  {"id": "response-1", "text": "Output text one"},
  {"id": "response-2", "text": "Output text two"}
]
```

---

## How it works

SEED LR evaluates each input against 149 adversarial interpreter profiles including
Fintech Risk Officer, Auditor Formalism, Compliance, Security Threat Model, Literal,
and Worst-Case. Each input receives a SHIP, HOLD, or ESCALATE recommendation with
flags anchored to specific evidence phrases.

HOLD inputs produce a warning in the build log but do not fail the build by default.
ESCALATE inputs fail the build when fail_on is set to ESCALATE (default).

Set fail_on: HOLD for strict mode -- any flagged output fails the build.

---

## Getting an API key

API keys are issued per client. Request one at https://review.seedengine.systems
or email seedaiengine@gmail.com.

---

## About SEED LR

SEED LR is an AI language risk evaluation engine built for fintech compliance teams
and engineering teams integrating language risk into CI/CD pipelines.

Built by B McGhee -- https://linkedin.com/in/bmcghee98

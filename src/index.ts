import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

interface BatchInput {
  id: string;
  text: string;
}

interface BatchFlag {
  concern: string;
  severity: string;
}

interface BatchResultItem {
  id: string;
  recommendation: string;
  overall_risk_level: string;
  flags: BatchFlag[];
  error?: string;
}

interface BatchResponse {
  batch_id: string;
  results: BatchResultItem[];
  summary: {
    total: number;
    ship: number;
    hold: number;
    escalate: number;
  };
}

type Tier = "SHIP" | "HOLD" | "ESCALATE";

function toTier(rec: string): Tier {
  const lower = (rec || "").toLowerCase().trim();
  if (lower === "block" || lower === "escalate") return "ESCALATE";
  if (lower === "revise" || lower === "hold") return "HOLD";
  return "SHIP";
}

const TIER_RANK: Record<Tier, number> = { SHIP: 0, HOLD: 1, ESCALATE: 2 };

function worstTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

function postJSON(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const mod = parsed.protocol === "https:" ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            data: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run(): Promise<void> {
  const inputsPath = core.getInput("inputs", { required: true });
  const apiKey = core.getInput("api_key", { required: true });
  const apiUrl = core.getInput("api_url") || "https://seed-9n9a0g.fly.dev";
  const failOn = core.getInput("fail_on").toUpperCase() as Tier || "ESCALATE";
  const mode = core.getInput("mode") || "fintech";

  const resolvedPath = path.resolve(inputsPath);
  if (!fs.existsSync(resolvedPath)) {
    core.setFailed(`Inputs file not found: ${resolvedPath}`);
    return;
  }

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    core.setFailed(`Failed to parse inputs file as JSON: ${resolvedPath}`);
    return;
  }

  if (!Array.isArray(parsed)) {
    core.setFailed("Inputs file must contain a JSON array");
    return;
  }

  // Accepts string[] or {id, text}[]
  const inputs: BatchInput[] = parsed.map(
    (item: unknown, i: number): BatchInput => {
      if (typeof item === "string") {
        return { id: `input-${i + 1}`, text: item };
      }
      if (
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof (item as Record<string, unknown>).text === "string"
      ) {
        const obj = item as Record<string, unknown>;
        return {
          id: typeof obj.id === "string" ? obj.id : `input-${i + 1}`,
          text: obj.text as string,
        };
      }
      core.setFailed(
        `Invalid input at index ${i}: expected string or {id, text} object`
      );
      throw new Error("invalid input");
    }
  );

  core.info(`Evaluating ${inputs.length} input(s) against SEED LR (${mode})`);

  const batchUrl = `${apiUrl.replace(/\/+$/, "")}/batch`;
  let response: { status: number; data: string };
  try {
    response = await postJSON(
      batchUrl,
      { inputs, mode },
      { "x-api-key": apiKey }
    );
  } catch (err) {
    core.setFailed(`Failed to reach SEED LR API: ${err}`);
    return;
  }

  if (response.status !== 200) {
    core.setFailed(
      `SEED LR API returned status ${response.status}: ${response.data.slice(0, 500)}`
    );
    return;
  }

  let batch: BatchResponse;
  try {
    batch = JSON.parse(response.data);
  } catch {
    core.setFailed("Failed to parse SEED LR API response as JSON");
    return;
  }

  const artifactPath = path.join(
    process.env.GITHUB_WORKSPACE || ".",
    "seed-lr-results.json"
  );
  fs.writeFileSync(artifactPath, JSON.stringify(batch, null, 2), "utf-8");
  core.info(`Full artifact written to ${artifactPath}`);

  core.info("");
  core.info("| # | ID | Recommendation | Risk Level | Top Concern |");
  core.info("|---|-----|----------------|------------|-------------|");

  let worst: Tier = "SHIP";
  let hasWarnings = false;

  for (let i = 0; i < batch.results.length; i++) {
    const r = batch.results[i];
    const tier = toTier(r.recommendation);
    worst = worstTier(worst, tier);

    const topConcern =
      r.flags && r.flags.length > 0 ? r.flags[0].concern : "-";

    core.info(
      `| ${i + 1} | ${r.id} | ${tier} | ${r.overall_risk_level} | ${topConcern} |`
    );
  }

  const shipCount = batch.summary?.ship ?? 0;
  const holdCount = batch.summary?.hold ?? 0;
  const escalateCount = batch.summary?.escalate ?? 0;

  core.info("");
  core.info(`Totals: ${shipCount} SHIP / ${holdCount} HOLD / ${escalateCount} ESCALATE`);
  core.info(`Worst recommendation: ${worst}`);

  core.setOutput("recommendation", worst);
  core.setOutput("ship_count", shipCount.toString());
  core.setOutput("hold_count", holdCount.toString());
  core.setOutput("escalate_count", escalateCount.toString());
  core.setOutput("failed", (TIER_RANK[worst] >= (TIER_RANK[failOn] ?? TIER_RANK.ESCALATE)).toString());

  const failOnRank = TIER_RANK[failOn] ?? TIER_RANK.ESCALATE;
  const worstRank = TIER_RANK[worst];

  if (worstRank >= failOnRank) {
    core.setFailed(
      `SEED LR check failed: ${worst} recommendation detected (fail_on=${failOn})`
    );
    return;
  }

  if (holdCount > 0 && failOn === "ESCALATE") {
    hasWarnings = true;
    core.warning(
      `${holdCount} input(s) received HOLD recommendation -- review before shipping`
    );
  }

  core.info(hasWarnings ? "SEED LR check passed with warnings" : "SEED LR check passed");
}

run().catch((err) => core.setFailed(`Unexpected error: ${err}`));

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AI_FAST_MODEL, AI_MODEL, AI_MONTHLY_CAP_USD, AiError, aiConfigured, callTool, costUsd } from "@/lib/ai/claude";
import { runAi } from "@/lib/ai/run";
import { GOALS } from "@/lib/ai/validate";
import { MAX_IMAGES, MAX_IMPORT_TEXT, MAX_PROMPT, PICK_KINDS, type AiKind, type AiRequest, type AiResponse, type AiWorkout, type AiUsage } from "@/lib/ai/types";

/*
  The one door to Claude. POST asks for a plan, an edit, a workout, a plan day, or an import; GET reports
  this month's AI spend. Every call is logged with its token cost, and a household monthly cap stops AI
  calls once reached (the rest of the app keeps working).
*/

export const maxDuration = 300;

const KINDS: AiKind[] = ["plan", "edit", "workout", "day", "import", "swap", "suggest"];
const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB per image after base64

type Supabase = Awaited<ReturnType<typeof getSupabaseServer>>;

async function readUsage(sb: Supabase): Promise<AiUsage> {
  const { data } = await sb.rpc("ai_spend_this_month");
  const row = (Array.isArray(data) ? data[0] : data) as { household_usd?: number | string; mine_usd?: number | string; my_requests?: number } | null;
  return {
    configured: aiConfigured(),
    household_usd: Number(row?.household_usd ?? 0),
    mine_usd: Number(row?.mine_usd ?? 0),
    my_requests: Number(row?.my_requests ?? 0),
    cap_usd: AI_MONTHLY_CAP_USD,
  };
}

async function signedIn(sb: Supabase) {
  const { data } = await sb.auth.getClaims();
  return Boolean(data?.claims?.sub);
}

const fail = (error: string, status: number, usage?: AiUsage) => NextResponse.json({ ok: false, error, usage } satisfies AiResponse, { status });

export async function GET() {
  const sb = await getSupabaseServer();
  if (!(await signedIn(sb))) return fail("Sign in first.", 401);
  return NextResponse.json(await readUsage(sb));
}

/** Basic shape and size checks on what the phone sent. */
function parseRequest(body: unknown): AiRequest | string {
  if (typeof body !== "object" || body === null) return "Bad request.";
  const b = body as Partial<AiRequest>;
  if (!b.kind || !KINDS.includes(b.kind)) return "Unknown AI request.";
  const prompt = typeof b.prompt === "string" ? b.prompt : "";
  if (prompt.length > (b.kind === "import" ? MAX_IMPORT_TEXT : MAX_PROMPT)) return "That's too long. Shorten it and try again.";
  if (!b.profile || !GOALS.includes(b.profile.goal)) return "Missing profile.";
  if (!Array.isArray(b.exercises) || !b.exercises.length) return "No exercises to choose from. Check the gym's equipment under More → Gyms.";
  if (b.exercises.length > 1500) return "Too many exercises sent.";
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > MAX_IMAGES) return `Up to ${MAX_IMAGES} photos at a time.`;
  for (const img of images) {
    if (!img || typeof img.data !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(img.media_type)) return "Unsupported photo.";
    if (img.data.length > MAX_IMAGE_CHARS) return "A photo is too large.";
  }
  if (b.kind === "import" && !prompt.trim() && !images.length) return "Paste the plan or add a photo.";
  const pick = PICK_KINDS.includes(b.kind);
  if (pick && (!b.today || !Array.isArray(b.today.items))) return "Missing the workout.";
  if (pick && b.exercises.length > 60) return "Too many candidates sent.";
  if (b.kind === "swap" && !b.swap?.exercise_id) return "Missing the exercise to swap.";
  if (!pick && b.kind !== "import" && b.kind !== "edit" && !prompt.trim() && b.kind !== "plan") return "Say what you'd like.";
  if (b.kind === "edit" && (!b.plan || !Array.isArray(b.plan.days))) return "Missing plan to edit.";
  if (b.kind === "edit" && !prompt.trim()) return "Say what to change.";
  if (b.kind === "plan") {
    const o = b.options;
    if (!o || !GOALS.includes(o.goal) || !(o.days_per_week >= 1 && o.days_per_week <= 7) || !(o.weeks >= 1 && o.weeks <= 52)) return "Missing plan settings.";
  }
  return { ...(b as AiRequest), prompt, images };
}

export async function POST(request: NextRequest) {
  const sb = await getSupabaseServer();
  if (!(await signedIn(sb))) return fail("Sign in first.", 401);
  const req = parseRequest(await request.json().catch(() => null));
  if (typeof req === "string") return fail(req, 400);

  if (!aiConfigured()) return fail("AI isn't set up yet: add ANTHROPIC_API_KEY to the app's settings in Vercel.", 503, await readUsage(sb));
  const before = await readUsage(sb);
  if (before.household_usd >= before.cap_usd) {
    return fail(`AI has reached this month's $${before.cap_usd.toFixed(2)} limit. It resets on the 1st; everything else keeps working.`, 429, before);
  }

  const model = PICK_KINDS.includes(req.kind) ? AI_FAST_MODEL : AI_MODEL;
  let tokens = { input_tokens: 0, output_tokens: 0 };
  const log = async (ok: boolean) => {
    const { error } = await sb.rpc("ai_log_request", {
      p_type: req.kind,
      p_model: model,
      p_input_tokens: tokens.input_tokens,
      p_output_tokens: tokens.output_tokens,
      p_cost_usd: Number(costUsd(model, tokens).toFixed(5)),
      p_ok: ok,
    });
    if (error) console.error("ai_log_request failed", error.message);
  };
  // Count tokens as they're spent, so a call that fails halfway is still logged.
  const counted: typeof callTool = async (opts) => {
    const c = await callTool(opts);
    tokens = { input_tokens: tokens.input_tokens + c.usage.input_tokens, output_tokens: tokens.output_tokens + c.usage.output_tokens };
    return c;
  };

  try {
    const r = await runAi(req, counted, model);
    await log(!r.empty);
    const usage = await readUsage(sb);
    if (r.empty && (r.kind === "swap" || r.kind === "suggest")) return fail("No AI picks this time.", 422, usage);
    if (r.empty) return fail("Claude couldn't build that with this gym's equipment. Try rewording it, or check the gym's equipment.", 422, usage);
    const warnings = r.errors.length ? [`Fixed or left out ${r.errors.length} thing${r.errors.length === 1 ? "" : "s"} the AI got wrong. Check it over before accepting.`] : [];
    let out: AiResponse;
    if (r.kind === "swap" || r.kind === "suggest") out = { ok: true, kind: r.kind, picks: r.value, warnings: [], usage };
    else if (r.kind === "import") out = { ok: true, kind: "import", result: r.value, warnings, usage };
    else if (r.kind === "plan" || r.kind === "edit") out = { ok: true, kind: r.kind, plan: r.value, warnings, usage };
    else out = { ok: true, kind: r.kind, workout: r.value as AiWorkout, warnings, usage };
    return NextResponse.json(out);
  } catch (e) {
    if (tokens.input_tokens || tokens.output_tokens) await log(false);
    const usage = await readUsage(sb).catch(() => undefined);
    if (e instanceof AiError) return fail(e.message, e.status, usage);
    console.error("AI route failed", e);
    return fail("Something went wrong talking to Claude. Try again.", 500, usage);
  }
}

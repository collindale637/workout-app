import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AiJob } from "@/lib/ai/types";

/*
  Picks up background AI builds. GET returns your newest job (optionally for one screen: ?ref=<plan id>, or
  ?ref=new); DELETE clears it once you've used or dismissed it. A job stuck "running" for over 10 minutes
  is marked failed first, so a screen never waits forever.
*/

const COLUMNS = "id, kind, ref, status, result, created_at";

export async function GET(request: NextRequest) {
  const sb = await getSupabaseServer();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await sb.rpc("ai_jobs_expire");
  const ref = request.nextUrl.searchParams.get("ref");
  let q = sb.from("ai_jobs").select(COLUMNS).order("created_at", { ascending: false }).limit(1);
  if (ref === "new") q = q.is("ref", null);
  else if (ref) q = q.eq("ref", ref);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: "Couldn't check on the AI build." }, { status: 500 });
  return NextResponse.json({ ok: true, job: ((data ?? [])[0] ?? null) as AiJob | null }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const sb = await getSupabaseServer();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing job." }, { status: 400 });
  const { error } = await sb.from("ai_jobs").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't clear it." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

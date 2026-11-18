import { requireAdmin } from "@/lib/admin";
import { JUDGING } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { assignJudges } from "@/lib/scoring";
import { computeTrackResults } from "@/lib/results-service";
import { insertRow, selectRows } from "@/lib/supabase";

/**
 * POST /api/admin/assignments { track, mode: "stage1" | "third" | "stage2" }
 *  - stage1: two judges per team that passed Stage 0, load-balanced, conflicts excluded.
 *  - third:  one extra judge for teams where two judges disagree (10.6).
 *  - stage2: every Grand Jury member for each finalist (10.7).
 */
export const POST = route("admin-assignments", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { track?: unknown; mode?: unknown };
  if (input.track !== "Beginner" && input.track !== "Advanced") return errorResponse(422, "Use Beginner or Advanced.", { track: "Invalid track." });
  if (!["stage1", "third", "stage2"].includes(String(input.mode))) return errorResponse(422, "Use stage1, third or stage2.", { mode: "Invalid mode." });
  const track = input.track;

  const { rows: judges } = await selectRows<{ id: string; role: string; tracks: string[] }>("judges", {
    select: "id,role,tracks", active: "eq.true",
  });
  const { rows: conflictRows } = await selectRows<{ judge_id: string; team_id: string }>("judge_conflicts", { select: "judge_id,team_id" });
  const conflicts = new Set(conflictRows.map((c) => `${c.judge_id}|${c.team_id}`));
  const { rows: existing } = await selectRows<{ judge_id: string; team_id: string; stage: number }>("judge_assignments", { select: "judge_id,team_id,stage" });

  const created: { teamId: string; judgeId: string }[] = [];
  const add = async (teamId: string, judgeId: string, stage: 1 | 2, third = false) => {
    await insertRow("judge_assignments", { judge_id: judgeId, team_id: teamId, stage, third }, "judge_id");
    created.push({ teamId, judgeId });
  };

  if (input.mode === "stage2") {
    const finalists = (await computeTrackResults(track)).teams.filter((t) => t.finalist && t.eligible);
    const jury = judges.filter((j) => j.role === "grand_jury");
    if (jury.length < 3) return errorResponse(409, "The Grand Jury needs 3 to 5 members first.");
    for (const f of finalists) for (const j of jury) {
      if (conflicts.has(`${j.id}|${f.teamId}`) || existing.some((e) => e.judge_id === j.id && e.team_id === f.teamId && e.stage === 2)) continue;
      await add(f.teamId, j.id, 2);
    }
    await audit(auth.actor, "assignments_stage2", null, { track, created: created.length });
    return okResponse({ created: created.length });
  }

  const pool = judges.filter((j) => (j.role === "judge" || j.role === "chair") && j.tracks.includes(track));
  const load = (id: string) => existing.filter((e) => e.judge_id === id && e.stage === 1).length + created.filter((c) => c.judgeId === id).length;

  if (input.mode === "stage1") {
    const { rows: passed } = await selectRows<{ team_id: string; teams: { track: string } }>("stage0_results", {
      select: "team_id,teams!inner(track)", passed: "eq.true", "teams.track": `eq.${track}`,
    });
    const todo = passed.map((p) => p.team_id).filter((id) => !existing.some((e) => e.team_id === id && e.stage === 1));
    const { assignments, unfilled } = assignJudges(todo, pool.map((j) => ({ id: j.id, load: load(j.id) })), conflicts, 2);
    if (unfilled.length) return errorResponse(409, "Not enough eligible judges for some teams. Add judges or review conflicts.", { teams: unfilled.join(", ") });
    for (const [teamId, ids] of Object.entries(assignments)) for (const id of ids) await add(teamId, id, 1);
    await audit(auth.actor, "assignments_stage1", null, { track, created: created.length });
    return okResponse({ created: created.length });
  }

  // third judge for moderation
  const pending = (await computeTrackResults(track)).teams.filter((t) => t.moderationPending);
  for (const t of pending) {
    if (existing.some((e) => e.team_id === t.teamId && e.stage === 1 && e.judge_id && created.every((c) => c.teamId !== t.teamId))) {
      const taken = new Set(existing.filter((e) => e.team_id === t.teamId && e.stage === 1).map((e) => e.judge_id));
      const candidates = pool.filter((j) => !taken.has(j.id) && !conflicts.has(`${j.id}|${t.teamId}`)).sort((a, b) => load(a.id) - load(b.id));
      if (candidates[0]) await add(t.teamId, candidates[0].id, 1, true);
    }
  }
  await audit(auth.actor, "assignments_third", null, { track, created: created.length });
  return okResponse({ created: created.length, pending: pending.map((p) => p.teamCode) });
});

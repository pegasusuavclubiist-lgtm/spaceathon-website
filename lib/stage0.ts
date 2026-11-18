/**
 * Stage 0 integrity and completeness screening (rulebook 10.3, 8.6, 9.1).
 * Pass/fail only; "reviews" are flags for a human, not failures.
 */

export interface Stage0Input {
  t0: Date;
  checkpoints: { n: 1 | 2 | 3; at: Date }[];
  hasRepoSnapshot: boolean;
  hasManifest: boolean;
  firstCommitAt: Date | null;
  commits: { at: Date; additions: number }[];
  /** Highest code similarity with another team, percent (excluding template and declared libraries). */
  maxSimilarityPercent: number;
  /** Report text copied from another team. */
  copiedReportText: boolean;
}

export interface Stage0Outcome {
  passed: boolean;
  /** Hard failures. */
  issues: string[];
  /** Manual-review flags. */
  reviews: string[];
}

export function screenTeam(input: Stage0Input): Stage0Outcome {
  const issues: string[] = [];
  const reviews: string[] = [];

  if (!input.hasRepoSnapshot) issues.push("no_working_repository_snapshot");
  if (!input.hasManifest) issues.push("no_hash_manifest");

  // 7.1: the first team commit must carry a server timestamp later than T0.
  if (input.firstCommitAt && input.firstCommitAt <= input.t0) issues.push("commit_before_t0");

  // 8.6: a single commit adding more than half of the final codebase.
  const totalAdded = input.commits.reduce((s, c) => s + c.additions, 0);
  if (totalAdded > 0 && input.commits.some((c) => c.additions / totalAdded > 0.5)) {
    reviews.push("single_commit_over_50_percent");
  }

  // 8.6: no commits across two checkpoints. Interpreted as a gap with no commit
  // between two consecutive checkpoint instants (reported as a review, not a failure).
  const marks = input.checkpoints.map((c) => c.at.getTime()).sort((x, y) => x - y);
  for (let i = 0; i + 1 < marks.length; i += 1) {
    if (!input.commits.some((c) => c.at.getTime() >= marks[i] && c.at.getTime() < marks[i + 1])) {
      reviews.push("no_commits_across_two_checkpoints");
      break;
    }
  }

  // 9.1: 40% or more triggers review; confirmed above 70% leads to disqualification (OC decides).
  if (input.maxSimilarityPercent > 70) issues.push("similarity_over_70_percent");
  else if (input.maxSimilarityPercent >= 40) reviews.push("similarity_40_percent_or_more");
  if (input.copiedReportText) reviews.push("copied_report_text");

  return { passed: issues.length === 0, issues, reviews };
}

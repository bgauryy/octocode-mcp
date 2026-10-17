//! The unified patch a preview shows: a bounded line diff with context.

/// Unchanged lines shown around each hunk of the preview patch.
const PATCH_CONTEXT: usize = 3;
/// Edit-distance budget for the line diff. Past it the changed region is shown
/// as one replaced block: still a correct patch, just not minimal.
const PATCH_MAX_EDITS: usize = 4096;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum LineOp {
    Equal,
    Delete,
    Insert,
}

/// Myers shortest edit script over lines. `None` when the script needs more
/// than `max_edits` insertions plus deletions. Linear-space Myers (divide and
/// conquer on the middle snake): memory is O(min(N+M, max_edits)) whatever
/// the edit count, time O((N+M)·D). Within a changed run deletions come
/// before insertions, as a unified diff prints them.
pub(super) fn line_diff(old: &[&str], new: &[&str], max_edits: usize) -> Option<Vec<LineOp>> {
    let mut ops = Vec::with_capacity(old.len() + new.len());
    // Every sub-problem's distance is at most the top one's, so its search
    // never passes this many rounds.
    let rounds = max_edits / 2 + 2;
    conquer(old, new, Some(max_edits), rounds, &mut ops)?;
    for run in ops.chunk_by_mut(|a, b| (*a == LineOp::Equal) == (*b == LineOp::Equal)) {
        run.sort_by_key(|op| *op == LineOp::Insert);
    }
    Some(ops)
}

/// Appends the edit script of `old` → `new` to `ops`; `budget` bounds its
/// edit count (the top call only: a sub-problem is never costlier).
fn conquer(
    old: &[&str],
    new: &[&str],
    budget: Option<usize>,
    rounds: usize,
    ops: &mut Vec<LineOp>,
) -> Option<()> {
    let prefix = old.iter().zip(new).take_while(|(a, b)| a == b).count();
    let (old, new) = (&old[prefix..], &new[prefix..]);
    let suffix = old
        .iter()
        .rev()
        .zip(new.iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let (old, new) = (&old[..old.len() - suffix], &new[..new.len() - suffix]);
    ops.extend(std::iter::repeat_n(LineOp::Equal, prefix));
    let split = if old.is_empty() || new.is_empty() {
        None
    } else {
        Some(middle_snake(old, new, budget, rounds)?)
    };
    match split {
        // A split that does not shrink both halves cannot occur once the
        // common ends are stripped; treat it as one replaced block anyway.
        Some((x, y)) if (x, y) != (0, 0) && (x, y) != (old.len(), new.len()) => {
            conquer(&old[..x], &new[..y], None, rounds, ops)?;
            conquer(&old[x..], &new[y..], None, rounds, ops)?;
        }
        _ => {
            if budget.is_some_and(|budget| old.len() + new.len() > budget) {
                return None;
            }
            ops.extend(std::iter::repeat_n(LineOp::Delete, old.len()));
            ops.extend(std::iter::repeat_n(LineOp::Insert, new.len()));
        }
    }
    ops.extend(std::iter::repeat_n(LineOp::Equal, suffix));
    Some(())
}

/// Where a shortest edit script of `old` → `new` (both non-empty, with no
/// common first or last line) crosses its middle: the end of the forward
/// snake that meets the reverse search. `None` when the script needs more
/// than `budget` edits. Forward and reverse furthest-reaching paths meet
/// after about D/2 rounds each, holding one diagonal array per direction.
fn middle_snake(
    old: &[&str],
    new: &[&str],
    budget: Option<usize>,
    rounds: usize,
) -> Option<(usize, usize)> {
    let (n, m) = (old.len() as isize, new.len() as isize);
    let max_d = ((n + m + 1) / 2 + 1).min(rounds as isize);
    let offset = max_d;
    let width = (2 * max_d + 1) as usize;
    let mut forward = vec![-1isize; width];
    let mut reverse = vec![-1isize; width];
    forward[(offset + 1) as usize] = 0;
    reverse[(offset + 1) as usize] = 0;
    let delta = n - m;
    let odd = delta % 2 != 0;
    let at = |k: isize| usize::try_from(offset + k).ok().filter(|i| *i < width);
    let within = |d: isize| budget.is_none_or(|budget| d <= budget as isize);
    // Diagonals that ran off the grid are skipped in later rounds.
    let (mut k1_start, mut k1_end, mut k2_start, mut k2_end) = (0, 0, 0, 0);
    for d in 0..max_d {
        if !within(2 * d - 1) {
            return None;
        }
        let mut k1 = -d + k1_start;
        while k1 <= d - k1_end {
            let i = at(k1)?;
            let mut x = if k1 == -d || (k1 != d && forward[i - 1] < forward[i + 1]) {
                forward[i + 1]
            } else {
                forward[i - 1] + 1
            };
            let mut y = x - k1;
            while x < n && y < m && old[x as usize] == new[y as usize] {
                x += 1;
                y += 1;
            }
            forward[i] = x;
            if x > n {
                k1_end += 2;
            } else if y > m {
                k1_start += 2;
            } else if odd
                && let Some(j) = at(delta - k1)
                && reverse[j] != -1
                && x >= n - reverse[j]
            {
                // Forward round d meets reverse round d-1: D = 2d - 1.
                return within(2 * d - 1).then_some((x as usize, y as usize));
            }
            k1 += 2;
        }
        let mut k2 = -d + k2_start;
        while k2 <= d - k2_end {
            let i = at(k2)?;
            let mut x = if k2 == -d || (k2 != d && reverse[i - 1] < reverse[i + 1]) {
                reverse[i + 1]
            } else {
                reverse[i - 1] + 1
            };
            let mut y = x - k2;
            while x < n && y < m && old[(n - x - 1) as usize] == new[(m - y - 1) as usize] {
                x += 1;
                y += 1;
            }
            reverse[i] = x;
            if x > n {
                k2_end += 2;
            } else if y > m {
                k2_start += 2;
            } else if !odd
                && let Some(j) = at(delta - k2)
                && forward[j] != -1
            {
                let fx = forward[j];
                let fy = fx - (delta - k2);
                if fx >= n - x {
                    // Both searches ran d rounds: D = 2d.
                    return within(2 * d).then_some((fx as usize, fy as usize));
                }
            }
            k2 += 2;
        }
    }
    // Unreachable for a bounded search that ran its rounds: no meeting
    // within them means the script is costlier than the budget allows.
    budget.is_none().then_some((0, 0))
}

pub(super) fn create_unified_patch(path: &str, before: &str, after: &str) -> String {
    if before == after {
        return String::new();
    }
    // Split preserving line endings so the preview reflects CRLF and missing
    // final newlines faithfully; `str::lines()` would drop that information and
    // produce hunk bodies that disagree with the bytes on disk. This is a
    // display-only preview; the actual apply is a byte splice elsewhere.
    let old = before.split_inclusive('\n').collect::<Vec<_>>();
    let new = after.split_inclusive('\n').collect::<Vec<_>>();
    let mut prefix = 0usize;
    while prefix < old.len() && prefix < new.len() && old[prefix] == new[prefix] {
        prefix += 1;
    }
    let mut suffix = 0usize;
    while suffix < old.len().saturating_sub(prefix)
        && suffix < new.len().saturating_sub(prefix)
        && old[old.len() - 1 - suffix] == new[new.len() - 1 - suffix]
    {
        suffix += 1;
    }
    let old_mid = &old[prefix..old.len() - suffix];
    let new_mid = &new[prefix..new.len() - suffix];
    let middle = line_diff(old_mid, new_mid, PATCH_MAX_EDITS).unwrap_or_else(|| {
        let mut block = vec![LineOp::Delete; old_mid.len()];
        block.extend(std::iter::repeat_n(LineOp::Insert, new_mid.len()));
        block
    });
    // Whole-file script, each op with the old/new line index it consumes.
    let mut ops = Vec::with_capacity(prefix + middle.len() + suffix);
    let (mut oi, mut ni) = (0usize, 0usize);
    for op in std::iter::repeat_n(LineOp::Equal, prefix)
        .chain(middle)
        .chain(std::iter::repeat_n(LineOp::Equal, suffix))
    {
        ops.push((op, oi, ni));
        match op {
            LineOp::Equal => {
                oi += 1;
                ni += 1;
            }
            LineOp::Delete => oi += 1,
            LineOp::Insert => ni += 1,
        }
    }
    // Group changes whose unchanged gap fits inside two contexts into one hunk.
    let mut groups: Vec<(usize, usize)> = Vec::new();
    for (index, (op, _, _)) in ops.iter().enumerate() {
        if *op == LineOp::Equal {
            continue;
        }
        match groups.last_mut() {
            Some(group) if index - group.1 <= 2 * PATCH_CONTEXT + 1 => group.1 = index,
            _ => groups.push((index, index)),
        }
    }
    let mut patch = String::new();
    patch.push_str(&format!("--- a/{path}\n"));
    patch.push_str(&format!("+++ b/{path}\n"));
    for (first, last) in groups {
        let lo = first.saturating_sub(PATCH_CONTEXT);
        let hi = (last + PATCH_CONTEXT).min(ops.len() - 1);
        let hunk = &ops[lo..=hi];
        let old_count = hunk.iter().filter(|(op, ..)| *op != LineOp::Insert).count();
        let new_count = hunk.iter().filter(|(op, ..)| *op != LineOp::Delete).count();
        // An empty side names the line before the hunk (unified-diff rule).
        let start = |index: usize, count: usize| if count == 0 { index } else { index + 1 };
        patch.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            start(hunk[0].1, old_count),
            old_count,
            start(hunk[0].2, new_count),
            new_count
        ));
        for &(op, oi, ni) in hunk {
            let (marker, line) = match op {
                LineOp::Equal => (' ', old[oi]),
                LineOp::Delete => ('-', old[oi]),
                LineOp::Insert => ('+', new[ni]),
            };
            patch.push(marker);
            patch.push_str(line);
            if !line.ends_with('\n') {
                // A line without a trailing newline (final line of a no-EOF-newline
                // file) still needs to terminate the diff row it lives on.
                patch.push('\n');
                patch.push_str("\\ No newline at end of file\n");
            }
        }
    }
    patch
}

//! A short-lived store of results kept for continuation pages, keyed by the
//! result's snapshot and the path policy that produced it. A hit is only a
//! candidate: each owner re-validates what it reads before serving a page.
use octocode_io::memo::{Memo, MemoLimits};
use std::time::Duration;

/// Values by snapshot, each stored with the policy that produced it.
pub(crate) struct PageMemo<V> {
    memo: Memo<String, (String, V)>,
    ttl: Duration,
}

impl<V> PageMemo<V> {
    /// A store that keeps a value for `ttl`, at most `max_entries` values,
    /// and at most `max_weight` total weight; the least recently used go
    /// first.
    pub(crate) const fn new(ttl: Duration, max_entries: usize, max_weight: usize) -> Self {
        Self {
            memo: Memo::new(MemoLimits {
                max_entries,
                max_weight,
                keep_newest: false,
            }),
            ttl,
        }
    }

    /// `read` of the unexpired value stored for `snapshot` under `policy`.
    pub(crate) fn get<T>(
        &self,
        snapshot: &str,
        policy: &str,
        read: impl FnOnce(&V) -> T,
    ) -> Option<T> {
        let hit = self.memo.get(snapshot)?;
        let (stored_policy, value) = hit.value.as_ref();
        (stored_policy == policy).then(|| read(value))
    }

    /// Store `value`, replacing any value for the same snapshot and dropping
    /// expired values, then the least recently used beyond the entry and
    /// weight budgets. A value over the weight budget is not kept.
    pub(crate) fn put(&self, snapshot: String, policy: String, weight: usize, value: V) {
        self.memo
            .insert(snapshot, (policy, value), weight, Some(self.ttl));
    }

    /// Drop the value stored for `snapshot`, as expiry or eviction would.
    pub(crate) fn evict(&self, snapshot: &str) {
        self.memo.remove(snapshot);
    }

    /// Stored snapshots, least recently used first, and their total weight.
    #[cfg(test)]
    pub(crate) fn contents(&self) -> (Vec<String>, usize) {
        self.memo.contents()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_oldest_values_go_first_to_keep_both_budgets() {
        let memo = PageMemo::new(Duration::from_secs(60), 3, 10);
        for tag in 0..5 {
            memo.put(format!("s{tag}"), "p".into(), 3, ());
        }
        assert_eq!(
            memo.contents(),
            (vec!["s2".into(), "s3".into(), "s4".into()], 9)
        );
        memo.put("big".into(), "p".into(), 8, ());
        assert_eq!(memo.contents(), (vec!["big".into()], 8));
        // A value over the weight budget is not kept, and evicts nothing.
        memo.put("huge".into(), "p".into(), 11, ());
        assert_eq!(memo.contents(), (vec!["big".into()], 8));
    }

    #[test]
    fn a_value_is_served_under_its_own_policy_until_replaced_or_evicted() {
        let memo = PageMemo::new(Duration::from_secs(60), 4, 100);
        memo.put("s".into(), "a".into(), 1, 1);
        assert_eq!(memo.get("s", "a", |v| *v), Some(1));
        assert_eq!(memo.get("s", "b", |v| *v), None);
        memo.put("s".into(), "a".into(), 1, 2);
        assert_eq!(memo.get("s", "a", |v| *v), Some(2));
        assert_eq!(memo.contents().0.len(), 1);
        memo.evict("s");
        assert_eq!(memo.get("s", "a", |v| *v), None);
    }

    #[test]
    fn an_expired_value_is_not_served() {
        let memo = PageMemo::new(Duration::ZERO, 4, 100);
        memo.put("s".into(), "a".into(), 1, ());
        assert_eq!(memo.get("s", "a", |()| ()), None);
    }
}

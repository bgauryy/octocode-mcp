//! The one keyed single-flight primitive: requests for one key take turns
//! on a shared async slot, so the first does the work and later ones reuse
//! what it left in the slot (a remembered answer, a shared failure, or
//! nothing but the ordering).
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, PoisonError};

/// Per-key turn-taking over a slot of state `S`.
///
/// A [`KeyedFlight::transient`] flight forgets a key as soon as no request
/// holds or awaits it, so whatever the slot carried is shared only within
/// one concurrent wave. A [`KeyedFlight::retained`] flight keeps idle slots
/// (their state outlives the wave) and drops idle ones once more than `cap`
/// keys are known.
pub struct KeyedFlight<K, S> {
    slots: Mutex<BTreeMap<K, Arc<tokio::sync::Mutex<S>>>>,
    /// `None`: transient. `Some(cap)`: retained, idle slots pruned past `cap`.
    retain: Option<usize>,
}

impl<K, S> KeyedFlight<K, S> {
    pub const fn transient() -> Self {
        Self {
            slots: Mutex::new(BTreeMap::new()),
            retain: None,
        }
    }

    pub const fn retained(cap: usize) -> Self {
        Self {
            slots: Mutex::new(BTreeMap::new()),
            retain: Some(cap),
        }
    }
}

impl<K: Ord + Clone, S: Default> KeyedFlight<K, S> {
    /// Join the flight for `key`; await [`Ticket::turn`] to take its turn.
    pub fn join(&self, key: K) -> Ticket<'_, K, S> {
        let mut slots = self.slots.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(cap) = self.retain
            && slots.len() > cap
        {
            slots.retain(|_, slot| Arc::strong_count(slot) > 1);
        }
        let slot = Arc::clone(slots.entry(key.clone()).or_default());
        Ticket {
            flight: self,
            key,
            slot,
        }
    }

    /// Keys currently known (in flight, or retained).
    pub fn len(&self) -> usize {
        self.slots
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// One request's place in a key's flight. Dropping it (on completion,
/// cancellation, or panic) forgets a transient key nobody else holds.
pub struct Ticket<'a, K: Ord, S> {
    flight: &'a KeyedFlight<K, S>,
    key: K,
    slot: Arc<tokio::sync::Mutex<S>>,
}

impl<K: Ord, S> Ticket<'_, K, S> {
    /// Wait for this request's turn and the slot's state.
    pub async fn turn(&self) -> tokio::sync::MutexGuard<'_, S> {
        self.slot.lock().await
    }
}

impl<K: Ord, S> Drop for Ticket<'_, K, S> {
    fn drop(&mut self) {
        if self.flight.retain.is_some() {
            return;
        }
        let mut slots = self
            .flight
            .slots
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        // Only the map and this ticket still hold the slot: nobody waits.
        if slots
            .get(&self.key)
            .is_some_and(|slot| Arc::strong_count(slot) == 2)
        {
            slots.remove(&self.key);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::KeyedFlight;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn one_key_takes_turns_and_later_turns_see_the_first_ones_state() {
        let flight = Arc::new(KeyedFlight::<&str, Option<u32>>::transient());
        let work = Arc::new(AtomicUsize::new(0));
        let tasks = (0..8)
            .map(|_| {
                let (flight, work) = (Arc::clone(&flight), Arc::clone(&work));
                tokio::spawn(async move {
                    let ticket = flight.join("key");
                    let mut slot = ticket.turn().await;
                    if slot.is_none() {
                        work.fetch_add(1, Ordering::SeqCst);
                        tokio::task::yield_now().await;
                        *slot = Some(7);
                    }
                    slot.unwrap_or_default()
                })
            })
            .collect::<Vec<_>>();
        for task in tasks {
            assert_eq!(task.await.unwrap(), 7);
        }
        assert_eq!(
            work.load(Ordering::SeqCst),
            1,
            "the first turn did the work"
        );
        assert!(
            flight.is_empty(),
            "a transient key is forgotten after its wave"
        );
        let ticket = flight.join("key");
        assert_eq!(*ticket.turn().await, None, "a new wave starts empty");
    }

    #[tokio::test]
    async fn retained_slots_outlive_their_wave_and_idle_ones_are_pruned_past_the_cap() {
        let flight = KeyedFlight::<u32, Option<u32>>::retained(2);
        let held = flight.join(0);
        *held.turn().await = Some(0);
        for key in 1..3 {
            *flight.join(key).turn().await = Some(key);
        }
        assert_eq!(flight.len(), 3, "idle slots are retained up to the cap");
        assert_eq!(
            *flight.join(1).turn().await,
            None,
            "past the cap idle slots go"
        );
        assert_eq!(flight.len(), 2);
        assert_eq!(*held.turn().await, Some(0), "a held slot survives pruning");
    }

    #[tokio::test]
    async fn a_cancelled_waiter_forgets_its_transient_key() {
        let flight = KeyedFlight::<u8, ()>::transient();
        let first = flight.join(1);
        let guard = first.turn().await;
        {
            let second = flight.join(1);
            let waiting = second.turn();
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(10), waiting)
                    .await
                    .is_err()
            );
        }
        drop(guard);
        drop(first);
        assert!(flight.is_empty());
    }
}

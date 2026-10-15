//! Exclusive advisory file locks: the one owner of "poll until a deadline".
//! The kernel releases the lock when its holder exits, so a crashed holder
//! never leaves a stale lock behind.

use std::fs::{File, TryLockError};
use std::time::{Duration, Instant};

/// A held exclusive lock; dropping it unlocks.
#[derive(Debug)]
pub struct LockedFile(File);

impl Drop for LockedFile {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

/// Why a lock was not taken.
#[derive(Debug)]
pub enum LockError {
    /// Another holder kept it for the whole wait.
    Busy,
    /// The filesystem refused the lock operation itself.
    Io(std::io::Error),
}

/// Take an exclusive lock on `file`, polling every `poll` for at most `wait`.
/// A zero `wait` tries once.
pub fn lock_within(file: File, wait: Duration, poll: Duration) -> Result<LockedFile, LockError> {
    let deadline = Instant::now() + wait;
    loop {
        match file.try_lock() {
            Ok(()) => return Ok(LockedFile(file)),
            Err(TryLockError::WouldBlock) if Instant::now() < deadline => {
                std::thread::sleep(poll.min(deadline.saturating_duration_since(Instant::now())));
            }
            Err(TryLockError::WouldBlock) => return Err(LockError::Busy),
            Err(TryLockError::Error(error)) => return Err(LockError::Io(error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn open(path: &std::path::Path) -> std::fs::File {
        std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(path)
            .unwrap()
    }

    #[test]
    fn an_uncontended_lock_is_taken_at_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.lock");
        let started = Instant::now();
        let held = lock_within(
            open(&path),
            Duration::from_secs(5),
            Duration::from_millis(10),
        )
        .expect("an uncontended lock");
        assert!(started.elapsed() < Duration::from_secs(1));
        // The guard holds the lock: another holder is turned away.
        assert!(matches!(
            lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)),
            Err(LockError::Busy)
        ));
        drop(held);
    }

    #[test]
    fn a_held_lock_is_waited_for_until_its_holder_lets_go() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.lock");
        let held = lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            drop(held);
        });
        let started = Instant::now();
        let taken = lock_within(
            open(&path),
            Duration::from_secs(5),
            Duration::from_millis(10),
        )
        .expect("taken once the holder lets go");
        release.join().unwrap();
        // It waited for the holder rather than failing or skipping the lock.
        assert!(started.elapsed() >= Duration::from_millis(100));
        assert!(matches!(
            lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)),
            Err(LockError::Busy)
        ));
        drop(taken);
    }

    #[test]
    fn a_lock_held_past_the_wait_is_busy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.lock");
        let _held = lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)).unwrap();
        let result = lock_within(
            open(&path),
            Duration::from_millis(60),
            Duration::from_millis(10),
        );
        assert!(matches!(result, Err(LockError::Busy)));
    }

    #[test]
    fn dropping_the_guard_releases_the_lock() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.lock");
        drop(lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)).unwrap());
        let again = lock_within(open(&path), Duration::ZERO, Duration::from_millis(10))
            .expect("released by the drop");
        assert!(matches!(
            lock_within(open(&path), Duration::ZERO, Duration::from_millis(10)),
            Err(LockError::Busy)
        ));
        drop(again);
    }
}

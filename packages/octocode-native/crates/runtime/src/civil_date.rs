//! Proleptic Gregorian day arithmetic (Howard Hinnant's `days_from_civil` /
//! `civil_from_days`), shared by every timestamp parser and formatter so the
//! runtime needs no date crate.

pub(crate) use octocode_github::{civil_from_days, days_from_civil};

use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Wall-clock time since the Unix epoch: the one clock every runtime reader
/// shares. A clock set before the epoch reads as zero rather than failing,
/// so a timestamp, TTL or expiry computed from it stays defined.
fn since_epoch() -> Duration {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
}

/// Seconds since the Unix epoch, saturating at `i64::MAX`.
pub(crate) fn unix_secs() -> i64 {
    i64::try_from(since_epoch().as_secs()).unwrap_or(i64::MAX)
}

/// Milliseconds since the Unix epoch, saturating at `i64::MAX`.
pub(crate) fn unix_millis() -> i64 {
    i64::try_from(since_epoch().as_millis()).unwrap_or(i64::MAX)
}

/// Nanoseconds since the Unix epoch.
pub(crate) fn unix_nanos() -> u128 {
    since_epoch().as_nanos()
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ` for `ttl` from now.
pub(crate) fn iso8601_millis_after(ttl: Duration) -> String {
    let ttl = i64::try_from(ttl.as_millis()).unwrap_or(i64::MAX);
    iso8601_millis(unix_millis().saturating_add(ttl))
}

/// `YYYY-MM-DDTHH:MM:SSZ` for seconds since the Unix epoch.
pub(crate) fn iso8601_secs(secs: i64) -> String {
    let (date, clock) = date_and_clock(secs);
    format!("{date}T{clock}Z")
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ` for milliseconds since the Unix epoch.
pub(crate) fn iso8601_millis(millis: i64) -> String {
    let (date, clock) = date_and_clock(millis.div_euclid(1_000));
    format!("{date}T{clock}.{:03}Z", millis.rem_euclid(1_000))
}

/// `YYYY-MM-DD` (UTC) for milliseconds since the Unix epoch.
pub(crate) fn date_millis(millis: i64) -> String {
    date(millis.div_euclid(86_400_000))
}

fn date(days: i64) -> String {
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn date_and_clock(secs: i64) -> (String, String) {
    let rem = secs.rem_euclid(86_400);
    (
        date(secs.div_euclid(86_400)),
        format!("{:02}:{:02}:{:02}", rem / 3_600, rem % 3_600 / 60, rem % 60),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_across_leap_and_century_boundaries() {
        for days in -800_000..800_000 {
            let (year, month, day) = civil_from_days(days);
            assert_eq!(days_from_civil(year, month, day), days, "{days}");
        }
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(days_from_civil(2000, 2, 29), 11_016);
        assert_eq!(civil_from_days(-1), (1969, 12, 31));
    }

    #[test]
    fn formats_seconds_and_milliseconds_as_utc_iso8601() {
        assert_eq!(iso8601_secs(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601_secs(951_825_599), "2000-02-29T11:59:59Z");
        assert_eq!(iso8601_secs(-1), "1969-12-31T23:59:59Z");
        assert_eq!(
            iso8601_millis(1_600_000_000_443),
            "2020-09-13T12:26:40.443Z"
        );
        assert_eq!(iso8601_millis(-1), "1969-12-31T23:59:59.999Z");
    }
}

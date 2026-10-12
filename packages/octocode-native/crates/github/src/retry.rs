//! Retry timing shared by every HTTP client: response headers, the
//! provider-requested delay, and full-jitter backoff.
use reqwest::header::{HeaderMap, RETRY_AFTER};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// A header's non-negative integer value, surrounding whitespace ignored.
pub(crate) fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.trim().parse().ok()
}

fn header_seconds(headers: &HeaderMap, name: &str) -> Option<f64> {
    headers
        .get(name)?
        .to_str()
        .ok()?
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite() && *value >= 0.0)
}

/// Provider-requested delay: `retry-after-ms`, then `Retry-After` as
/// delta-seconds or an RFC 9110 HTTP-date (relative to `now`), each bounded
/// by `max`.
pub fn retry_after_delay(headers: &HeaderMap, max: Duration, now: SystemTime) -> Option<Duration> {
    if let Some(milliseconds) = header_seconds(headers, "retry-after-ms") {
        return Some(Duration::from_secs_f64(
            (milliseconds / 1000.0).min(max.as_secs_f64()),
        ));
    }
    if let Some(seconds) = header_seconds(headers, RETRY_AFTER.as_str()) {
        return Some(Duration::from_secs_f64(seconds.min(max.as_secs_f64())));
    }
    let date = parse_http_date(headers.get(RETRY_AFTER)?.to_str().ok()?)?;
    Some(date.duration_since(now).unwrap_or(Duration::ZERO).min(max))
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's
/// `days_from_civil`). `month` is 1-based.
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Parse an RFC 9110 IMF-fixdate (`Sun, 06 Nov 1994 08:49:37 GMT`).
fn parse_http_date(value: &str) -> Option<SystemTime> {
    let (_, rest) = value.trim().split_once(", ")?;
    let mut parts = rest.split_ascii_whitespace();
    let day = parts.next()?.parse::<i64>().ok()?;
    let month_name = parts.next()?;
    let month = 1 + [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    .iter()
    .position(|name| *name == month_name)? as i64;
    let year = parts.next()?.parse::<i64>().ok()?;
    let mut clock = parts.next()?.split(':').map(str::parse::<i64>);
    let (hour, minute, second) = (
        clock.next()?.ok()?,
        clock.next()?.ok()?,
        clock.next()?.ok()?,
    );
    if parts.next()? != "GMT"
        || parts.next().is_some()
        || !(1..=31).contains(&day)
        || !(0..24).contains(&hour)
        || !(0..60).contains(&minute)
        || !(0..=60).contains(&second)
    {
        return None;
    }
    let seconds = days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second;
    SystemTime::UNIX_EPOCH.checked_add(Duration::from_secs(u64::try_from(seconds).ok()?))
}

/// Full-jitter exponential backoff: uniform in `[0, base * 2^attempt]`,
/// bounded by `cap`.
pub fn full_jitter(base: Duration, attempt: u32, cap: Duration) -> Duration {
    let ceiling = base
        .saturating_mul(1_u32 << attempt.min(16))
        .min(cap)
        .as_millis() as u64;
    if ceiling == 0 {
        return Duration::ZERO;
    }
    let mut bytes = [0_u8; 8];
    let random = if getrandom::fill(&mut bytes).is_ok() {
        u64::from_le_bytes(bytes)
    } else {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.subsec_nanos() as u64)
            .unwrap_or(0)
    };
    Duration::from_millis(random % (ceiling + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::HeaderValue;

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.insert(*name, HeaderValue::from_str(value).expect("header"));
        }
        headers
    }

    #[test]
    fn integer_headers_ignore_surrounding_whitespace() {
        let map = headers(&[("x-ratelimit-reset", " 42 "), ("x-bad", "4.2")]);
        assert_eq!(header_u64(&map, "x-ratelimit-reset"), Some(42));
        assert_eq!(header_u64(&map, "x-bad"), None);
        assert_eq!(header_u64(&map, "x-missing"), None);
    }

    #[test]
    fn retry_delay_prefers_milliseconds_then_seconds_and_is_bounded() {
        let max = Duration::from_secs(60);
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(784_111_777); // Sun, 06 Nov 1994 08:49:37 GMT
        let both = headers(&[("retry-after-ms", "1500"), ("retry-after", "9")]);
        assert_eq!(
            retry_after_delay(&both, max, now),
            Some(Duration::from_millis(1500))
        );
        let seconds = headers(&[("retry-after", " 2 ")]);
        assert_eq!(
            retry_after_delay(&seconds, max, now),
            Some(Duration::from_secs(2))
        );
        let huge = headers(&[("retry-after", "1e300")]);
        assert_eq!(retry_after_delay(&huge, max, now), Some(max));
        for invalid in ["-1", "NaN", "soon", "Sun, 06 Nov 1994 25:00:00 GMT", ""] {
            let map = headers(&[("retry-after", invalid)]);
            assert_eq!(retry_after_delay(&map, max, now), None, "{invalid}");
        }
        assert_eq!(retry_after_delay(&HeaderMap::new(), max, now), None);
    }

    #[test]
    fn retry_after_accepts_an_http_date_relative_to_now() {
        let max = Duration::from_secs(24 * 60 * 60);
        let now = SystemTime::UNIX_EPOCH + Duration::from_secs(784_111_777);
        let date = headers(&[("retry-after", "Sun, 06 Nov 1994 08:50:07 GMT")]);
        assert_eq!(
            retry_after_delay(&date, max, now),
            Some(Duration::from_secs(30))
        );
        // A date in the past means "now"; a far-future date is bounded.
        let past = headers(&[("retry-after", "Sat, 05 Nov 1994 08:49:37 GMT")]);
        assert_eq!(retry_after_delay(&past, max, now), Some(Duration::ZERO));
        let far = headers(&[("retry-after", "Fri, 31 Dec 9999 23:59:59 GMT")]);
        assert_eq!(
            retry_after_delay(&far, max, SystemTime::UNIX_EPOCH),
            Some(max)
        );
        assert_eq!(
            parse_http_date("Thu, 01 Jan 1970 00:00:00 GMT"),
            Some(SystemTime::UNIX_EPOCH)
        );
        assert_eq!(
            parse_http_date("Tue, 29 Feb 2028 12:00:00 GMT"),
            Some(SystemTime::UNIX_EPOCH + Duration::from_secs(1_835_438_400))
        );
    }

    #[test]
    fn full_jitter_stays_within_bounds() {
        let base = Duration::from_millis(100);
        let cap = Duration::from_millis(1000);
        for attempt in 0..8 {
            let ceiling = (base * (1 << attempt)).min(cap);
            for _ in 0..50 {
                assert!(full_jitter(base, attempt, cap) <= ceiling);
            }
        }
        assert_eq!(
            full_jitter(Duration::ZERO, 3, Duration::from_secs(1)),
            Duration::ZERO
        );
    }
}

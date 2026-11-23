//! Parse human durations such as "90s", "5m" or "250ms".

use std::time::Duration;

/// Parses a whole number followed by `ms`, `s` or `m`.
pub fn parse_duration(text: &str) -> Option<Duration> {
    let text = text.trim();
    let (digits, unit) = if let Some(rest) = text.strip_suffix("ms") {
        (rest, "ms")
    } else if let Some(rest) = text.strip_suffix('s') {
        (rest, "s")
    } else if let Some(rest) = text.strip_suffix('m') {
        (rest, "m")
    } else {
        return None;
    };
    let value: u64 = digits.parse().ok()?;
    match unit {
        "ms" => Some(Duration::from_millis(value)),
        "s" => Some(Duration::from_secs(value)),
        _ => Some(Duration::from_secs(value * 60)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_seconds() {
        assert_eq!(parse_duration("90s"), Some(Duration::from_secs(90)));
    }

    #[test]
    fn parses_minutes() {
        assert_eq!(parse_duration("5m"), Some(Duration::from_secs(300)));
    }

    #[test]
    fn parses_milliseconds() {
        assert_eq!(parse_duration("250ms"), Some(Duration::from_millis(250)));
    }
}

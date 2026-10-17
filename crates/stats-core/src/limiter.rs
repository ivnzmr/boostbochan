use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Riot development/personal key limits: 20 req / 1 s and 100 req / 2 min.
pub const DEFAULT_WINDOWS: &[(usize, Duration)] = &[
    (20, Duration::from_secs(1)),
    (100, Duration::from_secs(120)),
];

/// How long to wait before another request fits in every window.
pub fn next_wait(hits: &VecDeque<Instant>, now: Instant, windows: &[(usize, Duration)]) -> Duration {
    windows
        .iter()
        .filter_map(|&(limit, span)| {
            let in_window: Vec<&Instant> =
                hits.iter().filter(|t| now.duration_since(**t) < span).collect();
            (in_window.len() >= limit).then(|| {
                // The oldest hit that must expire before we're under the limit.
                let blocker = in_window[in_window.len() - limit];
                (*blocker + span).saturating_duration_since(now)
            })
        })
        .max()
        .unwrap_or(Duration::ZERO)
}

pub struct RateLimiter {
    windows: Vec<(usize, Duration)>,
    hits: Mutex<VecDeque<Instant>>,
}

impl RateLimiter {
    pub fn new(windows: &[(usize, Duration)]) -> Self {
        Self {
            windows: windows.to_vec(),
            hits: Mutex::new(VecDeque::new()),
        }
    }

    pub async fn acquire(&self) {
        let longest = self.windows.iter().map(|w| w.1).max().unwrap_or_default();
        loop {
            let wait = {
                let mut hits = self.hits.lock().expect("limiter poisoned");
                let now = Instant::now();
                while hits.front().is_some_and(|t| now.duration_since(*t) >= longest) {
                    hits.pop_front();
                }
                let wait = next_wait(&hits, now, &self.windows);
                if wait.is_zero() {
                    hits.push_back(now);
                    return;
                }
                wait
            };
            tokio::time::sleep(wait + Duration::from_millis(5)).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOWS: &[(usize, Duration)] = &[(2, Duration::from_secs(1)), (3, Duration::from_secs(10))];

    #[test]
    fn no_wait_when_under_limits() {
        let now = Instant::now();
        let hits = VecDeque::from(vec![now]);
        assert_eq!(next_wait(&hits, now, WINDOWS), Duration::ZERO);
    }

    #[test]
    fn waits_for_short_window() {
        let now = Instant::now();
        let hits = VecDeque::from(vec![now - Duration::from_millis(400), now - Duration::from_millis(100)]);
        assert_eq!(next_wait(&hits, now, WINDOWS), Duration::from_millis(600));
    }

    #[test]
    fn waits_for_long_window() {
        let now = Instant::now();
        let hits = VecDeque::from(vec![
            now - Duration::from_secs(8),
            now - Duration::from_secs(5),
            now - Duration::from_secs(2),
        ]);
        assert_eq!(next_wait(&hits, now, WINDOWS), Duration::from_secs(2));
    }

    #[test]
    fn expired_hits_are_ignored() {
        let now = Instant::now();
        let hits = VecDeque::from(vec![now - Duration::from_secs(30), now - Duration::from_secs(20)]);
        assert_eq!(next_wait(&hits, now, WINDOWS), Duration::ZERO);
    }
}

/// GitHub repository that publishes statistics and app updates.
/// Overridable at build time with BB_STATS_URL (useful for testing a local server).
pub const STATS_URL: &str = match option_env!("BB_STATS_URL") {
    Some(url) => url,
    None => "https://github.com/ivnzmr/boostbochan/releases/download/data/stats.json.gz",
};

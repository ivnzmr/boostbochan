const KEY_PREFIX: &str = "RGAPI-";
const KEY_LEN: usize = 42; // "RGAPI-" + 36-char UUID

pub fn is_valid_format(key: &str) -> bool {
    key.len() == KEY_LEN
        && key.starts_with(KEY_PREFIX)
        && key[KEY_PREFIX.len()..]
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_key_format() {
        assert!(is_valid_format("RGAPI-00000000-1111-2222-3333-444444444444"));
        assert!(!is_valid_format("RGAPI-short"));
        assert!(!is_valid_format("XXXXX-00000000-1111-2222-3333-444444444444"));
        assert!(!is_valid_format("RGAPI-00000000-1111-2222-3333-4444444444zz"));
    }
}

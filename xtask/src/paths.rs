use std::path::PathBuf;

pub fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask has a parent")
        .to_path_buf()
}

pub fn dist() -> PathBuf {
    root().join("dist")
}

pub fn extension() -> PathBuf {
    root().join("extension")
}

//! Build the unpacked extension into `dist/`.
//!
//! Static files come from `extension/`; the background worker is Rust compiled to
//! Wasm. Firefox replaces the service worker with a background event page.

use std::path::Path;
use std::process::Command;

use crate::paths;

pub fn run(args: &[String]) -> Result<(), String> {
    let release = args.iter().any(|arg| arg == "--release");
    let firefox = args
        .windows(2)
        .any(|pair| pair[0] == "--browser" && pair[1] == "firefox");
    let root = paths::root();
    let dist = paths::dist();

    if dist.exists() {
        std::fs::remove_dir_all(&dist).map_err(|error| format!("{}: {error}", dist.display()))?;
    }
    copy_dir(&paths::extension(), &dist)?;

    let profile = if release { "release" } else { "debug" };
    let mut args = vec![
        "build",
        "-p",
        "hammock-reader-bg",
        "--target",
        "wasm32-unknown-unknown",
    ];
    if release {
        args.push("--release");
    }
    run_cargo(&args, "cargo build (wasm)")?;

    let wasm = root
        .join("target")
        .join("wasm32-unknown-unknown")
        .join(profile)
        .join("hammock_reader_bg.wasm");
    if !wasm.exists() {
        return Err(format!("missing {}", wasm.display()));
    }

    let out = dist.join("pkg");
    std::fs::create_dir_all(&out).map_err(|error| error.to_string())?;
    let status = Command::new("wasm-bindgen")
        .arg("--target")
        .arg("web")
        .arg("--no-typescript")
        .arg("--out-dir")
        .arg(&out)
        .arg(&wasm)
        .status()
        .map_err(|error| {
            format!(
                "wasm-bindgen not found ({}): {error}",
                "cargo install wasm-bindgen-cli --version 0.2.129"
            )
        })?;
    if !status.success() {
        return Err("wasm-bindgen failed".to_string());
    }

    if firefox {
        write_firefox_manifest(&dist)?;
    }
    println!("build: {}", dist.display());
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(from)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Firefox MV3 uses `background.scripts`. Keep one source manifest and rewrite it.
fn write_firefox_manifest(dist: &Path) -> Result<(), String> {
    let path = dist.join("manifest.json");
    let text = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut json: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| format!("manifest: {error}"))?;
    json["background"] = serde_json::json!({ "scripts": ["background.js"] });
    json["browser_specific_settings"] =
        serde_json::json!({ "gecko": { "id": "reader@hammock", "strict_min_version": "140.0" } });
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&json).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn run_cargo(args: &[&str], label: &str) -> Result<(), String> {
    let status = Command::new("cargo")
        .args(args)
        .current_dir(paths::root())
        .status()
        .map_err(|error| format!("{label}: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{label} failed"))
    }
}

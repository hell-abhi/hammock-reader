//! The gate from AGENTS.md: formatting, lints, tests, and the rule scan.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::paths;

/// The frozen permission list. Changing it needs the owner's approval in AGENTS.md.
const ALLOWED_PERMISSIONS: &[&str] = &[
    "activeTab",
    "tabs",
    "scripting",
    "storage",
    "unlimitedStorage",
    "pageCapture",
    "offscreen",
    "downloads",
];

/// Firefox has no pageCapture, so its build is the only one allowed host access.
const ALLOWED_HOSTS: &[&str] = &["<all_urls>"];

/// Network APIs that extension code must never call.
const FORBIDDEN_CALLS: &[&str] = &["XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"];

pub fn run(args: &[String]) -> Result<(), String> {
    let skip_tests = args.iter().any(|arg| arg == "--no-test");
    fmt()?;
    clippy()?;
    if !skip_tests {
        test()?;
    }
    scan_network_calls()?;
    check_manifest(&paths::extension().join("manifest.json"), false)?;
    check_firefox_manifest()?;
    println!("check: all gates pass");
    Ok(())
}

fn fmt() -> Result<(), String> {
    run_cargo(&["fmt", "--all", "--", "--check"], "cargo fmt")
}

fn clippy() -> Result<(), String> {
    run_cargo(
        &[
            "clippy",
            "--workspace",
            "--all-targets",
            "--",
            "-D",
            "warnings",
        ],
        "cargo clippy (native)",
    )?;
    // Only crates that ship in the extension are built for wasm32; xtask is a host tool.
    run_cargo(
        &[
            "clippy",
            "-p",
            "hammock-reader-core",
            "-p",
            "hammock-reader-bg",
            "--all-targets",
            "--target",
            "wasm32-unknown-unknown",
            "--",
            "-D",
            "warnings",
        ],
        "cargo clippy (wasm32)",
    )
}

fn test() -> Result<(), String> {
    run_cargo(&["test", "--workspace"], "cargo test")
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

/// Scan shipped code for network APIs. `spike/` is a throwaway harness and is skipped.
fn scan_network_calls() -> Result<(), String> {
    let mut hits = Vec::new();
    for dir in ["crates", "extension"] {
        walk(&paths::root().join(dir), &mut hits)?;
    }
    let mut problems = Vec::new();
    for file in hits {
        let Ok(text) = std::fs::read_to_string(&file) else {
            continue;
        };
        for pattern in FORBIDDEN_CALLS {
            if text.contains(pattern) {
                problems.push(format!("{}: {pattern}", file.display()));
            }
        }
        if is_shipped_js(&file) && contains_fetch_call(&text) {
            problems.push(format!("{}: fetch(", file.display()));
        }
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "network calls are not allowed:\n  {}",
            problems.join("\n  ")
        ))
    }
}

fn is_shipped_js(path: &Path) -> bool {
    // AGENTS.md allows exactly one network call site: Firefox's save-time resource
    // fetch, because that browser has no pageCapture API.
    let allowed = path.file_name().and_then(|name| name.to_str()) == Some("firefox-capture.js");
    !allowed
        && matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("js") | Some("mjs")
        )
}

/// `fetch(` but not `prefetch(` / `refetch(`.
fn contains_fetch_call(text: &str) -> bool {
    text.match_indices("fetch(").any(|(index, _)| {
        let before = &text[..index];
        !before.ends_with("pre") && !before.ends_with("re") && !before.ends_with("_")
    })
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|error| format!("{}: {error}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == "target" || name == "node_modules" || name == "tests" {
            continue;
        }
        if path.is_dir() {
            walk(&path, out)?;
        } else if matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("rs") | Some("js") | Some("mjs") | Some("html")
        ) {
            out.push(path);
        }
    }
    Ok(())
}

fn check_manifest(path: &Path, firefox: bool) -> Result<(), String> {
    let text =
        std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("manifest.json is not valid JSON: {error}"))?;
    let mut problems = Vec::new();

    if let Some(list) = json.get("permissions").and_then(|value| value.as_array()) {
        for entry in list.iter().filter_map(|entry| entry.as_str()) {
            if !ALLOWED_PERMISSIONS.contains(&entry) {
                problems.push(format!("permissions: {entry}"));
            }
        }
    }

    if let Some(list) = json
        .get("host_permissions")
        .and_then(|value| value.as_array())
    {
        if !firefox {
            problems.push("host_permissions must not ship in the Chrome build".to_string());
        }
        for entry in list.iter().filter_map(|entry| entry.as_str()) {
            if !ALLOWED_HOSTS.contains(&entry) {
                problems.push(format!("host_permissions: {entry}"));
            }
        }
    }

    if let Some(list) = json
        .get("optional_permissions")
        .and_then(|value| value.as_array())
    {
        for entry in list.iter().filter_map(|entry| entry.as_str()) {
            if !ALLOWED_HOSTS.contains(&entry) {
                problems.push(format!("optional_permissions: {entry}"));
            }
        }
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "manifest permissions are frozen (see AGENTS.md); unexpected:\n  {}\n\
             Change AGENTS.md first if a new permission is genuinely required.",
            problems.join("\n  ")
        ))
    }
}

/// Build the Firefox manifest and check it too, so the host permission cannot
/// spread to Chrome by accident.
fn check_firefox_manifest() -> Result<(), String> {
    let dir = std::env::temp_dir().join(format!("hammock-reader-manifest-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let _ = std::fs::copy(
        paths::extension().join("manifest.json"),
        dir.join("manifest.json"),
    );
    let result = crate::build::firefox_manifest_json(&dir).and_then(|json| {
        let path = dir.join("manifest.json");
        std::fs::write(
            &path,
            serde_json::to_string_pretty(&json).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        check_manifest(&path, true)
    });
    let _ = std::fs::remove_dir_all(&dir);
    result
}

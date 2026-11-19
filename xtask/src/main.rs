//! Build and gate tooling. `check` is the gate AGENTS.md references; `build`
//! assembles an unpacked extension into `dist/`.

mod build;
mod check;
mod paths;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map(String::as_str).unwrap_or("help");
    let rest = &args[1..];
    let result = match command {
        "check" => check::run(rest),
        "build" => build::run(rest),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        other => Err(format!("unknown command: {other}")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("xtask: {message}");
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    println!(
        "cargo xtask <command>\n\n  check [--no-test]   fmt, clippy, tests, rule scan\n  build [--release] [--browser firefox]   build dist/"
    );
}

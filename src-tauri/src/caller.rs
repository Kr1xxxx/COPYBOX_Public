// Which program is asking over the command line door (D-059). The socket tells us the process id of whatever connected
// (that is the `clipbox` command itself); the program the person thinks of — codex, a terminal, an editor — is the
// first ancestor that is not a shell or a pass-through launcher. 「始终允许」 remembers that program by where its file
// is on disk (plus the script it runs, for node or python), so another program is still asked.
//
// This is a convenience, not a lock: any program running as this user could start that same program itself, or
// replace its file if it sits in a folder the user can write to. The window still says what was allowed (toast).
use std::path::Path;

/// One process on the way up from the socket to the program that asked.
#[derive(Clone, Debug, PartialEq)]
pub struct Proc {
    pub parent: u32,
    /// The executable file, as the system reports it.
    pub exe: String,
    /// The command line (first entry is the name it was started as).
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Caller {
    /// Short name shown in the question and in 设置, e.g. "codex".
    pub name: String,
    /// What is remembered: the executable path, and for a script runtime also the script.
    pub id: String,
}

/// Programs that only start another one: the caller is above them.
const PASS_THROUGH: &[&str] = &[
    "sh", "bash", "zsh", "dash", "fish", "ksh", "tcsh", "csh", "env", "login", "sandbox-exec", "nohup", "timeout", "xargs",
];
/// Programs that run a script: the script tells programs apart, not the runtime.
const RUNTIMES: &[&str] = &["node", "bun", "deno", "ruby", "perl", "python", "python3"];
/// Folder names too generic to name a program by (…/codex/bin/cli.js is "codex").
const GENERIC: &[&str] = &["cli", "index", "main", "run", "bin", "dist", "lib", "build", "src", "out", "vendor"];
/// Never remembered: the system's first process, which every program descends from.
const ROOTS: &[&str] = &["launchd", "init", "systemd"];
const MAX_DEPTH: usize = 16;

fn base_name(path: &str) -> String {
    let trimmed = path.trim_start_matches('-');
    Path::new(trimmed).file_name().and_then(|n| n.to_str()).unwrap_or(trimmed).to_string()
}

fn is_runtime(name: &str) -> bool {
    RUNTIMES.contains(&name) || (name.starts_with("python") && name[6..].chars().all(|c| c.is_ascii_digit() || c == '.'))
}

/// The script a runtime runs: its first argument that is not an option.
fn script_of(args: &[String]) -> Option<&str> {
    args.iter().skip(1).map(String::as_str).find(|arg| !arg.is_empty() && !arg.starts_with('-'))
}

/// A readable name for a file: "Codex" for anything inside Codex.app, else the file name without its extension,
/// or the nearest folder that says more than "bin" or "index".
fn display_name(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    if let Some(app) = parts.iter().find(|p| p.ends_with(".app")) {
        return app.trim_end_matches(".app").to_string();
    }
    let mut candidates = parts.iter().rev().map(|p| p.split('.').next().unwrap_or(p));
    let first = candidates.next().unwrap_or("").to_string();
    if !GENERIC.contains(&first.as_str()) {
        return first;
    }
    candidates.find(|p| !GENERIC.contains(p) && !p.is_empty() && !p.starts_with('@')).map(str::to_string).unwrap_or(first)
}

/// The program that asked, given the processes from the socket's peer upwards (`chain[0]` is the peer itself).
pub fn pick_caller(chain: &[Proc]) -> Option<Caller> {
    // chain[0] is the `clipbox` command that opened the socket; who started it is the caller.
    for process in chain.iter().skip(1) {
        let exe_name = base_name(&process.exe);
        let started_as = process.args.first().map(|a| base_name(a)).unwrap_or_default();
        if PASS_THROUGH.contains(&exe_name.as_str()) || PASS_THROUGH.contains(&started_as.as_str()) {
            continue;
        }
        if ROOTS.contains(&exe_name.as_str()) || process.exe.is_empty() {
            return None;
        }
        if is_runtime(&exe_name) {
            let script = script_of(&process.args)?;
            return Some(Caller { name: display_name(script), id: format!("{} {}", process.exe, script) });
        }
        return Some(Caller { name: display_name(&process.exe), id: process.exe.clone() });
    }
    None
}

/// Walks up from `pid` with `read` (one process's details, or None when it cannot be read) and picks the caller.
pub fn identify_with(pid: u32, read: impl Fn(u32) -> Option<Proc>) -> Option<Caller> {
    let mut chain = Vec::new();
    let mut next = pid;
    while next > 1 && chain.len() < MAX_DEPTH {
        // One we cannot read (gone, or another user's): decide from what was read so far.
        let Some(process) = read(next) else { break };
        next = process.parent;
        chain.push(process);
    }
    pick_caller(&chain)
}

#[cfg(target_os = "linux")]
fn read_process(pid: u32) -> Option<Proc> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // "pid (name) state ppid …": the name may hold spaces or brackets, so read after the last ')'.
    let parent = stat.rsplit_once(')')?.1.split_whitespace().nth(1)?.parse().ok()?;
    let exe = std::fs::read_link(format!("/proc/{pid}/exe")).ok()?.to_string_lossy().into_owned();
    let raw = std::fs::read(format!("/proc/{pid}/cmdline")).unwrap_or_default();
    let args = raw.split(|b| *b == 0).filter(|a| !a.is_empty()).map(|a| String::from_utf8_lossy(a).into_owned()).collect();
    Some(Proc { parent, exe, args })
}

#[cfg(target_os = "macos")]
fn read_process(pid: u32) -> Option<Proc> {
    extern "C" {
        // libproc (part of the system library): the full path of a process's executable file.
        fn proc_pidpath(pid: i32, buffer: *mut std::ffi::c_void, size: u32) -> i32;
    }
    let mut buffer = vec![0u8; 4096];
    // SAFETY: the buffer is 4096 bytes (PROC_PIDPATHINFO_MAXSIZE) and the call writes at most that many.
    let written = unsafe { proc_pidpath(pid as i32, buffer.as_mut_ptr().cast(), buffer.len() as u32) };
    if written <= 0 {
        return None;
    }
    let exe = String::from_utf8_lossy(&buffer[..written as usize]).into_owned();
    let ps = |field: &str| {
        let out = std::process::Command::new("/bin/ps").args(["-ww", "-o", field, "-p", &pid.to_string()]).output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
    };
    let parent = ps("ppid=")?.parse().ok()?;
    // ps joins the arguments with spaces; good enough to find a script path without spaces in it.
    let args = ps("args=").unwrap_or_default().split_whitespace().map(str::to_string).collect();
    Some(Proc { parent, exe, args })
}

/// The program behind the process `pid`, or None when it cannot be told.
#[cfg(any(target_os = "linux", target_os = "macos"))]
pub fn identify(pid: u32) -> Option<Caller> {
    identify_with(pid, read_process)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(parent: u32, exe: &str, args: &[&str]) -> Proc {
        Proc { parent, exe: exe.into(), args: args.iter().map(|a| a.to_string()).collect() }
    }

    #[test]
    fn codex_running_the_command_through_a_shell_is_the_caller() {
        let chain = [
            proc(20, "/opt/homebrew/bin/node", &["node", "/Users/a/.local/bin/clipbox", "secret-get", "x"]),
            proc(10, "/bin/zsh", &["/bin/zsh", "-lc", "clipbox secret-get x"]),
            proc(5, "/usr/bin/sandbox-exec", &["sandbox-exec", "-p", "…"]),
            proc(1, "/opt/homebrew/lib/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex", &["codex"]),
        ];
        let caller = pick_caller(&chain).unwrap();
        assert_eq!(caller.name, "codex");
        assert_eq!(caller.id, "/opt/homebrew/lib/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex");
    }

    #[test]
    fn a_program_inside_an_app_is_named_after_the_app() {
        let chain = [
            proc(9, "/usr/local/bin/node", &["node", "clipbox"]),
            proc(8, "/bin/zsh", &["-zsh"]),
            proc(7, "/usr/bin/login", &["login", "-pf", "a"]),
            proc(1, "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal", &["Terminal"]),
        ];
        assert_eq!(pick_caller(&chain).unwrap().name, "Terminal");
    }

    #[test]
    fn a_node_program_is_told_apart_by_its_script() {
        let chain = [
            proc(9, "/usr/bin/node", &["node", "/home/a/.local/bin/clipbox"]),
            proc(8, "/bin/bash", &["bash", "-c", "clipbox secret-get x"]),
            proc(1, "/usr/bin/node", &["node", "--no-warnings", "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js"]),
        ];
        let caller = pick_caller(&chain).unwrap();
        assert_eq!(caller.name, "claude-code");
        assert_eq!(caller.id, "/usr/bin/node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js");
        // Another script on the same node is another program.
        let other = [chain[0].clone(), chain[1].clone(), proc(1, "/usr/bin/node", &["node", "/tmp/grab.js"])];
        let other = pick_caller(&other).unwrap();
        assert_eq!(other.name, "grab");
        assert_ne!(other.id, caller.id);
        // A runtime with no script (an interactive node) cannot be remembered.
        let bare = [chain[0].clone(), proc(1, "/usr/bin/node", &["node"])];
        assert_eq!(pick_caller(&bare), None);
        assert_eq!(display_name("/x/@openai/codex/bin/codex.js"), "codex");
        assert!(is_runtime("python3.12") && !is_runtime("pythonista"));
    }

    #[test]
    fn nothing_is_remembered_when_only_the_system_is_above() {
        let chain = [proc(9, "/usr/bin/node", &["node", "clipbox"]), proc(1, "/bin/sh", &["sh"]), proc(0, "/sbin/launchd", &["launchd"])];
        assert_eq!(pick_caller(&chain), None);
        assert_eq!(pick_caller(&chain[..1]), None);
    }

    #[test]
    fn walking_up_stops_at_the_first_process_and_when_one_is_gone() {
        let table = |pid: u32| match pid {
            30 => Some(proc(20, "/usr/bin/node", &["node", "clipbox"])),
            20 => Some(proc(10, "/bin/zsh", &["zsh"])),
            10 => Some(proc(1, "/Applications/Codex.app/Contents/Resources/codex", &["codex"])),
            _ => None,
        };
        assert_eq!(identify_with(30, table).unwrap().name, "Codex");
        // A process that vanished half way: nobody is named.
        assert_eq!(identify_with(30, |pid| if pid == 30 { table(30) } else { None }), None);
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn this_process_can_be_read() {
        let me = read_process(std::process::id()).unwrap();
        assert_eq!(std::path::Path::new(&me.exe), std::env::current_exe().unwrap());
        assert!(me.parent > 0);
    }
}

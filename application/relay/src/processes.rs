//! Windows' processes, as the relay reads them: a snapshot of every process's parent and
//! program, when each started, and a process tree that trusts no recorded parent older
//! than its child. The runner ends a terminal's programs through it (`tree`, then `end`),
//! where Windows has no process group to signal and a dead parent's pid may name another.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;

use serde_json::{Value, json};

const SNAPSHOT_PROCESSES: u32 = 0x2;
const INVALID_HANDLE: *mut c_void = -1isize as *mut c_void;
const QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const TERMINATE: u32 = 0x1;
/// FILETIME's epoch, 1601, before Unix's, in milliseconds.
const FILETIME_TO_UNIX_MS: u64 = 11_644_473_600_000;

/// Kernel32's PROCESSENTRY32W.
#[repr(C)]
struct Entry {
    size: u32,
    usage: u32,
    pid: u32,
    heap: usize,
    module: u32,
    threads: u32,
    parent: u32,
    priority: i32,
    flags: u32,
    file: [u16; 260],
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct FileTime {
    low: u32,
    high: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
    fn Process32FirstW(snapshot: *mut c_void, entry: *mut Entry) -> i32;
    fn Process32NextW(snapshot: *mut c_void, entry: *mut Entry) -> i32;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
    fn GetProcessTimes(
        process: *mut c_void,
        created: *mut FileTime,
        exited: *mut FileTime,
        kernel: *mut FileTime,
        user: *mut FileTime,
    ) -> i32;
    fn TerminateProcess(process: *mut c_void, code: u32) -> i32;
    fn CloseHandle(handle: *mut c_void) -> i32;
}

/// A process as the snapshot found it: its program's file name and its recorded parent.
pub struct Process {
    pub file: String,
    pub parent: u32,
}

/// Every process's program file name and parent, by its pid; empty where Windows refuses
/// the snapshot.
pub fn snapshot() -> HashMap<u32, Process> {
    let mut processes = HashMap::new();
    let snapshot = unsafe { CreateToolhelp32Snapshot(SNAPSHOT_PROCESSES, 0) };
    if snapshot.is_null() || snapshot == INVALID_HANDLE {
        return processes;
    }
    let mut entry = Entry {
        size: size_of::<Entry>() as u32,
        usage: 0,
        pid: 0,
        heap: 0,
        module: 0,
        threads: 0,
        parent: 0,
        priority: 0,
        flags: 0,
        file: [0; 260],
    };
    let mut more = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while more {
        let length = entry.file.iter().position(|unit| *unit == 0).unwrap_or(260);
        let file = String::from_utf16_lossy(&entry.file[..length]);
        processes.insert(
            entry.pid,
            Process {
                file,
                parent: entry.parent,
            },
        );
        more = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    processes
}

/// A process opened with `access`, closed when dropped.
struct Handle(*mut c_void);

impl Handle {
    fn open(pid: u32, access: u32) -> Option<Handle> {
        let handle = unsafe { OpenProcess(access, 0, pid) };
        (!handle.is_null()).then_some(Handle(handle))
    }

    /// When the process started, in whole milliseconds since the Unix epoch.
    fn started(&self) -> Option<u64> {
        let mut created = FileTime::default();
        let mut other = [FileTime::default(); 3];
        let [exited, kernel, user] = &mut other;
        let read = unsafe { GetProcessTimes(self.0, &mut created, exited, kernel, user) };
        if read == 0 {
            return None;
        }
        let ticks = (u64::from(created.high) << 32) | u64::from(created.low);
        (ticks / 10_000).checked_sub(FILETIME_TO_UNIX_MS)
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

/// When process `pid` started, in milliseconds since the Unix epoch; None where it is gone
/// or Windows won't say, as for another user's.
pub fn started(pid: u32) -> Option<u64> {
    Handle::open(pid, QUERY_LIMITED_INFORMATION)?.started()
}

/// A process of a tree: its pid and when it started, which together name it alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Member {
    pub pid: u32,
    pub started: u64,
}

/// The tree under `root`, root first, from the processes' recorded parents and starts: a
/// process counts as a child only if it started no earlier than its parent did, as one
/// whose parent has ended may record a pid that now names an older, unrelated process.
/// Empty where the root itself is gone. `started` is for tests.
pub fn tree(
    root: u32,
    parents: &HashMap<u32, u32>,
    started: &impl Fn(u32) -> Option<u64>,
) -> Vec<Member> {
    let Some(start) = started(root) else {
        return Vec::new();
    };
    let mut found = vec![Member {
        pid: root,
        started: start,
    }];
    let mut next = 0;
    while next < found.len() {
        let parent = found[next];
        next += 1;
        for (&pid, &recorded) in parents {
            if recorded != parent.pid || pid == parent.pid || found.iter().any(|m| m.pid == pid) {
                continue;
            }
            if let Some(start) = started(pid).filter(|start| *start >= parent.started) {
                found.push(Member {
                    pid,
                    started: start,
                });
            }
        }
    }
    found
}

/// `novadeck-relay tree <pid>...`: each root's tree, as JSON, a line for each root:
/// `{"root":<pid>,"processes":[{"pid":<pid>,"startedAt":<ms>},...]}`, root first.
pub fn print_trees(roots: &[u32]) {
    let parents: HashMap<u32, u32> = snapshot()
        .into_iter()
        .map(|(pid, process)| (pid, process.parent))
        .collect();
    for &root in roots {
        let processes: Vec<Value> = tree(root, &parents, &started)
            .into_iter()
            .map(|member| json!({ "pid": member.pid, "startedAt": member.started }))
            .collect();
        println!("{}", json!({ "root": root, "processes": processes }));
    }
}

/// `novadeck-relay end <pid>:<startedAt>...`: ends each process still running that
/// started then, and no other that has its pid since.
pub fn end(members: &[Member]) {
    for member in members {
        let Some(handle) = Handle::open(member.pid, TERMINATE | QUERY_LIMITED_INFORMATION) else {
            continue;
        };
        if handle.started() == Some(member.started) {
            unsafe { TerminateProcess(handle.0, 1) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walks_only_to_children_newer_than_their_parent() {
        // 10 started the shell 11, which started 12; 20 is older than 11 but records it as
        // its parent, as one whose parent died and left 11 to the shell.
        let parents = HashMap::from([(11, 10), (12, 11), (20, 11), (21, 20), (30, 99)]);
        let starts = HashMap::from([(10, 100), (11, 200), (12, 300), (20, 150), (21, 160)]);
        let started = |pid: u32| starts.get(&pid).copied();
        let pids: Vec<u32> = tree(11, &parents, &started).iter().map(|m| m.pid).collect();
        assert_eq!(pids, vec![11, 12]);
        assert!(tree(42, &parents, &started).is_empty());
    }

    #[test]
    fn reads_when_this_process_started() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let mine = started(std::process::id()).unwrap();
        assert!(mine <= now && now - mine < 600_000);
    }

    #[test]
    fn finds_a_tree_it_started_and_ends_it_by_start() {
        let mut child = std::process::Command::new("ping.exe")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let parents: HashMap<u32, u32> = snapshot()
            .into_iter()
            .map(|(pid, process)| (pid, process.parent))
            .collect();
        let mine = tree(std::process::id(), &parents, &started);
        let found = mine.iter().find(|m| m.pid == child.id()).copied().unwrap();
        // A start that isn't its own ends nothing.
        end(&[Member {
            pid: found.pid,
            started: found.started + 1,
        }]);
        assert!(child.try_wait().unwrap().is_none());
        end(&[found]);
        assert!(child.wait().unwrap().code() == Some(1));
    }
}

//! Windows: an older copy (installed under an earlier product name, D-046) that is still running holds the shared
//! single-instance lock, so opening this app would only bring up the old window and look broken. Before the lock is
//! taken, this looks for another `clipbox.exe` running from a different file and, if there is one, says to quit the old
//! one first (D-102). A second launch of this same copy is left to the single-instance plugin as before.

/// True when `path` is our program (`clipbox.exe`, exact case: the Electron app's is `Clipbox.exe`) in another file than
/// `me`. Windows paths ignore case.
pub fn is_other_copy(path: &str, me: &str) -> bool {
    path.rsplit(['\\', '/']).next() == Some(crate::old_autostart::PROGRAM) && !path.eq_ignore_ascii_case(me)
}

/// Shows the message and returns true when an older copy is running; this launch should then stop.
#[cfg(windows)]
pub fn warn_if_running() -> bool {
    use windows::core::{w, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::System::Threading::{GetCurrentProcess, GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};

    fn image_path(process: HANDLE) -> Option<String> {
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        unsafe { QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut size) }.ok()?;
        Some(String::from_utf16_lossy(&buffer[..size as usize]))
    }

    // Both paths come from the same call, so the same file always gives the same text.
    let Some(me) = image_path(unsafe { GetCurrentProcess() }) else { return false };
    let own = unsafe { GetCurrentProcessId() };
    let Ok(snapshot) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else { return false };
    let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut found = false;
    let mut more = unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok();
    while more && !found {
        let name = &entry.szExeFile[..entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len())];
        if entry.th32ProcessID != own && String::from_utf16_lossy(name) == crate::old_autostart::PROGRAM {
            // Our own user's processes can always be asked for their path; anything else is skipped.
            if let Ok(process) = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, entry.th32ProcessID) } {
                found = image_path(process).is_some_and(|path| is_other_copy(&path, &me));
                let _ = unsafe { CloseHandle(process) };
            }
        }
        more = unsafe { Process32NextW(snapshot, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snapshot) };
    if found {
        unsafe {
            MessageBoxW(
                None,
                w!("旧版 Clipboxx 还开着，新版 Copyboxx 打不开。\n\n请在屏幕右下角的托盘里找到旧版图标，右键点「退出」，再打开 Copyboxx。内容都会保留。"),
                w!("Copyboxx"),
                MB_OK | MB_ICONINFORMATION,
            );
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_our_program_in_another_file_counts() {
        let me = r"C:\Users\A B\AppData\Local\Copyboxx\clipbox.exe";
        assert!(is_other_copy(r"C:\Users\A B\AppData\Local\Clipboxx\clipbox.exe", me));
        assert!(is_other_copy(r"C:\Users\A B\AppData\Local\Clipbox\clipbox.exe", me));
        assert!(!is_other_copy(me, me));
        assert!(!is_other_copy(r"c:\users\a b\appdata\local\copyboxx\clipbox.exe", me));
        // The old Electron app and anything else are never ours.
        assert!(!is_other_copy(r"C:\Users\A B\AppData\Local\Programs\Clipbox\Clipbox.exe", me));
        assert!(!is_other_copy(r"C:\Tools\clipbox.exe.bak", me));
    }
}

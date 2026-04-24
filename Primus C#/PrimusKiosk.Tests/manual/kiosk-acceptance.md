# Primus Kiosk — manual acceptance checklist

Run this on a clean Windows 11 VM (no customisations) after each release candidate.

## Install

- [ ] Installer runs without errors (signed cert verified).
- [ ] `PrimusKiosk.exe` + `PrimusKioskWatchdog.exe` + `PrimusKiosk.Native.dll` land in `%ProgramFiles%\PrimusKiosk\`.
- [ ] `%ProgramData%\PrimusKiosk\recovery\unkiosk.reg` is present.

## First boot

- [ ] After reboot the machine lands on the Primus loading view within <1s.
- [ ] Loading view transitions to Setup view on first run.
- [ ] Entering a valid Azure backend URL + license key registers the device.
- [ ] Restart — kiosk loads directly into Login view (credentials saved).
- [ ] Successful login loads the Session view and game grid.

## Kiosk hardening

- [ ] Alt+Tab is blocked.
- [ ] Win key is blocked.
- [ ] Ctrl+Shift+Esc is blocked.
- [ ] Alt+F4 on kiosk window is blocked.
- [ ] Taskbar is hidden.
- [ ] Second launch is silently rejected (single-instance Mutex).

## Remote commands

- [ ] `lock` → lock overlay appears within 2 s.
- [ ] `unlock` → overlay disappears within 2 s.
- [ ] `message` → toast appears.
- [ ] `add_time` → remaining time increments, toast confirms.
- [ ] `shutdown` → Windows schedules shutdown.
- [ ] `screenshot` → image arrives on `/api/screenshot/` listing.

## Game launch

- [ ] Launch Steam/Epic/local game from the grid.
- [ ] On exit, kiosk regains focus.

## Watchdog

- [ ] Kill `PrimusKiosk.exe` from Task Manager → watchdog restarts it within 5 s.
- [ ] Kill it 5 consecutive times fast → watchdog applies `unkiosk.reg` and reboots.

## Uninstall

- [ ] Uninstaller restores Explorer shell, removes `Run` key, removes auto-boot task.
- [ ] `%ProgramData%\PrimusKiosk\` retained only if user opted in.

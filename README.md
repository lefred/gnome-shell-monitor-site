# Website Monitor

A GNOME Shell 45+ extension that checks one website and displays a colored dot
in the top bar:

- green: available;
- orange: available, but slower than the configured threshold;
- red: unavailable, timed out, or returned an HTTP error.

Monitoring can be paused from a switch in the indicator menu. Pausing or
resuming resets the consecutive-failure counter.

The indicator also opens a separate cascading recent-checks menu beside the
main menu. It shows the status, HTTP result, and response duration for the
latest 10 checks by default. Its position can be set to left, right, or
automatic; left is the default.

After the configured number of consecutive failed checks (three by default), a
large modal alert appears in the center of the screen and the desktop warning
sound is played. A custom MP3 can be selected in the extension preferences.
The sound loops until the alert is dismissed. One alert is shown per outage; a
successful check resets it.

Audible alerts can be disabled independently without disabling the visual
overlay, desktop notification, monitoring, or email alerts.

Monitoring continues while the screen is locked. If an outage reaches the
threshold while locked, the alert sound plays once and the dismissible looping
alert is presented after unlock if the site is still unavailable. Checks cannot
run while the computer is suspended.

Optional email alerts can be configured with an SMTP server, connection
security, credentials, sender, and one or more recipients. One email is sent
when an outage reaches the failure threshold; recovery resets the notification.
SMTP delivery uses `curl`. The SMTP password is stored unencrypted in the
extension's local GSettings, so an app-specific password is recommended.

Custom MP3 playback uses GStreamer 1.0 and requires an installed MP3 decoder
plugin (provided by `gst-plugins-good` on Fedora).

The alert overlay and selected sound can be tested from the Alert sound section
of the extension preferences.

## Install

```sh
make package
gnome-extensions install --force website-monitor@lefred.shell-extension.zip
```

Log out and back in after the first installation, then enable it:

```sh
gnome-extensions enable website-monitor@lefred
```

Open its settings with:

```sh
gnome-extensions prefs website-monitor@lefred
```

For development, changes can be tested in a nested GNOME Shell session or by
logging out and back in on Wayland.

## Screenshots

## v8

<img width="708" height="691" alt="gnome-shell-monito-site05" src="https://github.com/user-attachments/assets/ff78d61d-7d36-4882-af14-1f3b0f2b9bbc" /><br>

<img width="799" height="551" alt="gnome-shell-monito-site06" src="https://github.com/user-attachments/assets/6dde463f-bc65-48c9-ad02-b160276baf46" />


## v7

<img width="718" height="849" alt="gnome-shell-monito-site01" src="https://github.com/user-attachments/assets/a40a5148-343c-4a97-aa0f-4896bda4f92f" /><br>

<img width="718" height="849" alt="gnome-shell-monito-site02" src="https://github.com/user-attachments/assets/7b4d72c8-64f3-4f63-8b5d-47a844ccbfbf" /><br>

<img width="263" height="227" alt="gnome-shell-monito-site03" src="https://github.com/user-attachments/assets/d20659b2-c70b-4c7f-8814-c05caeae3cb8" /><br>

<img width="718" height="333" alt="gnome-shell-monito-site04" src="https://github.com/user-attachments/assets/db21baff-e061-492c-af36-aca879d767e4" />

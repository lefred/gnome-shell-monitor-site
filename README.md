# Website Monitor

A GNOME Shell 45+ extension that checks one website and displays a colored dot
in the top bar:

- green: available;
- orange: available, but slower than the configured threshold;
- red: unavailable, timed out, or returned an HTTP error.

Monitoring can be paused from a switch in the indicator menu. Pausing or
resuming resets the consecutive-failure counter.

After the configured number of consecutive failed checks (three by default), a
large modal alert appears in the center of the screen and the desktop warning
sound is played. A custom MP3 can be selected in the extension preferences.
The sound loops until the alert is dismissed. One alert is shown per outage; a
successful check resets it.

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

<img width="718" height="849" alt="gnome-shell-monito-site01" src="https://github.com/user-attachments/assets/a40a5148-343c-4a97-aa0f-4896bda4f92f" />

<img width="718" height="849" alt="gnome-shell-monito-site02" src="https://github.com/user-attachments/assets/7b4d72c8-64f3-4f63-8b5d-47a844ccbfbf" />

<img width="263" height="227" alt="gnome-shell-monito-site03" src="https://github.com/user-attachments/assets/d20659b2-c70b-4c7f-8814-c05caeae3cb8" />

<img width="718" height="333" alt="gnome-shell-monito-site04" src="https://github.com/user-attachments/assets/db21baff-e061-492c-af36-aca879d767e4" />




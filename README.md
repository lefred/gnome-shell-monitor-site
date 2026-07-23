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
